import express from 'express';
import cors from 'cors';
import { BuildViewStore } from './store.js';
import { RepoScannerService } from './repo-scanner-service.js';
import { getCliDemoProject, getCliDemoSteps } from './demo-data.js';
import { getDogfoodProject } from './dogfood-data.js';
import { getSampleProject } from './sample-project-data.js';

export function createApiRouter(store: BuildViewStore) {
  const router = express.Router();
  router.use(cors());
  router.use(express.json());

  // Store active SSE clients
  const sseClients: express.Response[] = [];

  store.on('update', (data) => {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        // Handled on client close
      }
    }
  });

  // POST /api/scan - Dynamically scan, parse, and map ANY repository on disk
  router.post('/scan', async (req, res) => {
    try {
      const { repoPath, projectName, projectDescription } = req.body || {};
      if (!repoPath) {
        return res.status(400).json({ error: 'Missing required parameter "repoPath"' });
      }
      const project = await RepoScannerService.scanRepository(store, repoPath, {
        projectName,
        projectDescription,
      });
      res.json({ success: true, project });
    } catch (err: any) {
      console.error('Failed to scan repository:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/project - Current architecture
  router.get('/project', (req, res) => {
    res.json(store.getProject());
  });

  // GET /api/timeline - Timeline events
  router.get('/timeline', (req, res) => {
    res.json(store.getTimeline());
  });

  // GET /api/roadmap - Prioritized build roadmap & gaps
  router.get('/roadmap', (req, res) => {
    res.json(store.getRoadmap());
  });

  // GET /api/events - Real-time SSE stream
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ project: store.getProject(), timeline: store.getTimeline() })}\n\n`);

    sseClients.push(res);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // POST /api/reset - Switch active project
  router.post('/reset', (req, res) => {
    const { mode } = req.body || {};
    if (mode === 'sample') {
      const sampleProject = getSampleProject();
      store.resetProject(sampleProject);
    } else if (mode === 'dogfood') {
      const dogfoodProject = getDogfoodProject();
      store.resetProject(dogfoodProject);
    } else if (mode === 'demo') {
      const demoProject = getCliDemoProject();
      store.resetProject(demoProject);
    } else {
      store.resetProject();
    }
    res.json({ success: true, project: store.getProject() });
  });

  // POST /api/component - Manual or test component definition
  router.post('/component', (req, res) => {
    const comp = store.defineComponent(req.body);
    res.json(comp);
  });

  // POST /api/progress - Manual or test progress update
  router.post('/progress', (req, res) => {
    const comp = store.updateComponentProgress(req.body);
    res.json(comp);
  });

  // GET /api/demo/steps - Get the simulation steps for the CLI demo
  router.get('/demo/steps', (req, res) => {
    res.json(getCliDemoSteps());
  });

  return router;
}
