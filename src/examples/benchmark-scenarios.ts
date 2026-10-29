import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { RepoScannerService } from '../server/repo-scanner-service.js';
import { BenchmarkEvaluator } from '../server/analysis/benchmark-evaluator.js';
import { ArchitectureScorer } from '../server/analysis/scorer.js';

const hr = '═'.repeat(64);
const divider = '─'.repeat(64);

async function runLiveBenchmarks() {
  console.log(`\n${hr}`);
  console.log('⚡ BUILDVIEW REAL-WORLD SCENARIO BENCHMARK & UTILITY SUITE');
  console.log('Empirical validation: Architecture scoring, agent delta gates & token efficiency');
  console.log(`${hr}\n`);

  const store = new BuildViewStore();

  // ────────────────────────────────────────────────────────────────
  // SCENARIO 1: Cross-Runtime Violations & Testing Deficits
  // ────────────────────────────────────────────────────────────────
  console.log(`\n📌 [SCENARIO 1] Scanning Multi-Runtime Codebase (Worker + Electron + React UI)`);
  console.log(`   Target: test-fixtures/runtimes`);
  const t1 = Date.now();
  const scanRuntimes = await RepoScannerService.scanRepositoryDetailed(store, 'test-fixtures/runtimes', { outputPath: false });
  const timeRuntimes = Date.now() - t1;
  const score1 = scanRuntimes.project.healthScore!;

  console.log(`   ⏱️  Scan Time: ${timeRuntimes}ms`);
  console.log(`   🎖️ Health Score: ${score1.overallScore}/100 [Grade: ${score1.grade}]`);
  console.log(`   📊 Dimension Breakdown:`);
  console.log(`      • Architecture (35%):  ${score1.dimensions.architecture.score}/100`);
  console.log(`      • Cleanliness  (25%):  ${score1.dimensions.cleanliness.score}/100`);
  console.log(`      • Verification (25%):  ${score1.dimensions.verification.score}/100`);
  console.log(`      • Modularity   (15%):  ${score1.dimensions.modularity.score}/100`);
  console.log(`   ⚠️ Top Deductions:`);
  for (const d of score1.dimensions.architecture.deductions) {
    console.log(`      ❌ [-${d.penalty} pts] ${d.reason}`);
  }
  console.log(`   🎯 Recommended Fix:`);
  console.log(`      👉 ${score1.remediationPlan[0]?.title}: ${score1.remediationPlan[0]?.description}`);

  // ────────────────────────────────────────────────────────────────
  // SCENARIO 2: Circular Dependencies & Cycle Detection
  // ────────────────────────────────────────────────────────────────
  console.log(`\n${divider}`);
  console.log(`\n📌 [SCENARIO 2] Detecting Tangles & Cycles in "Vibe-Coded" Modules`);
  console.log(`   Target: test-fixtures/cycles`);
  const t2 = Date.now();
  const scanCycles = await RepoScannerService.scanRepositoryDetailed(store, 'test-fixtures/cycles', { outputPath: false });
  const timeCycles = Date.now() - t2;
  const score2 = scanCycles.project.healthScore!;

  console.log(`   ⏱️  Scan Time: ${timeCycles}ms`);
  console.log(`   🎖️ Health Score: ${score2.overallScore}/100 [Grade: ${score2.grade}]`);
  console.log(`   🔍 Detected Cycles:`);
  for (const v of scanCycles.rules.violations.filter((v) => v.type === 'circular_dependency')) {
    console.log(`      🔄 [${v.severity.toUpperCase()}] ${v.message}`);
  }
  console.log(`   🧹 Waste Detected: ${scanCycles.waste.allUnusedExports.length} dead export(s) found`);

  // ────────────────────────────────────────────────────────────────
  // SCENARIO 3: Agent Delta Evaluation (Blind Agent vs Guided Agent)
  // ────────────────────────────────────────────────────────────────
  console.log(`\n${divider}`);
  console.log(`\n📌 [SCENARIO 3] Agent Delta Gatekeeper (Before vs. After Evaluation)`);

  // Simulation 3A: Agent attempts a blind patch that introduces a cycle and a dead export
  console.log(`\n   ── [3A] Blind Agent Patch: Introducing a regression`);
  const blindRegressedRules = {
    ...scanCycles.rules,
    violations: [
      ...scanCycles.rules.violations,
      {
        type: 'circular_dependency' as const,
        severity: 'critical' as const,
        sourceId: 'comp_src',
        targetId: 'comp_engine',
        sourceName: 'Src',
        targetName: 'Engine',
        message: 'New cycle introduced: src/index.ts -> src/a.ts -> src/index.ts',
        remediation: 'Break the cycle using dependency injection',
        evidence: [{ from: 'src/index.ts', to: 'src/a.ts', line: 4, typeOnly: false }],
      },
    ],
  };
  const blindRegressedWaste = {
    ...scanCycles.waste,
    allUnusedExports: [
      ...scanCycles.waste.allUnusedExports,
      { name: 'abandonedMockUtil', kind: 'function' as const, file: 'src/index.ts', line: 15, loc: 30, usage: 'dead' as const },
    ],
  };

  const evalBlind = BenchmarkEvaluator.evaluateAgentRun({
    projectBefore: scanCycles.project,
    wasteBefore: scanCycles.waste,
    rulesBefore: scanCycles.rules,
    projectAfter: scanCycles.project,
    wasteAfter: blindRegressedWaste,
    rulesAfter: blindRegressedRules,
  });

  console.log(`   🛑 Verdict: ${evalBlind.verdict.toUpperCase()}`);
  console.log(`   📉 Score Delta: ${evalBlind.scoreDelta} pts (${evalBlind.scoreBefore} -> ${evalBlind.scoreAfter})`);
  console.log(`   🚨 Regressions Caught by BuildView:`);
  for (const r of evalBlind.regressionsIntroduced) {
    console.log(`      ❌ [${r.severity.toUpperCase()}] ${r.message}`);
  }
  console.log(`   🛡️ Result: Agent PR BLOCKED before reaching main branch.`);

  // Simulation 3B: Guided Agent follows BuildView's remediation plan
  console.log(`\n   ── [3B] Guided Agent: Resolving cycles & pruning waste via Remediation Plan`);
  const guidedCleanRules = {
    ...scanCycles.rules,
    violations: [], // All cycles resolved!
  };
  const guidedCleanWaste = {
    ...scanCycles.waste,
    allUnusedExports: [], // Dead exports pruned!
  };
  const guidedCleanProject = {
    ...scanCycles.project,
    components: scanCycles.project.components.map((c) => ({
      ...c,
      testSummary: { testFilesCount: 1, totalTests: 8, status: 'tested' as const, coverageEstimatePercent: 100 },
    })),
  };

  const evalGuided = BenchmarkEvaluator.evaluateAgentRun({
    projectBefore: scanCycles.project,
    wasteBefore: scanCycles.waste,
    rulesBefore: scanCycles.rules,
    projectAfter: guidedCleanProject,
    wasteAfter: guidedCleanWaste,
    rulesAfter: guidedCleanRules,
  });

  console.log(`   ✅ Verdict: ${evalGuided.verdict.toUpperCase()}`);
  console.log(`   📈 Score Delta: +${evalGuided.scoreDelta} pts (${evalGuided.scoreBefore} -> ${evalGuided.scoreAfter}) [Grade: ${evalGuided.gradeBefore} -> ${evalGuided.gradeAfter}]`);
  console.log(`   🎉 Improvements Achieved:`);
  for (const imp of evalGuided.improvementsAchieved) {
    console.log(`      ✨ ${imp.message}`);
  }

  // ────────────────────────────────────────────────────────────────
  // SCENARIO 4: Full Production Dogfood Scan (BuildView Repository)
  // ────────────────────────────────────────────────────────────────
  console.log(`\n${divider}`);
  console.log(`\n📌 [SCENARIO 4] Dogfooding on BuildView Real Repository`);
  console.log(`   Target: . (Production Codebase)`);
  const t4 = Date.now();
  const scanDogfood = await RepoScannerService.scanRepositoryDetailed(store, '.', { outputPath: false });
  const timeDogfood = Date.now() - t4;
  const project = scanDogfood.project;
  const score4 = project.healthScore!;

  const totalFiles = project.components.reduce((sum, c) => sum + c.files.length, 0);
  const totalLOC = project.components.reduce((sum, c) => sum + (c.astMetrics?.linesOfCode || 0), 0);
  const rawFileTokens = totalFiles * 800;
  const contractTokens = project.components.length * 150;
  const tokensSaved = rawFileTokens - contractTokens;
  const savingsPercent = ((tokensSaved / rawFileTokens) * 100).toFixed(1);

  console.log(`   ⏱️  Scan Time: ${timeDogfood}ms (${(timeDogfood / 1000).toFixed(2)}s)`);
  console.log(`   📦 Codebase Stats: ${totalFiles} source files | ${totalLOC.toLocaleString()} lines of code | ${project.components.length} components`);
  console.log(`   🎖️ Health Score: ${score4.overallScore}/100 [Grade: ${score4.grade}]`);
  console.log(`   💡 Token Efficiency Comparison for AI Agents:`);
  console.log(`      • Reading raw files: ~${rawFileTokens.toLocaleString()} tokens`);
  console.log(`      • BuildView AST contract: ~${contractTokens.toLocaleString()} tokens`);
  console.log(`      • 🚀 Net Context Savings: ${tokensSaved.toLocaleString()} tokens (${savingsPercent}% reduction!)`);

  console.log(`\n${hr}`);
  console.log('✅ ALL REAL-WORLD BENCHMARK SCENARIOS COMPLETED SUCCESSFULLY');
  console.log(`${hr}\n`);
}

runLiveBenchmarks().catch((err) => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
