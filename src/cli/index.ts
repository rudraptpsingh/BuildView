#!/usr/bin/env node
import os from 'os';
import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { RepoScannerService } from '../server/repo-scanner-service.js';
import {
  applyBaseline,
  buildCheckReport,
  collectGaps,
  failingGaps,
  loadBaseline,
  resolveFailThreshold,
  resolvePort,
  writeBaseline,
  ReportedGap,
} from './report.js';
import { CliArgs, parseCliArgs } from './args.js';
import { AgentRemediationEngine } from '../server/analysis/agent-remediation.js';
import { RatchetManager, type BuildViewRatchetTotals } from '../server/analysis/ratchet-manager.js';
import { DesignRulesEngine } from '../server/analysis/design-rules.js';
import { PerformanceLinter } from '../server/analysis/performance-lint.js';
import { TestIntelligenceEngine } from '../server/analysis/test-intelligence.js';

const USAGE = `
BuildView CLI — Autonomous Architecture Mapping, Invariant & Change Planning Tool

Usage:
  npx buildview [command] [options] [target-directory]

Commands:
  scan [dir]         Scan codebase AST, detect dead code waste, and build DAG architecture map (default)
  plan [dir]         Plan technical architecture changes, calculate blast radius & migration steps
  check [dir]        Verify clean layer boundaries & circular dependency rules (CI/CD mode)
  ratchet [dir]      Enforce monotonic architectural debt reduction across tokens, classes, and I/O
  reachability [dir] Detect unmounted UI components, orphan preload bridge methods, and phantom testids
  test-map [dir]     Compute minimal impact test set (L1-L6) and execution commands using reverse DAG
  repair-specs [dir] Auto-heal dead spec locators with semantic live surface matches
  remediate [dir]    Generate token-budgeted surgical prompt cards for AI coding agents
  help               Display this help screen

Options:
  --out <file>             Write the architecture artifact here (default: <dir>/buildview-architecture.json)
  --no-write               Do not write the architecture artifact
  --config <file>          Config file to use instead of buildview.config.json / package.json#buildview
  --port <n>               Dashboard port to print (default: $BUILDVIEW_PORT or 3333)

ratchet options:
  --mode <enforce|update|report>  Enforce monotonic drop, update baseline, or report deltas (default: enforce)
  --baseline <file>               Baseline file to track (default: .buildview-baseline.json)

check options:
  --json                   Print a machine-readable report on stdout (nothing else)
  --fail-on <severity>     Fail on gaps at or above: low | medium | high | critical | none (default: low)
  --max-severity <sev>     Highest severity tolerated (e.g. medium = fail on high and critical)
  --baseline <file>        Ignore gaps already listed in this baseline file; only new gaps fail
  --update-baseline        Write the current gaps to the --baseline file and exit 0

remediate options:
  --gap-id <id>            Generate card for a specific gap ID (default: highest severity unresolved gap)
  --format <agent-prompt|json>  Output format (default: agent-prompt)
  --budget <tokens>        Maximum prompt token budget (default: 450)

Examples:
  npx buildview scan .
  npx buildview ratchet . --mode=enforce
  npx buildview reachability .
  npx buildview check . --fail-on high
  npx buildview remediate . --gap-id gap_cycle_1
`;

async function run() {
  let args: CliArgs | 'help';
  let port: number;
  let failOn: ReturnType<typeof resolveFailThreshold>;
  try {
    args = parseCliArgs(process.argv.slice(2));
    if (args === 'help') {
      console.log(USAGE);
      process.exit(0);
    }
    port = resolvePort(args.port);
    failOn = resolveFailThreshold(args.failOn, args.maxSeverity);
  } catch (err: any) {
    console.error(`❌ ${err.message}\n${USAGE}`);
    process.exit(2);
  }

  const { command, json } = args;
  const resolvedTarget = path.resolve(process.cwd(), args.target);
  // In --json mode stdout carries only the report.
  const log = json ? (..._m: unknown[]) => {} : (...m: unknown[]) => console.log(...m);

  log('\n======================================================');
  log('⚡ BUILDVIEW ARCHITECTURE & AST WASTE TOOL');
  log(`📁 Target Repository: ${resolvedTarget}`);
  log(`🎯 Mode: ${command.toUpperCase()}`);
  log('======================================================\n');

  // check is read-only: keep the store's state file out of the working directory.
  const store = new BuildViewStore(command === 'check' ? path.join(os.tmpdir(), 'buildview-check-store') : undefined);
  const startTime = Date.now();

  try {
    const result = await RepoScannerService.scanRepositoryDetailed(store, resolvedTarget, {
      configPath: args.config,
      outputPath: args.noWrite ? false : args.out,
    });
    const project = result.project;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const totalFiles = project.components.reduce((sum, c) => sum + c.files.length, 0);
    const totalLines = project.components.reduce((sum, c) => sum + (c.astMetrics?.linesOfCode || 0), 0);
    const totalTests = project.components.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0);
    const unresolvedGaps = project.components.flatMap((c) => c.gaps.filter((g) => !g.resolved));

    log(`\n======================================================`);
    log(`✅ SCAN COMPLETE (${elapsed}s)`);
    log(`📦 Project Name: ${project.name}`);
    if (result.configSource) log(`⚙️  Config: ${result.configSource}`);
    log(`📊 Architectural Layers: ${project.layers.length}`);
    log(`🧩 Mapped Components: ${project.components.length}`);
    log(`📄 Source Files Parsed: ${totalFiles}`);
    log(`🔢 Lines of Code Tracked: ${totalLines.toLocaleString()}`);
    log(`🧪 Tests Correlated: ${totalTests}`);
    log(`⚠️ Active Gaps & Invariants: ${unresolvedGaps.length}`);
    if (project.healthScore) {
      log(`🎖️ Architectural Health: ${project.healthScore.overallScore}/100 [Grade: ${project.healthScore.grade}]`);
    }

    if (project.figmaBridge && project.figmaBridge.totalMappedComponents > 0) {
      log(`🎨 Design System Mappings: ${project.figmaBridge.totalMappedComponents} Figma component(s) linked`);
    }

    log(`💾 Architecture Artifact: ${result.artifactPath ?? '(not written)'}`);
    log(`👉 View live dashboard: http://localhost:${port}`);
    log('======================================================\n');

    if (command === 'plan') {
      const plan = store.createArchitecturePlan();
      log(`\n======================================================`);
      log(`🗺️  ARCHITECTURE CHANGE & MIGRATION PLAN`);
      log(`📋 Plan: ${plan.title}`);
      log(`🎯 Affected Components (Blast Radius): ${plan.affectedComponentIds.length}`);
      log(`======================================================`);
      for (const step of plan.steps) {
        const blast = store.getBlastRadius(step.targetComponentId);
        const actionTag = `[${step.action.toUpperCase()}]`;
        log(`\n  Step ${step.order}: ${actionTag} ${step.title}`);
        log(`     Target: ${step.targetComponentId}`);
        log(`     Blast Radius: ${blast.totalAffectedComponents} downstream component(s) (Risk: ${blast.riskLevel})`);
        if (blast.downstreamBreakageWarning) {
          log(`     ⚠️ Warning: ${blast.downstreamBreakageWarning}`);
        }
        if (step.verificationCriteria && step.verificationCriteria.length > 0) {
          log(`     Verification: ${step.verificationCriteria.join('; ')}`);
        }
      }
      log(`\n======================================================`);
      log(`💾 Plan persisted to store and broadcast to live visualizers`);
      log(`👉 Open http://localhost:${port} to track execution progress in real time.`);
      log(`======================================================\n`);
    }

    if (command === 'check') {
      const baselinePath = args.baseline ? path.resolve(process.cwd(), args.baseline) : null;
      const allGaps: ReportedGap[] = collectGaps(project);

      if (args.updateBaseline && baselinePath) {
        writeBaseline(baselinePath, allGaps);
        if (json) console.log(JSON.stringify({ tool: 'buildview', baselineWritten: baselinePath, gaps: allGaps.length }, null, 2));
        else console.log(`📌 Baseline written: ${baselinePath} (${allGaps.length} gap(s))`);
        return;
      }

      const baseline = baselinePath ? loadBaseline(baselinePath) : null;
      const gaps = applyBaseline(allGaps, baseline);
      if (baselinePath && !baseline) {
        log(`ℹ️  Baseline ${baselinePath} not found; every gap counts as new (create it with --update-baseline).`);
      }
      const report = buildCheckReport({
        target: resolvedTarget,
        gaps,
        failOn,
        baselinePath,
        unusedExports: result.waste.repoWaste.unusedExportDetails || [],
        orphanFiles: result.waste.allOrphanFiles,
        artifact: result.artifactPath,
        healthScore: project.healthScore,
      });

      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        const s = report.summary;
        console.log(
          `🔎 Gaps: ${s.gaps} (critical ${s.bySeverity.critical}, high ${s.bySeverity.high}, medium ${s.bySeverity.medium}, low ${s.bySeverity.low})` +
            (baselinePath ? `, ${s.baselinedGaps} baselined, ${s.newGaps} new` : '')
        );
        console.log(`🧹 Unused exports: ${s.unusedExports.dead} dead, ${s.unusedExports.localOnly} only used in their own file; ${s.orphanFiles} orphan file(s)`);
        if (project.healthScore) {
          console.log(`🎖️ Health Score: ${project.healthScore.overallScore}/100 [Grade: ${project.healthScore.grade}]`);
        }
      }

      const failing = failingGaps(gaps, failOn);
      if (failing.length > 0) {
        if (!json) {
          console.error(`❌ BuildView Invariant Check Failed: ${failing.length} architectural gap(s) at or above "${failOn}".`);
          for (const gap of failing.slice(0, 10)) {
            console.error(`  - [${gap.severity.toUpperCase()}] ${gap.title}`);
            for (const ev of gap.evidence.slice(0, 3)) console.error(`      ${ev}`);
          }
          if (failing.length > 10) console.error(`  … and ${failing.length - 10} more (use --json for the full list)`);
        }
        process.exit(1);
      } else if (!json) {
        console.log(`✅ BuildView Invariant Check Passed (fail-on: ${failOn}).`);
      }
    }

    if (command === 'remediate') {
      const allGaps = project.components.flatMap((c) => c.gaps.filter((g) => !g.resolved));
      if (allGaps.length === 0) {
        if (json || args.format === 'json') {
          console.log(JSON.stringify({ status: 'clean', message: 'No unresolved architectural gaps found.', cards: [] }, null, 2));
        } else {
          console.log(`\n🎉 Architecture Clean: Zero unresolved architectural gaps found in ${project.name}!`);
        }
        return;
      }

      let targetGap = allGaps[0];
      if (args.gapId) {
        const found = allGaps.find((g) => g.id === args.gapId);
        if (!found) {
          console.error(`❌ Gap ID "${args.gapId}" not found. Available gaps: ${allGaps.map((g) => g.id).join(', ')}`);
          process.exit(1);
        }
        targetGap = found;
      } else {
        const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        allGaps.sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0));
        targetGap = allGaps[0];
      }

      const budget = args.budget ? parseInt(args.budget, 10) : 450;
      const card = AgentRemediationEngine.generateCard(targetGap, {
        tokenBudget: budget,
        verificationCmd: 'npx buildview check',
      });

      if (json || args.format === 'json') {
        console.log(JSON.stringify(card, null, 2));
      } else {
        console.log(`\n======================================================`);
        console.log(`🤖 AI AGENT SURGICAL REMEDIATION PROMPT CARD`);
        console.log(`🎯 Target Gap: ${card.gapId} [${card.severity.toUpperCase()}]`);
        console.log(`⚡ Token Budget: ~${card.tokenCostEstimate} tokens (Saved ~${card.tokenSavingsVsRawDump.toLocaleString()} tokens vs raw AST dump)`);
        console.log(`======================================================\n`);
        console.log(card.agentPromptText);
        console.log(`\n======================================================`);
        console.log(`👉 Copy and paste the prompt above directly into Claude Code, Gemini CLI, Cursor, or Codex.`);
        console.log(`======================================================\n`);
      }
    }

    if (command === 'ratchet') {
      const designRes = DesignRulesEngine.analyzeDesignRules(resolvedTarget, project.components, { enforceTestIds: true });
      const perfRes = PerformanceLinter.analyzePerformance(resolvedTarget, project.components);

      const currentTotals: BuildViewRatchetTotals = {
        colorLiterals: designRes.metrics.totalColorLiterals,
        offScaleHeights: designRes.metrics.totalOffScaleHeights,
        offScaleTypeSizes: designRes.metrics.totalOffScaleTypeSizes,
        iconLiterals: designRes.metrics.totalIconLiterals,
        arbitraryClasses: designRes.metrics.totalArbitraryClasses,
        unmergedDynamicClasses: designRes.metrics.totalUnmergedDynamicClasses,
        syncIoCalls: perfRes.metrics.syncFsInUiCount + perfRes.metrics.syncExecCount + perfRes.metrics.syncIpcCount,
        missingTestIds: designRes.metrics.totalMissingTestIds,
      };

      const ratchetMode = (args.mode as any) || (args.updateBaseline ? 'update' : 'enforce');
      const ratchetResult = RatchetManager.checkRatchet(resolvedTarget, currentTotals, {
        mode: ratchetMode,
        baselineFile: args.baseline,
      });

      if (json) {
        console.log(JSON.stringify(ratchetResult, null, 2));
      } else {
        console.log(`\n======================================================`);
        console.log(`📊 ARCHITECTURAL DEBT MONOTONIC RATCHET`);
        console.log(`🎯 Mode: ${ratchetMode.toUpperCase()} | Baseline: ${path.basename(ratchetResult.baselinePath)}`);
        console.log(`======================================================\n`);
        console.log(ratchetResult.summary);
        console.log('\nDebt Metrics Breakdown:');
        for (const d of ratchetResult.deltas) {
          const icon = d.status === 'regressed' ? '❌' : d.status === 'improved' ? '✨' : '🔹';
          const sign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
          console.log(`  ${icon} ${d.category.padEnd(24)} current: ${d.current.toString().padStart(4)} | baseline: ${d.baseline.toString().padStart(4)} | delta: ${sign}`);
        }
        console.log(`\n======================================================\n`);
      }

      if (!ratchetResult.passed) {
        process.exit(1);
      }
    }

    if (command === 'reachability') {
      const reach = result.reachability;
      if (json) {
        console.log(JSON.stringify(reach, null, 2));
      } else {
        console.log(`\n======================================================`);
        console.log(`🔍 WHOLE-REPO REACHABILITY & LIVENESS AUDIT`);
        console.log(`🎯 Root Entrypoints: ${reach.entrypoints.join(', ')}`);
        console.log(`======================================================\n`);
        console.log(`📦 Product Files: ${reach.metrics.totalProductFiles} total, ${reach.metrics.totalReachableFiles} reachable from entrypoints`);
        console.log(`👻 Unmounted UI Components: ${reach.metrics.totalUnmountedComponents}`);
        for (const u of reach.unmountedComponents.slice(0, 10)) {
          console.log(`   - [UNMOUNTED] ${u.name} (${u.file}) - ${u.linesOfCode} lines, testids: [${u.testids.join(', ')}]`);
        }
        console.log(`\n🌉 Orphan Preload Bridge APIs: ${reach.metrics.totalOrphanPreloadMethods}`);
        for (const o of reach.orphanPreloadMethods.slice(0, 10)) {
          console.log(`   - [ORPHAN BRIDGE] window.electronAPI.${o.method} (0 renderer callers)`);
        }
        console.log(`\n🎯 Phantom E2E TestIDs: ${reach.metrics.totalPhantomTestIds}`);
        const unmountedPhantoms = reach.phantomTestIds.filter((p) => p.kind === 'unmounted');
        if (unmountedPhantoms.length > 0) {
          for (const p of unmountedPhantoms.slice(0, 10)) {
            console.log(`   - [PHANTOM TESTID] "${p.testId}" queried in ${p.specFile}${p.definedInUnmountedFile ? ` (defined in unmounted ${p.definedInUnmountedFile})` : ''}`);
          }
        } else {
          console.log(`   ✨ Zero E2E test queries target dead/unmounted components.`);
        }
        console.log(`\n======================================================\n`);
      }

      if (args.fixTestids) {
        const repair = TestIntelligenceEngine.suggestSpecRepairs(resolvedTarget, result.parsedFiles, result.fileEdges, {
          autoApply: args.apply,
        });

        if (json) {
          console.log(JSON.stringify(repair, null, 2));
        } else {
          console.log(`\n======================================================`);
          console.log(`🩹 BUILDVIEW E2E SPEC AUTO-REPAIR & HEALING`);
          console.log(`🎯 Dead Selectors Found: ${repair.totalDeadSelectors} | Auto-Repaired: ${repair.repairedCount}`);
          console.log(`======================================================\n`);
          for (const sug of repair.suggestions) {
            console.log(`• Dead Locator: "${sug.deadTestId}" in ${sug.specFile}`);
            if (sug.suggestedLiveTestId) {
              console.log(`  👉 Suggestion: replace with "${sug.suggestedLiveTestId}" (confidence: ${(sug.confidence * 100).toFixed(0)}%)`);
              if (sug.patchDiff) {
                console.log(`     Diff:\n${sug.patchDiff.split('\n').map((l) => '       ' + l).join('\n')}`);
              }
            } else {
              console.log(`  ⚠️  ${sug.reason}`);
            }
            console.log('');
          }
          if (args.apply) {
            console.log(`✅ Applied ${repair.repairedCount} spec locator repair(s) directly to disk.`);
          } else if (repair.suggestions.some((s) => s.suggestedLiveTestId)) {
            console.log(`💡 Run with --apply to automatically rewrite these spec locators in place.`);
          }
          console.log(`======================================================\n`);
        }
      }

      if (reach.gaps.some((g) => g.severity === 'high' || g.severity === 'critical')) {
        process.exit(1);
      }
    }

    if (command === 'test-map') {
      let targets: string[] = [];
      if (args.extraPositionals && args.extraPositionals.length > 0) {
        targets = args.extraPositionals;
      } else {
        // Try git diff in target repo
        try {
          const { execSync } = await import('child_process');
          const gitOut = execSync('git diff --name-only HEAD~1', { cwd: resolvedTarget, encoding: 'utf-8' });
          targets = gitOut.split('\n').map((s) => s.trim()).filter(Boolean);
        } catch {
          // fallback to entrypoints
          targets = result.reachability.entrypoints.slice(0, 3);
        }
      }

      if (targets.length === 0) {
        targets = result.reachability.entrypoints.slice(0, 3);
      }

      const parsedFiles = result.parsedFiles;
      const testMap = TestIntelligenceEngine.mapImpactedTests(resolvedTarget, targets, parsedFiles, result.fileEdges);

      if (json) {
        console.log(JSON.stringify(testMap, null, 2));
      } else {
        console.log(`\n======================================================`);
        console.log(`🧭 BUILDVIEW REVERSE-DAG TEST IMPACT MAPPER`);
        console.log(`🎯 Targets (${testMap.targetFiles.length}): ${testMap.targetFiles.join(', ')}`);
        console.log(`======================================================\n`);
        console.log(`📊 Impacted Tests by Architectural Lane:`);
        for (const [lane, files] of Object.entries(testMap.byLane)) {
          if (files.length > 0) {
            console.log(`  🔹 [${lane.toUpperCase()}] (${files.length} test files):`);
            for (const f of files.slice(0, 5)) {
              console.log(`     - ${f}`);
            }
            if (files.length > 5) console.log(`     ... and ${files.length - 5} more`);
          }
        }
        console.log(`\n⚡ Recommended Sub-Second Execution Plan:`);
        for (const cmd of testMap.commands) {
          console.log(`  ▶️  [${cmd.lane}] ${cmd.description}`);
          console.log(`      $ ${cmd.command}\n`);
        }
        console.log(`======================================================\n`);
      }
      return;
    }

    if (command === 'repair-specs' || (command === 'reachability' && args.fixTestids)) {
      const parsedFiles = result.parsedFiles;
      const repair = TestIntelligenceEngine.suggestSpecRepairs(resolvedTarget, parsedFiles, result.fileEdges, {
        autoApply: args.apply,
      });

      if (json) {
        console.log(JSON.stringify(repair, null, 2));
      } else {
        console.log(`\n======================================================`);
        console.log(`🩹 BUILDVIEW E2E SPEC AUTO-REPAIR & HEALING`);
        console.log(`🎯 Dead Selectors Found: ${repair.totalDeadSelectors} | Auto-Repaired: ${repair.repairedCount}`);
        console.log(`======================================================\n`);
        for (const sug of repair.suggestions) {
          console.log(`• Dead Locator: "${sug.deadTestId}" in ${sug.specFile}`);
          if (sug.suggestedLiveTestId) {
            console.log(`  👉 Suggestion: replace with "${sug.suggestedLiveTestId}" (confidence: ${(sug.confidence * 100).toFixed(0)}%)`);
            if (sug.patchDiff) {
              console.log(`     Diff:\n${sug.patchDiff.split('\n').map((l) => '       ' + l).join('\n')}`);
            }
          } else {
            console.log(`  ⚠️  ${sug.reason}`);
          }
          console.log('');
        }
        if (args.apply) {
          console.log(`✅ Applied ${repair.repairedCount} spec locator repair(s) directly to disk.`);
        } else if (repair.suggestions.some((s) => s.suggestedLiveTestId)) {
          console.log(`💡 Run with --apply to automatically rewrite these spec locators in place.`);
        }
        console.log(`======================================================\n`);
      }
      return;
    }
  } catch (err: any) {
    console.error(`❌ BuildView execution error:`, err.message);
    process.exit(1);
  }
}

run();
