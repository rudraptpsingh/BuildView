import { describe, it, expect, beforeEach } from 'vitest';
import { BuildViewStore } from './store.js';
import { createBuildViewMcpServer } from './mcp.js';
import path from 'path';
import fs from 'fs';

describe('BuildView MCP Server Protocol Suite', () => {
  const testDir = path.resolve(process.cwd(), '.buildview_mcp_test');
  let store: BuildViewStore;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new BuildViewStore(testDir);
  });

  it('creates an MCP server instance with all tools registered', () => {
    const server = createBuildViewMcpServer(store);
    expect(server).toBeDefined();
  });

  it('verifies store methods bound to MCP tools', async () => {
    // 1. Init project
    store.initProject('MCP Test Project', 'Testing agent tools', [
      { id: 'l0', name: 'Foundation', order: 0, description: 'Base layer' },
    ]);
    expect(store.getProject().name).toBe('MCP Test Project');

    // 2. Define component
    const comp = store.defineComponent({
      id: 'worker_pool',
      name: 'Worker Pool',
      layerId: 'l0',
      description: 'Manages subprocess workers',
      color: 'slate',
      priority: 1,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [{ name: 'poolSize', type: 'number', access: 'public' }],
        functions: [{ name: 'spawn', signature: '(): Worker', returnType: 'Worker' }],
        state: [{ name: 'activeCount', type: 'number' }],
        callers: ['orchestrator'],
        callees: ['node:child_process'],
      },
      files: [{ path: 'src/pool.ts', status: 'planned' }],
      gaps: [],
    });
    expect(comp.id).toBe('worker_pool');
    expect(store.getProject().components).toHaveLength(1);

    // 3. Update progress & files
    const updated = store.updateComponentProgress({
      id: 'worker_pool',
      progress: 50,
      status: 'in_progress',
      files: [{ path: 'src/pool.ts', status: 'created', linesChanged: 90 }],
      note: 'Implemented spawn loop',
    });
    expect(updated?.progress).toBe(50);

    // 4. Report gap
    const gap = store.reportGap('worker_pool', {
      title: 'No backpressure handling',
      description: 'Queue overflows if tasks arrive faster than worker capacity',
      severity: 'high',
    });
    expect(gap?.severity).toBe('high');
    expect(store.getProject().components[0].gaps).toHaveLength(1);

    // 5. Get roadmap
    const roadmap = store.getRoadmap();
    expect(roadmap.activeGapsCount).toBe(1);
    expect(roadmap.nextFocus?.componentId).toBe('worker_pool');

    // 6. Resolve gap
    const resolved = store.resolveGap('worker_pool', gap!.id, 'Added bounded channel queue');
    expect(resolved).toBe(true);
    expect(store.getProject().components[0].gaps[0].resolved).toBe(true);
  });
});
