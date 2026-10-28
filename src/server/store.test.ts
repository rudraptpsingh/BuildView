import { describe, it, expect, beforeEach } from 'vitest';
import { BuildViewStore } from './store.js';
import fs from 'fs';
import path from 'path';

describe('BuildViewStore TDD Suite', () => {
  const testDir = path.resolve(process.cwd(), '.buildview_test');
  let store: BuildViewStore;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new BuildViewStore(testDir);
  });

  it('should initialize a project with custom layers', () => {
    const project = store.initProject('Test CLI', 'A test CLI project', [
      { id: 'l0', name: 'Persistence', order: 0, description: 'DB layer', color: '#1e293b' },
      { id: 'l1', name: 'Engine', order: 1, description: 'Core logic', color: '#0369a1' },
    ]);

    expect(project.name).toBe('Test CLI');
    expect(project.layers).toHaveLength(2);
    expect(project.layers[0].id).toBe('l0');
    expect(project.components).toHaveLength(0);
  });

  it('should register an architectural component with full API anatomy and caller contracts', () => {
    store.initProject('Test Project', 'TDD testing');
    const comp = store.defineComponent({
      id: 'db_manager',
      name: 'Database Manager',
      layerId: 'layer_foundation',
      description: 'Manages local SQLite connection',
      color: 'slate',
      priority: 1,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [{ name: 'dbHandle', type: 'Database', access: 'private', description: 'Internal handle' }],
        functions: [
          { name: 'query', signature: '(sql: string): Row[]', returnType: 'Row[]', isAsync: false, description: 'Run query' },
        ],
        state: [{ name: 'isConnected', type: 'boolean', initialValue: 'false', description: 'Connection state' }],
        callers: ['query_service'],
        callees: ['sqlite3_driver'],
      },
      files: [{ path: 'src/db.ts', status: 'planned', description: 'Main db file' }],
      gaps: [],
    });

    expect(comp.id).toBe('db_manager');
    expect(comp.anatomy.members).toHaveLength(1);
    expect(comp.anatomy.functions).toHaveLength(1);
    expect(comp.anatomy.callers).toContain('query_service');
    expect(comp.files).toHaveLength(1);
  });

  it('should update component progress and append touched files', () => {
    store.initProject('Test Project', 'TDD testing');
    store.defineComponent({
      id: 'auth_service',
      name: 'Auth Service',
      layerId: 'layer_foundation',
      description: 'Handles auth',
      color: 'slate',
      priority: 1,
      status: 'planned',
      progress: 0,
      anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
      files: [],
      gaps: [],
    });

    const updated = store.updateComponentProgress({
      id: 'auth_service',
      progress: 75,
      status: 'in_progress',
      files: [
        { path: 'src/auth/token.ts', status: 'created', linesChanged: 85, description: 'Token validation logic' },
      ],
      note: 'Implemented JWT token verification',
    });

    expect(updated).not.toBeNull();
    expect(updated?.progress).toBe(75);
    expect(updated?.status).toBe('in_progress');
    expect(updated?.files).toHaveLength(1);
    expect(updated?.files[0].path).toBe('src/auth/token.ts');
  });

  it('should report an architectural gap and update component status to gap_detected', () => {
    store.initProject('Test Project', 'TDD testing');
    store.defineComponent({
      id: 'cache_engine',
      name: 'Cache Engine',
      layerId: 'layer_foundation',
      description: 'In-memory LRU cache',
      color: 'slate',
      priority: 2,
      status: 'in_progress',
      progress: 60,
      anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
      files: [],
      gaps: [],
    });

    const gap = store.reportGap('cache_engine', {
      title: 'Missing cache eviction on memory pressure',
      description: 'Cache does not listen to os memory warnings and can crash OOM',
      severity: 'high',
    });

    expect(gap).not.toBeNull();
    expect(gap?.title).toBe('Missing cache eviction on memory pressure');

    const comp = store.getProject().components.find((c) => c.id === 'cache_engine');
    expect(comp?.gaps).toHaveLength(1);
    expect(comp?.gaps[0].resolved).toBe(false);
  });

  it('should resolve a reported gap and restore healthy status', () => {
    store.initProject('Test Project', 'TDD testing');
    store.defineComponent({
      id: 'cache_engine',
      name: 'Cache Engine',
      layerId: 'layer_foundation',
      description: 'In-memory cache',
      color: 'slate',
      priority: 2,
      status: 'gap_detected',
      progress: 80,
      anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
      files: [],
      gaps: [],
    });

    const gap = store.reportGap('cache_engine', {
      title: 'Lock contention',
      description: 'Concurrent writes cause deadlocks',
      severity: 'critical',
    });

    expect(gap).not.toBeNull();
    const resolved = store.resolveGap('cache_engine', gap!.id, 'Applied fine-grained rwlock');
    expect(resolved).toBe(true);

    const comp = store.getProject().components.find((c) => c.id === 'cache_engine');
    expect(comp?.gaps[0].resolved).toBe(true);
    expect(comp?.status).toBe('in_progress');
  });

  it('should calculate roadmap correctly, directing agent to lowest unfinished layer and highest priority component', () => {
    store.initProject('Multi-layer System', 'TDD Roadmap Test', [
      { id: 'layer_0', name: 'Foundation', order: 0, description: 'L0' },
      { id: 'layer_1', name: 'Core Engine', order: 1, description: 'L1' },
    ]);

    // Component in L0 with P1 (already completed)
    store.defineComponent({
      id: 'c1',
      name: 'Config Parser',
      layerId: 'layer_0',
      description: 'L0 P1',
      color: 'slate',
      priority: 1,
      status: 'completed',
      progress: 100,
      anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
      files: [],
      gaps: [],
    });

    // Component in L0 with P2 (not completed - 40%)
    store.defineComponent({
      id: 'c2',
      name: 'Storage Driver',
      layerId: 'layer_0',
      description: 'L0 P2',
      color: 'slate',
      priority: 2,
      status: 'in_progress',
      progress: 40,
      anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
      files: [],
      gaps: [],
    });

    // Component in L1 with P1 (0% planned)
    store.defineComponent({
      id: 'c3',
      name: 'Task Scheduler',
      layerId: 'layer_1',
      description: 'L1 P1',
      color: 'slate',
      priority: 1,
      status: 'planned',
      progress: 0,
      anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
      files: [],
      gaps: [],
    });

    const roadmap = store.getRoadmap();

    // Agent MUST be directed to c2 first, because Layer 0 has unfinished work before moving to Layer 1!
    expect(roadmap.nextFocus).not.toBeNull();
    expect(roadmap.nextFocus?.componentId).toBe('c2');
    expect(roadmap.nextFocus?.layerName).toBe('Foundation');
    expect(roadmap.nextFocus?.priority).toBe(2);
  });
});
