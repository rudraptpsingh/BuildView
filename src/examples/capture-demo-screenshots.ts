import fs from 'fs';
import path from 'path';
import express from 'express';
import { BuildViewStore } from '../server/store.js';
import { createApiRouter } from '../server/api.js';

// Load playwright from DemoScript
const playwrightPath = '/Users/rp/Documents/GitHub/DemoScript/node_modules/playwright/index.mjs';
const playwrightModule = await import(playwrightPath);
const chromium = playwrightModule.chromium || playwrightModule.default?.chromium;

const SCREENSHOTS_DIR = '/Users/rp/.gemini/antigravity/brain/4dc75253-1d2c-4da2-9989-b149834c61ff/screenshots';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function run() {
  console.log('🚀 Setting up BuildView Demo Capture Server...');
  const store = new BuildViewStore();

  // Load the scanned ShotSelect architecture
  const shotselectArchPath = '/Users/rp/Documents/GitHub/shotselect-pr769/buildview-architecture.json';
  if (fs.existsSync(shotselectArchPath)) {
    const shotselectArch = JSON.parse(fs.readFileSync(shotselectArchPath, 'utf-8'));
    store.resetProject(shotselectArch);
    console.log(`📦 Loaded ${shotselectArch.name} architecture (${shotselectArch.components.length} components, health: ${shotselectArch.healthScore?.overallScore}/100)`);
  }

  const app = express();
  app.use('/api', createApiRouter(store));

  const clientDist = path.resolve(process.cwd(), 'dist');
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  const PORT = 3399;
  const server = app.listen(PORT, async () => {
    console.log(`📡 Server listening on http://localhost:${PORT}`);

    try {
      console.log('🌐 Launching headless browser via Playwright...');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: 2, // Retina resolution
      });
      const page = await context.newPage();

      console.log(`Navigating to http://localhost:${PORT}...`);
      await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000); // Allow React Flow / Dagre and SSE to layout

      // 1. Full Dashboard Overview Screenshot (Swimlanes view)
      const shot1 = path.join(SCREENSHOTS_DIR, '01_buildview_shotselect_architecture_overview.png');
      await page.screenshot({ path: shot1, fullPage: false });
      console.log(`📸 Saved overview: ${shot1}`);

      // 2. Click on "DAG GRAPH" tab
      const dagTab = await page.getByRole('button', { name: /DAG GRAPH/i }).or(page.locator('button:has-text("DAG GRAPH")'));
      if (await dagTab.count() > 0) {
        await dagTab.first().click();
        await page.waitForTimeout(2000);
        const shot2 = path.join(SCREENSHOTS_DIR, '02_buildview_architecture_dag_graph.png');
        await page.screenshot({ path: shot2, fullPage: false });
        console.log(`📸 Saved DAG Graph: ${shot2}`);
      }

      // 3. Click on "AUDIT & GAPS" tab
      const auditTab = await page.getByRole('button', { name: /AUDIT & GAPS/i }).or(page.locator('button:has-text("AUDIT & GAPS")'));
      if (await auditTab.count() > 0) {
        await auditTab.first().click();
        await page.waitForTimeout(1500);
        const shot3 = path.join(SCREENSHOTS_DIR, '03_buildview_audit_and_gaps.png');
        await page.screenshot({ path: shot3, fullPage: false });
        console.log(`📸 Saved Audit & Gaps: ${shot3}`);
      }

      // 4. Return to Swimlanes and inspect a component
      const swimTab = await page.getByRole('button', { name: /SWIMLANES/i }).or(page.locator('button:has-text("SWIMLANES")'));
      if (await swimTab.count() > 0) {
        await swimTab.first().click();
        await page.waitForTimeout(1000);
      }

      const inspectBtn = await page.locator('text=INSPECT').first();
      if (await inspectBtn.count() > 0) {
        await inspectBtn.click();
        await page.waitForTimeout(1000);
        const shot4 = path.join(SCREENSHOTS_DIR, '04_buildview_component_inspection_drawer.png');
        await page.screenshot({ path: shot4, fullPage: false });
        console.log(`📸 Saved Component Inspection: ${shot4}`);
      }

      await browser.close();
      console.log('✅ All 4 demo screenshots captured successfully!');
    } catch (err) {
      console.error('❌ Screenshot capture error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
