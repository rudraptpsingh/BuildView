import path from 'path';
import fs from 'fs';
import { normalizePath } from './glob.js';
import { isTestPath, isToolingPath } from './file-roles.js';
import type { FileEdge } from './dependency-graph.js';
import type { ParsedFileResult } from '../parser/repo-parser.js';
import { ReachabilityAnalyzer, type PhantomTestIdItem } from './reachability-analyzer.js';

export type TestLane = 'L1_unit' | 'L2_component' | 'L3_contract' | 'L4_platform' | 'L5_hardware' | 'L6_e2e';

export interface ImpactedTestItem {
  testFile: string;
  lane: TestLane;
  reason: 'direct_colocation' | 'reverse_import_dag' | 'testid_query' | 'changed_test';
  sourceFile: string;
  evidence: string;
}

export interface TestExecutionCommand {
  lane: TestLane;
  description: string;
  command: string;
  files: string[];
  estimatedDurationMs: number;
}

export interface TestMapResult {
  targetFiles: string[];
  impactedTests: ImpactedTestItem[];
  byLane: Record<TestLane, string[]>;
  commands: TestExecutionCommand[];
  summary: string;
}

export interface SpecRepairSuggestion {
  specFile: string;
  line?: number;
  deadTestId: string;
  kind: 'unmounted' | 'unknown';
  suggestedLiveTestId: string | null;
  confidence: number;
  reason: string;
  patchDiff?: string;
}

export interface SpecRepairResult {
  totalDeadSelectors: number;
  suggestions: SpecRepairSuggestion[];
  repairedCount: number;
}

function readFileSafe(repoPath: string, filePath: string, rawContent?: string): string {
  if (rawContent) return rawContent;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath);
  try {
    return fs.readFileSync(abs, 'utf-8');
  } catch {
    return '';
  }
}

export class TestIntelligenceEngine {
  /**
   * Computes the minimum set of impact tests across all architectural lanes (L1-L6)
   * using Reverse DAG reachability, co-location matching, and testid query correlation.
   */
  public static mapImpactedTests(
    repoPath: string,
    targetFiles: string[],
    parsedFiles: ParsedFileResult[],
    edges: FileEdge[]
  ): TestMapResult {
    const normTargets = new Set(targetFiles.map((f) => normalizePath(f)));

    // 1. Build forward and reverse adjacency maps
    const reverseAdj = new Map<string, Set<string>>(); // to -> Set(from)
    for (const e of edges) {
      if (!reverseAdj.has(e.to)) reverseAdj.set(e.to, new Set());
      reverseAdj.get(e.to)!.add(e.from);
    }

    const allFileMap = new Map<string, ParsedFileResult>();
    for (const pf of parsedFiles) {
      allFileMap.set(normalizePath(pf.filePath), pf);
    }

    // 2. Identify testids declared in target files
    const targetTestids = new Map<string, string>(); // testid -> sourceFile
    for (const target of normTargets) {
      const pf = allFileMap.get(target);
      if (!pf) continue;
      const content = readFileSafe(repoPath, pf.filePath, (pf as any).rawContent);
      const tidRegex = /(?:data-testid|\btestId)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{`([^`$]+)`\})/g;
      let m: RegExpExecArray | null;
      while ((m = tidRegex.exec(content)) !== null) {
        const id = m[1] || m[2] || m[3];
        if (id) targetTestids.set(id, target);
      }
    }

    // 3. Find impacted tests
    const impactedTests: ImpactedTestItem[] = [];
    const seenTests = new Set<string>();

    for (const target of normTargets) {
      // If target itself is a test file, it must be run
      if (isTestPath(target)) {
        if (!seenTests.has(target)) {
          seenTests.add(target);
          impactedTests.push({
            testFile: target,
            lane: this.classifyTestLane(target),
            reason: 'changed_test',
            sourceFile: target,
            evidence: `Test file itself was directly modified`,
          });
        }
        continue;
      }

      // Check co-located test files: e.g. foo.tsx -> foo.test.tsx, __tests__/foo.test.tsx
      const baseName = path.basename(target, path.extname(target));
      const dirName = path.dirname(target);
      const candidates = [
        path.join(dirName, `${baseName}.test.ts`),
        path.join(dirName, `${baseName}.test.tsx`),
        path.join(dirName, `${baseName}.spec.ts`),
        path.join(dirName, `${baseName}.spec.tsx`),
        path.join(dirName, '__tests__', `${baseName}.test.ts`),
        path.join(dirName, '__tests__', `${baseName}.test.tsx`),
      ].map((p) => normalizePath(p));

      for (const cand of candidates) {
        if (allFileMap.has(cand) && !seenTests.has(cand)) {
          seenTests.add(cand);
          impactedTests.push({
            testFile: cand,
            lane: this.classifyTestLane(cand),
            reason: 'direct_colocation',
            sourceFile: target,
            evidence: `Direct co-located unit test for ${target}`,
          });
        }
      }

      // Reverse DAG traversal: who imports target (directly or transitively)?
      const queue = [target];
      const visited = new Set<string>([target]);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const importers = reverseAdj.get(curr);
        if (!importers) continue;

        for (const imp of importers) {
          if (isTestPath(imp)) {
            if (!seenTests.has(imp)) {
              seenTests.add(imp);
              impactedTests.push({
                testFile: imp,
                lane: this.classifyTestLane(imp),
                reason: 'reverse_import_dag',
                sourceFile: target,
                evidence: `Imports ${curr} which depends on ${target}`,
              });
            }
          } else if (!visited.has(imp)) {
            visited.add(imp);
            queue.push(imp);
          }
        }
      }
    }

    // 4. TestID Query correlation: specs querying testids from target files
    if (targetTestids.size > 0) {
      for (const [filePath, pf] of allFileMap.entries()) {
        if (!isTestPath(filePath)) continue;
        const isE2e = filePath.includes('e2e') || filePath.includes('specs');
        if (!isE2e) continue;

        const content = readFileSafe(repoPath, pf.filePath, (pf as any).rawContent);
        for (const [tid, source] of targetTestids.entries()) {
          if (content.includes(tid) && !seenTests.has(filePath)) {
            seenTests.add(filePath);
            impactedTests.push({
              testFile: filePath,
              lane: 'L6_e2e',
              reason: 'testid_query',
              sourceFile: source,
              evidence: `Spec selects [data-testid="${tid}"] defined in ${source}`,
            });
            break;
          }
        }
      }
    }

    // 5. Bucket by lane
    const byLane: Record<TestLane, string[]> = {
      L1_unit: [],
      L2_component: [],
      L3_contract: [],
      L4_platform: [],
      L5_hardware: [],
      L6_e2e: [],
    };

    for (const t of impactedTests) {
      byLane[t.lane].push(t.testFile);
    }

    // 6. Generate executable commands
    const commands = this.buildExecutionCommands(repoPath, byLane);

    return {
      targetFiles,
      impactedTests,
      byLane,
      commands,
      summary: `Identified ${impactedTests.length} impacted test(s) across ${Object.values(byLane).filter((arr) => arr.length > 0).length} lane(s) for ${targetFiles.length} file(s).`,
    };
  }

  /**
   * Classifies a test file into an architectural testing lane.
   */
  public static classifyTestLane(filePath: string): TestLane {
    const norm = normalizePath(filePath).toLowerCase();

    // L5 Hardware / External Media
    if (
      norm.includes('driveprofile') ||
      norm.includes('hardware') ||
      norm.includes('external-disk') ||
      norm.includes('card-copy') ||
      norm.includes('remount')
    ) {
      return 'L5_hardware';
    }

    // L6 E2E Journeys
    if (norm.includes('/e2e/') || norm.includes('/specs/') || norm.includes('/captures/')) {
      return 'L6_e2e';
    }

    // L3 Architecture & Contracts
    if (norm.includes('script') || norm.includes('contract') || norm.includes('baseline') || norm.includes('liveness')) {
      return 'L3_contract';
    }

    // L4 Platform / Electron IPC / Workers
    if (norm.includes('/electron/') || norm.includes('/workers/') || norm.includes('ipc') || norm.includes('main.test')) {
      return 'L4_platform';
    }

    // L2 Component / DOM Testing
    if (norm.includes('/components/') || norm.endsWith('.test.tsx') || norm.endsWith('.spec.tsx')) {
      return 'L2_component';
    }

    // L1 Hermetic Unit
    return 'L1_unit';
  }

  /**
   * Builds targeted command lines for test execution.
   */
  private static buildExecutionCommands(repoPath: string, byLane: Record<TestLane, string[]>): TestExecutionCommand[] {
    const commands: TestExecutionCommand[] = [];

    // L1 Unit
    if (byLane.L1_unit.length > 0) {
      commands.push({
        lane: 'L1_unit',
        description: 'Run hermetic unit tests (<50ms)',
        command: `npx vitest run ${byLane.L1_unit.join(' ')}`,
        files: byLane.L1_unit,
        estimatedDurationMs: byLane.L1_unit.length * 50,
      });
    }

    // L2 Component
    if (byLane.L2_component.length > 0) {
      commands.push({
        lane: 'L2_component',
        description: 'Run React DOM component tests (<200ms)',
        command: `npx vitest run ${byLane.L2_component.join(' ')}`,
        files: byLane.L2_component,
        estimatedDurationMs: byLane.L2_component.length * 200,
      });
    }

    // L4 Platform (e.g. Electron config)
    if (byLane.L4_platform.length > 0) {
      const hasElectronConfig = fs.existsSync(path.join(repoPath, 'vitest.electron.config.ts'));
      commands.push({
        lane: 'L4_platform',
        description: 'Run native platform / IPC integration tests',
        command: hasElectronConfig
          ? `npx vitest run --config vitest.electron.config.ts ${byLane.L4_platform.join(' ')}`
          : `npx vitest run ${byLane.L4_platform.join(' ')}`,
        files: byLane.L4_platform,
        estimatedDurationMs: byLane.L4_platform.length * 500,
      });
    }

    // L5 Hardware
    if (byLane.L5_hardware.length > 0) {
      const hasElectronConfig = fs.existsSync(path.join(repoPath, 'vitest.electron.config.ts'));
      commands.push({
        lane: 'L5_hardware',
        description: 'Run real hardware & storage device verification',
        command: hasElectronConfig
          ? `npx vitest run --config vitest.electron.config.ts ${byLane.L5_hardware.join(' ')}`
          : `npx vitest run ${byLane.L5_hardware.join(' ')}`,
        files: byLane.L5_hardware,
        estimatedDurationMs: byLane.L5_hardware.length * 1000,
      });
    }

    // L6 E2E Playwright
    if (byLane.L6_e2e.length > 0) {
      commands.push({
        lane: 'L6_e2e',
        description: 'Run targeted E2E user journeys via Playwright',
        command: `npx playwright test ${byLane.L6_e2e.join(' ')}`,
        files: byLane.L6_e2e,
        estimatedDurationMs: byLane.L6_e2e.length * 8000,
      });
    }

    return commands;
  }

  /**
   * Analyzes dead/phantom selectors and suggests auto-healing live replacements.
   */
  public static suggestSpecRepairs(
    repoPath: string,
    parsedFiles: ParsedFileResult[],
    edges: FileEdge[],
    options: { autoApply?: boolean } = {}
  ): SpecRepairResult {
    const reach = ReachabilityAnalyzer.analyzeReachability(repoPath, parsedFiles, edges);
    const unmountedPhantoms = reach.phantomTestIds;

    // Collect all live testids
    const liveTestIds: string[] = [];
    const tidRegex = /(?:data-testid|\btestId)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{`([^`$]+)`\})/g;
    for (const rFile of reach.entrypoints) {
      // Find files reachable
    }

    // Extract all live testids from reachable files
    const allFileMap = new Map<string, ParsedFileResult>();
    for (const pf of parsedFiles) {
      allFileMap.set(normalizePath(pf.filePath), pf);
    }

    const reachableExact = new Set<string>();
    for (const pf of parsedFiles) {
      const content = readFileSafe(repoPath, pf.filePath, (pf as any).rawContent);
      let m: RegExpExecArray | null;
      while ((m = tidRegex.exec(content)) !== null) {
        const id = m[1] || m[2] || m[3];
        if (id) reachableExact.add(id);
      }
    }

    const liveArray = Array.from(reachableExact);
    const suggestions: SpecRepairSuggestion[] = [];
    let repairedCount = 0;

    for (const phantom of unmountedPhantoms) {
      const match = this.findClosestLiveMatch(phantom.testId, liveArray);
      let diff = undefined;

      if (match.candidate) {
        diff = `--- a/${phantom.specFile}\n+++ b/${phantom.specFile}\n@@ dead locator auto-repair @@\n- [data-testid="${phantom.testId}"]\n+ [data-testid="${match.candidate}"]`;

        if (options.autoApply) {
          const abs = path.isAbsolute(phantom.specFile) ? phantom.specFile : path.join(repoPath, phantom.specFile);
          if (fs.existsSync(abs)) {
            try {
              let src = fs.readFileSync(abs, 'utf-8');
              const oldPattern = new RegExp(`(['"])${phantom.testId}(['"])`, 'g');
              src = src.replace(oldPattern, `$1${match.candidate}$2`);
              fs.writeFileSync(abs, src, 'utf-8');
              repairedCount++;
            } catch {
              // ignore
            }
          }
        }
      }

      suggestions.push({
        specFile: phantom.specFile,
        deadTestId: phantom.testId,
        kind: phantom.kind,
        suggestedLiveTestId: match.candidate,
        confidence: match.score,
        reason: match.candidate
          ? `Closest live testid in shipping UI (similarity ${(match.score * 100).toFixed(0)}%)`
          : 'No closely matching live testid found; recommend mounting surface or pruning spec',
        patchDiff: diff,
      });
    }

    return {
      totalDeadSelectors: unmountedPhantoms.length,
      suggestions,
      repairedCount,
    };
  }

  /**
   * Computes string similarity between dead selector and candidate live selectors.
   */
  private static findClosestLiveMatch(target: string, candidates: string[]): { candidate: string | null; score: number } {
    let best: string | null = null;
    let highestScore = 0;

    const targetTokens = new Set(target.split(/[-_:]/).filter(Boolean));

    for (const cand of candidates) {
      if (cand === target) continue;
      const candTokens = new Set(cand.split(/[-_:]/).filter(Boolean));

      // Jaccard similarity of semantic tokens
      let intersection = 0;
      for (const t of targetTokens) {
        if (candTokens.has(t)) intersection++;
      }
      const union = new Set([...targetTokens, ...candTokens]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      // Common prefix calculation
      let commonPrefixLen = 0;
      const minLen = Math.min(target.length, cand.length);
      while (commonPrefixLen < minLen && target[commonPrefixLen] === cand[commonPrefixLen]) {
        commonPrefixLen++;
      }
      const prefixBonus = commonPrefixLen > 2 ? (commonPrefixLen / Math.max(target.length, cand.length)) * 0.4 : 0;

      const totalScore = jaccard * 0.6 + prefixBonus;
      if (totalScore > highestScore && totalScore >= 0.35) {
        highestScore = totalScore;
        best = cand;
      }
    }

    return { candidate: best, score: highestScore };
  }
}
