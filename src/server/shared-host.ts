import express from 'express';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { BuildViewStore } from './store.js';
import { createBuildViewMcpServer } from './mcp.js';
import { createApiRouter } from './api.js';
import { startRepositoryWatcher } from './repo-watcher.js';

export interface SharedHostOptions {
  port?: number;
  storageDir?: string;
  staticDir?: string;
  repoPath?: string;
}

/** One store owner for all MCP clients and the dashboard. Local development only. */
export async function startSharedHost(options: SharedHostOptions = {}) {
  const port = options.port ?? 3333;
  const store = new BuildViewStore(options.storageDir);
  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    server: ReturnType<typeof createBuildViewMcpServer>;
  }>();
  const app = express();
  let actualPort = port;
  app.use((req, res, next) => {
    const authorities = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    if (!authorities.includes(req.headers.host || '')) return void res.status(403).end();
    if (req.headers.origin && !authorities.map(h => `http://${h}`).includes(req.headers.origin)) {
      return void res.status(403).end();
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.all('/mcp', async (req, res) => {
    try {
      const sid = req.headers['mcp-session-id'];
      let session = typeof sid === 'string' ? sessions.get(sid) : undefined;
      if (!session && !sid && req.method === 'POST' && isInitializeRequest(req.body)) {
        if (sessions.size >= 32) return void res.status(503).json({ error: 'Too many MCP sessions' });
        const server = createBuildViewMcpServer(store);
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (id): void => { sessions.set(id, { transport, server }); },
        });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        session = { server, transport };
      }
      if (!session) return void res.status(sid ? 404 : 400).json({ error: 'Initialize an MCP session first' });
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
  });
  app.use('/api', createApiRouter(store));
  const staticDir = options.staticDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  app.use(express.static(staticDir));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) return void res.status(404).end();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  const listener = await new Promise<Server>((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  actualPort = address.port;
  let repoWatcher: ReturnType<typeof startRepositoryWatcher> | undefined;
  try { repoWatcher=options.repoPath ? startRepositoryWatcher(store,options.repoPath) : undefined; }
  catch(error) { listener.close(); throw error; }
  return {
    url: `http://127.0.0.1:${actualPort}`,
    store,
    async close() {
      repoWatcher?.close();
      for (const session of [...sessions.values()]) await session.server.close();
      const closing = new Promise<void>((resolve, reject) => listener.close(err => err ? reject(err) : resolve()));
      listener.closeAllConnections(); // Includes dashboard SSE connections.
      await closing;
    },
  };
}
