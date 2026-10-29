import fs from 'fs';
import path from 'path';
import { normalizePath } from './glob.js';
import { isTestPath, isToolingPath } from './file-roles.js';
import type { GapItem } from '../../shared/types.js';
import type { FileEdge } from './dependency-graph.js';
import type { ParsedFileResult } from '../parser/repo-parser.js';

export interface UnmountedComponentItem {
  file: string;
  name: string;
  testids: string[];
  linesOfCode: number;
}

export interface OrphanPreloadMethodItem {
  method: string;
  kind: 'invoke' | 'send' | 'sync' | 'property';
  evidence: string;
}

export interface PhantomTestIdItem {
  specFile: string;
  testId: string;
  kind: 'unmounted' | 'unknown';
  definedInUnmountedFile?: string;
}

export interface ReachabilityMetrics {
  totalEntrypoints: number;
  totalProductFiles: number;
  totalReachableFiles: number;
  totalUnmountedComponents: number;
  totalOrphanPreloadMethods: number;
  totalLiveTestids: number;
  totalPhantomTestIds: number;
  totalUnknownTestIds: number;
}

export interface ReachabilityResult {
  metrics: ReachabilityMetrics;
  entrypoints: string[];
  unmountedComponents: UnmountedComponentItem[];
  orphanPreloadMethods: OrphanPreloadMethodItem[];
  phantomTestIds: PhantomTestIdItem[];
  gaps: GapItem[];
}

const DEFAULT_ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.ts',
  'src/index.tsx',
  'src/index.ts',
  'src/App.tsx',
  'src/client/src/main.tsx',
  'src/client/src/App.tsx',
  'client-web/src/main.tsx',
  'client-web/src/App.tsx',
  'electron/main.ts',
  'electron/preload.ts',
  'workers/src/index.ts',
  'workers/index.ts',
  'mobile/src/index.tsx',
  'mobile/src/App.tsx',
  'mobile/App.tsx',
];

const TESTID_DEF_REGEX = /(?:data-testid|\b[a-zA-Z0-9_]*testId)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|\{`([^`$]+)`\})/gi;
const TESTID_PREFIX_PROP_REGEX = /\b(?:testIdPrefix|prefixTestId)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|\{`([^`$]+)`\})/gi;
const CONDITIONAL_TESTID_BLOCK_REGEX = /(?:data-testid|\b[a-zA-Z0-9_]*testId)\s*[:=]\s*\{([\s\S]*?)\}/g;
const INTERPOLATED_PREFIX_REGEX = /(?:data-testid|\b[a-zA-Z0-9_]*testId)\s*[:=]\s*\{`([^`]*?)\$\{/gi;

const SELECTOR_REGEXES = [
  /getByTestId\(\s*['"]([a-z0-9][a-z0-9-]*)['"]/g,
  /\[data-testid=["']([a-z0-9][a-z0-9-]*)["']\]/g,
  /testId:\s*['"]([a-z0-9][a-z0-9-]*)['"]/g,
];

const PRELOAD_EXPOSE_REGEX = /(?:contextBridge\.exposeInMainWorld\s*\(\s*['"](?:electronAPI|electron)['"]\s*,\s*\{|\bwindow\.(?:electronAPI|electron)\s*=\s*\{)([\s\S]*?)\n\s*\}\s*\)/;
const PRELOAD_METHOD_REGEX = /^\s*([a-zA-Z0-9_$]+)\s*:\s*(?:\([^)]*\)|async\s*\([^)]*\))\s*=>/gm;

export class ReachabilityAnalyzer {
  /**
   * Performs whole-repo DAG reachability, finding dead unmounted UI components,
   * phantom E2E testids, and orphan Electron preload bridge methods.
   */
  public static analyzeReachability(
    repoPath: string,
    parsedFiles: ParsedFileResult[],
    edges: FileEdge[],
    customEntrypoints?: string[]
  ): ReachabilityResult {
    const normRepo = normalizePath(repoPath);

    // 1. Identify product files and entrypoints
    const allFileMap = new Map<string, ParsedFileResult>();
    for (const pf of parsedFiles) {
      allFileMap.set(normalizePath(pf.filePath), pf);
    }

    const entryCandidates = customEntrypoints && customEntrypoints.length > 0 ? customEntrypoints : DEFAULT_ENTRY_CANDIDATES;
    const entrypoints: string[] = [];

    for (const ec of entryCandidates) {
      const norm = normalizePath(ec);
      if (allFileMap.has(norm) || fs.existsSync(path.join(repoPath, ec))) {
        entrypoints.push(norm);
      }
    }

    // Auto-discover file-based routing entrypoints (Expo Router, Next.js app directory, Remix routes)
    for (const [norm] of allFileMap.entries()) {
      if (
        (norm.includes('/app/') || norm.includes('/routes/')) &&
        (norm.endsWith('.tsx') || norm.endsWith('.jsx') || norm.endsWith('.ts')) &&
        !isTestPath(norm) &&
        !isToolingPath(norm) &&
        !entrypoints.includes(norm)
      ) {
        entrypoints.push(norm);
      }
    }

    // 2. Build adjacency map (only across non-test, non-tooling edges)
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (isTestPath(edge.from) || isTestPath(edge.to)) continue;
      if (!adj.has(edge.from)) adj.set(edge.from, new Set());
      adj.get(edge.from)!.add(edge.to);
    }

    // 3. Compute transitive closure from all entrypoints
    const reachable = new Set<string>();
    const queue: string[] = [...entrypoints];

    for (const ep of entrypoints) {
      reachable.add(ep);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr);
      if (!neighbors) continue;

      for (const next of neighbors) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    // 4. Extract testids helper
    function extractTestIdInfo(content: string): { exact: Set<string>; prefixes: string[] } {
      const exact = new Set<string>();
      const prefixes: string[] = [];

      let m: RegExpExecArray | null;
      const defRegex = new RegExp(TESTID_DEF_REGEX);
      while ((m = defRegex.exec(content)) !== null) {
        const val = m[1] || m[2] || m[3];
        if (val) exact.add(val);
      }

      const prefixPropRegex = new RegExp(TESTID_PREFIX_PROP_REGEX);
      while ((m = prefixPropRegex.exec(content)) !== null) {
        const val = m[1] || m[2] || m[3];
        if (val) {
          exact.add(val);
          prefixes.push(val);
          prefixes.push(`${val}-`);
        }
      }

      const blockRegex = new RegExp(CONDITIONAL_TESTID_BLOCK_REGEX);
      while ((m = blockRegex.exec(content)) !== null) {
        const block = m[1];
        if (block && (block.includes('?') || block.includes(':'))) {
          const strRegex = /['"]([a-zA-Z0-9_-]+)['"]/g;
          let sm: RegExpExecArray | null;
          while ((sm = strRegex.exec(block)) !== null) {
            if (sm[1]) exact.add(sm[1]);
          }
        }
      }

      const prefixRegex = new RegExp(INTERPOLATED_PREFIX_REGEX);
      while ((m = prefixRegex.exec(content)) !== null) {
        if (m[1]) {
          prefixes.push(m[1]);
          if (!m[1].endsWith('-')) prefixes.push(`${m[1]}-`);
        }
      }

      return { exact, prefixes };
    }

    // 5. Collect testids across reachable tree and entire src tree
    const unmountedComponents: UnmountedComponentItem[] = [];
    const unmountedTestIds = new Map<string, string>(); // testid -> file
    const reachableExact = new Set<string>();
    const reachablePrefixes: string[] = [];
    const everywhereExact = new Set<string>();
    const everywherePrefixes: string[] = [];

    for (const [normPath] of allFileMap.entries()) {
      if (isTestPath(normPath) || isToolingPath(normPath)) continue;

      const isUiComponent =
        (normPath.includes('/components/') ||
          normPath.includes('/views/') ||
          normPath.includes('/pages/') ||
          normPath.includes('/panels/')) &&
        (normPath.endsWith('.tsx') || normPath.endsWith('.jsx'));

      const absPath = path.isAbsolute(normPath) ? normPath : path.join(repoPath, normPath);
      let content = '';
      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch {
        continue;
      }

      const { exact, prefixes } = extractTestIdInfo(content);
      for (const e of exact) everywhereExact.add(e);
      for (const p of prefixes) everywherePrefixes.push(p);

      if (reachable.has(normPath)) {
        for (const e of exact) reachableExact.add(e);
        for (const p of prefixes) reachablePrefixes.push(p);
      } else {
        for (const tid of exact) {
          unmountedTestIds.set(tid, normPath);
        }
        if (isUiComponent) {
          unmountedComponents.push({
            file: normPath,
            name: path.basename(normPath, path.extname(normPath)),
            testids: Array.from(exact),
            linesOfCode: content.split('\n').length,
          });
        }
      }
    }

    // 6. Preload Bridge Reachability (Orphan Preload APIs)
    const orphanPreloadMethods: OrphanPreloadMethodItem[] = [];
    const preloadPath = path.join(repoPath, 'electron', 'preload.ts');

    if (fs.existsSync(preloadPath)) {
      try {
        const preloadContent = fs.readFileSync(preloadPath, 'utf-8');
        const exposeMatch = preloadContent.match(PRELOAD_EXPOSE_REGEX);
        const block = exposeMatch ? exposeMatch[1] : preloadContent;

        const methodRegex = new RegExp(PRELOAD_METHOD_REGEX);
        let methMatch: RegExpExecArray | null;
        const exposedMethods: string[] = [];

        while ((methMatch = methodRegex.exec(block)) !== null) {
          exposedMethods.push(methMatch[1]);
        }

        // Read all reachable renderer files
        const reachableRendererContent: string[] = [];
        for (const rPath of reachable) {
          if (rPath.startsWith('src/') || rPath.startsWith('client-web/src/')) {
            const abs = path.isAbsolute(rPath) ? rPath : path.join(repoPath, rPath);
            try {
              reachableRendererContent.push(fs.readFileSync(abs, 'utf-8'));
            } catch {
              // ignore
            }
          }
        }
        const fullRendererSource = reachableRendererContent.join('\n');

        for (const meth of exposedMethods) {
          // Check if method is called anywhere in reachable renderer (supporting optional chaining and local api aliases)
          const callRegex = new RegExp(`\\b(?:window\\.)?(?:electronAPI|electron|api)\\??\\.${meth}\\b|\\b${meth}\\s*:\\s*(?:window\\.)?(?:electronAPI|electron|api)\\b`);
          if (!callRegex.test(fullRendererSource)) {
            orphanPreloadMethods.push({
              method: meth,
              kind: 'invoke',
              evidence: `electron/preload.ts: "${meth}" is exposed on electronAPI but never called by any reachable renderer component`,
            });
          }
        }
      } catch {
        // ignore preload parse failure
      }
    }

    // 7. Dead & Phantom TestID Detection in E2E specs
    const isLive = (id: string) =>
      reachableExact.has(id) ||
      reachablePrefixes.some((p) => id === p || id.startsWith(p));

    const isEverywhere = (id: string) =>
      everywhereExact.has(id) ||
      everywherePrefixes.some((p) => id === p || id.startsWith(p));

    const phantomTestIds: PhantomTestIdItem[] = [];
    let unknownCount = 0;

    for (const [normPath] of allFileMap.entries()) {
      const isE2e =
        (normPath.includes('e2e') || normPath.includes('specs') || normPath.includes('captures')) &&
        (/\.spec\.(ts|tsx|js|jsx)$/.test(normPath) || /\.test\.(ts|tsx|js|jsx)$/.test(normPath));
      if (!isE2e) continue;

      const abs = path.isAbsolute(normPath) ? normPath : path.join(repoPath, normPath);
      let testContent = '';
      try {
        testContent = fs.readFileSync(abs, 'utf-8');
      } catch {
        continue;
      }

      for (const re of SELECTOR_REGEXES) {
        const queryRegex = new RegExp(re);
        let qm: RegExpExecArray | null;
        while ((qm = queryRegex.exec(testContent)) !== null) {
          const queried = qm[1];

          // Check if deliberate negative assertion like .toHaveCount(0), toBeNull(), or defensive guard
          const lineEnd = testContent.indexOf('\n', qm.index);
          const lineStart = testContent.lastIndexOf('\n', qm.index);
          const line = testContent.slice(lineStart + 1, lineEnd < 0 ? undefined : lineEnd);
          if (
            /\.toHaveCount\(0\)/.test(line) ||
            /toBeNull\(/.test(line) ||
            /\.count\(\)\s*>\s*0/.test(line) ||
            /not\.toBeInTheDocument/.test(line)
          ) {
            continue;
          }

          if (isLive(queried)) continue;

          if (isEverywhere(queried)) {
            // Unmounted: Component exists in tree but is not reachable from app entry
            phantomTestIds.push({
              specFile: normPath,
              testId: queried,
              kind: 'unmounted',
              definedInUnmountedFile: unmountedTestIds.get(queried),
            });
          } else {
            // Unknown: Selectors matching no testid in either tree (removed surface or dynamic)
            unknownCount++;
            phantomTestIds.push({
              specFile: normPath,
              testId: queried,
              kind: 'unknown',
            });
          }
        }
      }
    }

    const unmountedPhantoms = phantomTestIds.filter((p) => p.kind === 'unmounted');

    // 8. Architectural Gaps
    const gaps: GapItem[] = [];
    if (unmountedComponents.length > 0) {
      gaps.push({
        id: 'gap_unmounted_dead_components',
        title: `Liveness: ${unmountedComponents.length} UI component(s) are never mounted`,
        description:
          'Components exist in the presentation layer but have zero incoming import paths from application entrypoints. They increase bundle weight and accumulate dead code.',
        severity: 'medium',
        resolved: false,
        evidence: unmountedComponents.slice(0, 5).map((u) => u.file),
        kind: 'unmounted_component',
        resolutionNote: 'Mount the component in an active screen, or archive/prune it to eliminate dead code.',
      });
    }

    if (orphanPreloadMethods.length > 0) {
      gaps.push({
        id: 'gap_orphan_preload_methods',
        title: `Bridge Parity: ${orphanPreloadMethods.length} preload bridge method(s) have zero callers in UI`,
        description:
          'Methods are exposed on window.electronAPI but are never invoked by any mounted renderer component, indicating abandoned or incomplete features.',
        severity: 'medium',
        resolved: false,
        evidence: orphanPreloadMethods.slice(0, 5).map((o) => o.method),
        kind: 'orphan_preload_method',
        resolutionNote: 'Wire up the UI caller to utilize the IPC bridge, or remove unused preload bindings.',
      });
    }

    if (unmountedPhantoms.length > 0) {
      gaps.push({
        id: 'gap_phantom_testids',
        title: `E2E Integrity: ${unmountedPhantoms.length} test selector(s) query unmounted components`,
        description:
          'E2E specifications query data-testids from components that exist in the repository but have zero incoming paths from entrypoints. These journeys will timeout or fail.',
        severity: 'high',
        resolved: false,
        evidence: unmountedPhantoms.slice(0, 5).map((p) => `${p.specFile}: [data-testid="${p.testId}"]`),
        kind: 'phantom_testid_query',
        resolutionNote: 'Mount the component in an active screen, or repoint the spec at the shipping surface.',
      });
    }

    const totalProductFiles = Array.from(allFileMap.keys()).filter((f) => !isTestPath(f) && !isToolingPath(f)).length;

    return {
      metrics: {
        totalEntrypoints: entrypoints.length,
        totalProductFiles,
        totalReachableFiles: reachable.size,
        totalUnmountedComponents: unmountedComponents.length,
        totalOrphanPreloadMethods: orphanPreloadMethods.length,
        totalLiveTestids: reachableExact.size + reachablePrefixes.length,
        totalPhantomTestIds: unmountedPhantoms.length,
        totalUnknownTestIds: unknownCount,
      },
      entrypoints,
      unmountedComponents,
      orphanPreloadMethods,
      phantomTestIds,
      gaps,
    };
  }
}
