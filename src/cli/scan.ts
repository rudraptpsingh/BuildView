#!/usr/bin/env node
import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { RepoScannerService } from '../server/repo-scanner-service.js';

async function main() {
  const targetPath = process.argv[2] || process.cwd();
  const resolvedTarget = path.resolve(process.cwd(), targetPath);

  console.log('\n======================================================');
  console.log('⚡ BUILDVIEW ARCHITECTURE & AST WASTE REPO SCANNER');
  console.log(`📁 Scanning target: ${resolvedTarget}`);
  console.log('======================================================\n');

  const store = new BuildViewStore();
  const startTime = Date.now();

  try {
    const project = await RepoScannerService.scanRepository(store, resolvedTarget);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const totalFiles = project.components.reduce((sum, c) => sum + c.files.length, 0);
    const totalLines = project.components.reduce((sum, c) => sum + (c.astMetrics?.linesOfCode || 0), 0);
    const totalTests = project.components.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0);
    const totalGaps = project.components.reduce((sum, c) => sum + c.gaps.filter((g) => !g.resolved).length, 0);

    console.log(`\n======================================================`);
    console.log(`✅ SCAN COMPLETE (${elapsed}s)`);
    console.log(`📦 Project Name: ${project.name}`);
    console.log(`📊 Architectural Layers: ${project.layers.length}`);
    console.log(`🧩 Mapped Components: ${project.components.length}`);
    console.log(`📄 Source Files Parsed: ${totalFiles}`);
    console.log(`🔢 Lines of Code Tracked: ${totalLines.toLocaleString()}`);
    console.log(`🧪 Tests Correlated: ${totalTests}`);
    console.log(`⚠️ Active Gaps: ${totalGaps}`);
    console.log(`👉 View live dashboard: http://localhost:5173`);
    console.log('======================================================\n');
  } catch (err: any) {
    console.error(`❌ Scan failed:`, err.message);
    process.exit(1);
  }
}

main();
