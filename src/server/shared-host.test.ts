import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import { request } from 'node:http';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startSharedHost } from './shared-host.js';

it('shares MCP mutations with another client and dashboard, and restores the plan after restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'buildview-shared-'));
  let host = await startSharedHost({ port: 0, storageDir: dir });
  const clients: Client[] = [];
  const transports: StreamableHTTPClientTransport[] = [];
  const connect = async () => {
    const c = new Client({ name: 'integration-test', version: '1' });
    const t = new StreamableHTTPClientTransport(new URL(host.url + '/mcp'));
    await c.connect(t); clients.push(c); transports.push(t); return c;
  };
  try {
    const a = await connect(); const b = await connect();
    const result = await a.callTool({ name: 'buildview_init_project', arguments: { name: 'Shared fixture', description: 'Test' } });
    expect(result.isError).not.toBe(true);
    await a.callTool({name:'buildview_define_component',arguments:{id:'proof',name:'Proof',layerId:'layer_foundation',description:'Test',status:'planned',progress:0}});
    await b.callTool({name:'buildview_update_progress',arguments:{id:'proof',status:'in_progress',progress:20,note:'MCP integration fixture'}});
    const graph = await b.callTool({ name: 'buildview_get_architecture', arguments: {} });
    expect(JSON.parse((graph.content as {text:string}[])[0].text).components[0].progress).toBe(20);
    const api = await (await fetch(host.url + '/api/project')).json();
    expect(api.name).toBe('Shared fixture');expect(api.components[0].progress).toBe(20);
    expect((await fetch(host.url + '/api/project', {headers:{origin:'https://untrusted.example'}})).status).toBe(403);
    const forgedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(host.url + '/api/project', {headers:{host:'untrusted.example'}}, res => {res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    expect(forgedHostStatus).toBe(403);
    for (const t of transports) await t.terminateSession();
    for (const c of clients) await c.close();
    await host.close();
    host = await startSharedHost({ port: 0, storageDir: dir });
    const restored=await (await fetch(host.url + '/api/project')).json();
    expect(restored.components[0].progress).toBe(20);
    expect(restored.name).toBe('Shared fixture');
  } finally {
    for(const c of clients)await c.close();
    await host.close();await fs.rm(dir,{recursive:true,force:true});
  }
});
