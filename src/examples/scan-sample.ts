import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { RepoScannerService } from '../server/repo-scanner-service.js';

async function scanSampleRepository() {
  const targetPath = process.argv[2] || '.';
  console.log('\n======================================================');
  console.log('🔍 BUILDVIEW ARCHITECTURE & AST WASTE SCANNER');
  console.log(`📁 Scanning target: ${path.resolve(process.cwd(), targetPath)}`);
  console.log('======================================================\n');

  const store = new BuildViewStore();
  const project = await RepoScannerService.scanRepository(store, targetPath);

  console.log('✅ Scan Complete!');
  console.log(`   Project: ${project.name}`);
  console.log(`   Layers: ${project.layers.length}`);
  console.log(`   Components: ${project.components.length}`);
  console.log('   Live visualizer: http://localhost:5173\n');
}

scanSampleRepository().catch((err) => {
  console.error('Scan error:', err);
  process.exit(1);
});
