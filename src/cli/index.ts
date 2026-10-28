#!/usr/bin/env node
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
} from './report.js';
import { CliArgs, parseCliArgs } from './args.js';

const USAGE = `
BuildView CLI — Autonomous Architecture Mapping, Invariant & Change Planning Tool

Usage:
  npx buildview [command] [options] [target-directory]

Commands:
  scan [dir]     Scan codebase AST, detect dead code waste, and build DAG architecture map (default)
  plan [dir]     Plan technical architecture changes, calculate blast radius & migration steps
  check [dir]    Verify clean layer boundaries & circular dependency rules (CI/CD mode)
  help           Display this help screen

Options:
  --out <file>             Write the architecture artifact here (default: <dir>/buildview-architecture.json)
  --no-write               Do not write the architecture artifact
  --config <file>          Config file to use instead of buildview.config.json / package.json#buildview
  --port <n>               Dashboard port to print (default: $BUILDVIEW_PORT or 3333)

check options:
  --json                   Print a machine-readable report on stdout (nothing else)
  --fail-on <severity>     Fail on gaps at or above: low | medium | high | critical | none (default: low)
  --max-severity <sev>     Highest severity tolerated (e.g. medium = fail on high and critical)
  --baseline <file>        Ignore gaps already listed in this baseline file; only new gaps fail
  --update-baseline        Write the current gaps to the --baseline file and exit 0

Examples:
  npx buildview scan .
  npx buildview plan .
  npx buildview check . --fail-on high
  npx buildview check . --json --baseline buildview-baseline.json
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

  const store = new BuildViewStore();
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
      const allGaps = collectGaps(project);

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
  } catch (err: any) {
    console.error(`❌ BuildView execution error:`, err.message);
    process.exit(1);
  }
}

run();
