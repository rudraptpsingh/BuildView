import path from 'node:path';
import { startSharedHost } from './shared-host.js';
const port = Number(process.env.BUILDVIEW_PORT || 3333);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid BUILDVIEW_PORT');
const host = await startSharedHost({
  port,
  repoPath: process.env.BUILDVIEW_REPO_PATH ? path.resolve(process.env.BUILDVIEW_REPO_PATH) : undefined,
  storageDir: process.env.BUILDVIEW_STORAGE_DIR ? path.resolve(process.env.BUILDVIEW_STORAGE_DIR) : undefined,
});
console.log(`BuildView dashboard: ${host.url} | MCP: ${host.url}/mcp`);
console.log('One shared store; loopback only. Do not use as a public/enterprise server.');
const shutdown = () => host.close().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
