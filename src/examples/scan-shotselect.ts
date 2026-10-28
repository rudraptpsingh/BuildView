import fs from 'fs';
import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { getShotSelectProject } from '../server/shotselect-data.js';
import { TokenEngine } from '../shared/tokens.js';
import { RepoParser } from '../server/parser/repo-parser.js';
import { WasteDetector } from '../server/parser/waste-detector.js';

const SHOTSELECT_REPO_PATH = '/Users/rp/Documents/GitHub/shotselect-pr769';

async function scanAndMapShotSelect() {
  console.log('\n======================================================');
  console.log('🔍 BUILDVIEW ARCHITECTURE & AST WASTE SCANNER: SHOTSELECT');
  console.log(`📁 Scanning target: ${SHOTSELECT_REPO_PATH}`);
  console.log('======================================================\n');

  if (!fs.existsSync(SHOTSELECT_REPO_PATH)) {
    console.error(`❌ Target repository not found at ${SHOTSELECT_REPO_PATH}`);
    process.exit(1);
  }

  const project = getShotSelectProject();
  const store = new BuildViewStore();

  // 1. Deep Scan AST & Test Files
  console.log('⚡ Scanning AST files and tests...');
  const repoScan = RepoParser.scanRepository(SHOTSELECT_REPO_PATH);
  console.log(`   Source files parsed: ${repoScan.sourceFiles.length}`);
  console.log(`   Test files parsed: ${repoScan.testFiles.length}`);

  // 2. Perform Code Waste and Dead Code Pruning Analysis
  console.log('🧹 Executing WasteDetector analysis...');
  const wasteAnalysis = WasteDetector.analyzeRepository(repoScan.sourceFiles, repoScan.testFiles);
  console.log(`   Unused exports: ${wasteAnalysis.allUnusedExports.length}`);
  console.log(`   Duplicate functions: ${wasteAnalysis.allDuplicates.length}`);
  console.log(`   Test zombies: ${wasteAnalysis.allTestZombies.length}`);
  console.log(`   Cleanliness score: ${wasteAnalysis.repoWaste.cleanlinessScore}%\n`);

  let verifiedFilesCount = 0;
  let totalLinesScanned = 0;
  let complianceErrors = 0;

  // 3. Cluster ALL repository files into full architecture components
  console.log('🧩 Clustering all repository files into architectural components...');
  const { ArchitectureClusterer } = await import('../server/parser/architecture-clusterer.js');
  const allComponents = ArchitectureClusterer.clusterRepository(
    repoScan.sourceFiles,
    repoScan.testFiles,
    project.layers,
    undefined,
    wasteAnalysis
  );

  project.components = allComponents;

  for (const component of project.components) {
    const compliance = TokenEngine.validateCompliance(component);
    if (!compliance.valid) {
      console.warn(`⚠️ Compliance warning on ${component.id}:`, compliance.errors);
      complianceErrors++;
    }

    verifiedFilesCount += component.files.length;
    totalLinesScanned += component.astMetrics?.linesOfCode || 0;

    console.log(`✓ [${component.id}] ${component.name}: ${component.files.length} files | ${component.testSummary?.totalTests || 0} tests | waste: ${component.wasteMetrics?.recommendation || 'clean'}`);
  }

  // Save the full clustered architecture into the store
  store.resetProject(project);

  console.log('\n======================================================');
  console.log(`✅ SCAN COMPLETE`);
  console.log(`📊 Total Architecture Layers: ${project.layers.length}`);
  console.log(`🧩 Total Mapped Components: ${project.components.length}`);
  console.log(`📄 Verified Source Files: ${verifiedFilesCount}`);
  console.log(`🔢 Lines of Code Tracked: ${totalLinesScanned}`);
  console.log(`🧪 Total Tests Correlated: ${project.components.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0)}`);
  console.log(`🧹 Unused Exports Detected: ${wasteAnalysis.allUnusedExports.length}`);
  console.log(`⚠️ Active Architectural Gaps: ${project.components.reduce((sum, c) => sum + c.gaps.filter(g => !g.resolved).length, 0)}`);
  console.log(`🛡️ Design Token Compliance: ${complianceErrors === 0 ? '100% PASS' : 'NEEDS ATTENTION'}`);
  console.log('======================================================\n');
}

scanAndMapShotSelect().catch((err) => {
  console.error('Scanner error:', err);
  process.exit(1);
});
