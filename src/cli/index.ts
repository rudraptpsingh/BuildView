#!/usr/bin/env node
import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { RepoScannerService } from '../server/repo-scanner-service.js';

const USAGE = `
BuildView CLI — Autonomous Architecture Mapping, Invariant & Change Planning Tool

Usage:
  npx buildview [command] [options] [target-directory]

Commands:
  scan [dir]     Scan codebase AST, detect dead code waste, and build DAG architecture map (default)
  plan [dir]     Plan technical architecture changes, calculate blast radius & migration steps
  check [dir]    Verify clean layer boundaries & circular dependency rules (CI/CD mode)
  help           Display this help screen

Examples:
  npx buildview scan .
  npx buildview plan .
  npx buildview check .
`;

async function run() {
  const args = process.argv.slice(2);
  let command = 'scan';
  let targetPath = '.';

  if (args.length > 0) {
    if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (args[0] === 'scan' || args[0] === 'check' || args[0] === 'plan') {
      command = args[0];
      targetPath = args[1] || '.';
    } else {
      // First argument is target path directly
      targetPath = args[0];
    }
  }

  const resolvedTarget = path.resolve(process.cwd(), targetPath);

  console.log('\n======================================================');
  console.log('⚡ BUILDVIEW ARCHITECTURE & AST WASTE TOOL');
  console.log(`📁 Target Repository: ${resolvedTarget}`);
  console.log(`🎯 Mode: ${command.toUpperCase()}`);
  console.log('======================================================\n');

  const store = new BuildViewStore();
  const startTime = Date.now();

  try {
    const project = await RepoScannerService.scanRepository(store, resolvedTarget);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const totalFiles = project.components.reduce((sum, c) => sum + c.files.length, 0);
    const totalLines = project.components.reduce((sum, c) => sum + (c.astMetrics?.linesOfCode || 0), 0);
    const totalTests = project.components.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0);
    const unresolvedGaps = project.components.flatMap((c) => c.gaps.filter((g) => !g.resolved));

    console.log(`\n======================================================`);
    console.log(`✅ SCAN COMPLETE (${elapsed}s)`);
    console.log(`📦 Project Name: ${project.name}`);
    console.log(`📊 Architectural Layers: ${project.layers.length}`);
    console.log(`🧩 Mapped Components: ${project.components.length}`);
    console.log(`📄 Source Files Parsed: ${totalFiles}`);
    console.log(`🔢 Lines of Code Tracked: ${totalLines.toLocaleString()}`);
    console.log(`🧪 Tests Correlated: ${totalTests}`);
    console.log(`⚠️ Active Gaps & Invariants: ${unresolvedGaps.length}`);

    if (project.figmaBridge && project.figmaBridge.totalMappedComponents > 0) {
      console.log(`🎨 Design System Mappings: ${project.figmaBridge.totalMappedComponents} Figma component(s) linked`);
    }

    console.log(`💾 Architecture Artifact: ${path.join(resolvedTarget, 'buildview-architecture.json')}`);
    console.log(`👉 View live dashboard: http://localhost:5173`);
    console.log('======================================================\n');

    if (command === 'plan') {
      const plan = store.createArchitecturePlan();
      console.log(`\n======================================================`);
      console.log(`🗺️  ARCHITECTURE CHANGE & MIGRATION PLAN`);
      console.log(`📋 Plan: ${plan.title}`);
      console.log(`🎯 Affected Components (Blast Radius): ${plan.affectedComponentIds.length}`);
      console.log(`======================================================`);
      for (const step of plan.steps) {
        const blast = store.getBlastRadius(step.targetComponentId);
        const actionTag = `[${step.action.toUpperCase()}]`;
        console.log(`\n  Step ${step.order}: ${actionTag} ${step.title}`);
        console.log(`     Target: ${step.targetComponentId}`);
        console.log(`     Blast Radius: ${blast.totalAffectedComponents} downstream component(s) (Risk: ${blast.riskLevel})`);
        if (blast.downstreamBreakageWarning) {
          console.log(`     ⚠️ Warning: ${blast.downstreamBreakageWarning}`);
        }
        if (step.verificationCriteria && step.verificationCriteria.length > 0) {
          console.log(`     Verification: ${step.verificationCriteria.join('; ')}`);
        }
      }
      console.log(`\n======================================================`);
      console.log(`💾 Plan persisted to store and broadcast to live visualizers`);
      console.log(`👉 Open http://localhost:5173 to track execution progress in real time.`);
      console.log(`======================================================\n`);
    }

    if (command === 'check' && unresolvedGaps.length > 0) {
      console.error(`❌ BuildView Invariant Check Failed: ${unresolvedGaps.length} architectural gap(s) detected.`);
      for (const gap of unresolvedGaps.slice(0, 10)) {
        console.error(`  - [${gap.severity.toUpperCase()}] ${gap.title}`);
      }
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`❌ BuildView execution error:`, err.message);
    process.exit(1);
  }
}

run();
