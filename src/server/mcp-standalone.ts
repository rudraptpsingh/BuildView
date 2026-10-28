import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BuildViewStore } from './store.js';
import { createBuildViewMcpServer } from './mcp.js';

async function runMcpStandalone() {
  const store = new BuildViewStore();
  const server = createBuildViewMcpServer(store);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('BuildView MCP Server connected over Stdio.');
}

runMcpStandalone().catch((err) => {
  console.error('Fatal MCP Server error:', err);
  process.exit(1);
});
