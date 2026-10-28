import fs from 'fs';
import path from 'path';
import { BuildViewStore } from '../server/store.js';
import { getShotSelectProject } from '../server/shotselect-data.js';
import { TokenEngine } from '../shared/tokens.js';

const SHOTSELECT_REPO_PATH = '/Users/rp/Documents/GitHub/shotselect-pr769';

async function scanAndMapShotSelect() {
  console.log('\n======================================================');
  console.log('🔍 BUILDVIEW ARCHITECTURE SCANNER: SHOTSELECT REPO');
  console.log(`📁 Scanning target: ${SHOTSELECT_REPO_PATH}`);
  console.log('======================================================\n');

  if (!fs.existsSync(SHOTSELECT_REPO_PATH)) {
    console.error(`❌ Target repository not found at ${SHOTSELECT_REPO_PATH}`);
    process.exit(1);
  }

  const project = getShotSelectProject();
  const store = new BuildViewStore();

  let verifiedFilesCount = 0;
  let totalLinesScanned = 0;
  let complianceErrors = 0;

  for (const component of project.components) {
    // 1. Verify token compliance
    const compliance = TokenEngine.validateCompliance(component);
    if (!compliance.valid) {
      console.warn(`⚠️ Compliance warning on ${component.id}:`, compliance.errors);
      complianceErrors++;
    }

    // 2. Scan physical files in the target repository
    for (const file of component.files) {
      const fullPath = path.join(SHOTSELECT_REPO_PATH, file.path);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          file.linesChanged = lines;
          file.status = 'created';
          verifiedFilesCount++;
          totalLinesScanned += lines;
        }
      } else {
        console.warn(`   ⚠️ File path not yet materialized: ${file.path}`);
        file.status = 'planned';
      }
    }

    console.log(`✓ [${component.id}] ${component.name}: ${component.files.length} files scanned (${component.status.toUpperCase()})`);
  }

  // Save the verified mapped architecture into the store
  store.resetProject(project);

  console.log('\n======================================================');
  console.log(`✅ SCAN COMPLETE`);
  console.log(`📊 Total Architecture Layers: ${project.layers.length}`);
  console.log(`🧩 Total Mapped Components: ${project.components.length}`);
  console.log(`📄 Verified Source Files: ${verifiedFilesCount}`);
  console.log(`🔢 Lines of Code Tracked: ${totalLinesScanned}`);
  console.log(`⚠️ Active Architectural Gaps: ${project.components.reduce((sum, c) => sum + c.gaps.filter(g => !g.resolved).length, 0)}`);
  console.log(`🛡️ Design Token Compliance: ${complianceErrors === 0 ? '100% PASS' : 'NEEDS ATTENTION'}`);
  console.log('======================================================\n');
}

scanAndMapShotSelect().catch((err) => {
  console.error('Scanner error:', err);
  process.exit(1);
});
