#!/usr/bin/env node
// Route protocol/service commands before the repository scanner's positional parser.
const command = process.argv[2];
if (command === 'mcp') {
  await import('../dist/server/mcp-standalone.js');
} else if (command === 'serve') {
  await import('../dist/server/serve.js');
} else {
  await import('../dist/cli/index.js');
}
