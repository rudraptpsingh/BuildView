import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { BuildViewStore } from './store.js';
import { createApiRouter } from './api.js';
import { getCliDemoProject } from './demo-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.BUILDVIEW_PORT || process.env.PORT || 3333;

async function bootstrap() {
  const app = express();
  const store = new BuildViewStore();

  // If store is fresh/empty, seed with the interactive DevPulse CLI architecture demo
  const current = store.getProject();
  if (current.components.length === 0) {
    store.resetProject(getCliDemoProject());
  }

  // Mount API router with SSE stream
  app.use('/api', createApiRouter(store));

  // Serve static client bundle if built
  const clientDist = path.resolve(__dirname, '../../dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 BuildView Server & Real-Time Sync running on port ${PORT}`);
    console.log(`👉 Web Visualizer API & SSE: http://localhost:${PORT}/api/events`);
    console.log(`👉 Web App: http://localhost:${PORT} (built client) or the Vite dev server when running npm run dev`);
    console.log(`👉 Standalone MCP Stdio: npm run mcp`);
    console.log(`======================================================\n`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start BuildView server:', err);
  process.exit(1);
});
