import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PerformanceLinter } from './performance-lint.js';
import type { ArchitectureComponent } from '../../shared/types.js';

describe('PerformanceLinter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-perf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects synchronous fs and child_process in UI files', () => {
    const uiDir = path.join(tempDir, 'src', 'components');
    fs.mkdirSync(uiDir, { recursive: true });
    const badUiFile = path.join(uiDir, 'SlowWidget.tsx');
    fs.writeFileSync(
      badUiFile,
      `import fs from 'fs';
import { execSync } from 'child_process';

export function SlowWidget() {
  const data = fs.readFileSync('/tmp/data.json', 'utf-8');
  execSync('echo hello');
  return <div>{data}</div>;
}`
    );

    const components: ArchitectureComponent[] = [
      {
        id: 'comp_ui',
        name: 'UI Components',
        layerId: 'layer_presentation',
        files: [{ path: 'src/components/SlowWidget.tsx', role: 'product' }],
        anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
        metrics: { totalFunctions: 1, totalClasses: 0, totalInterfaces: 0, totalExports: 1, linesOfCode: 10 },
        gaps: [],
        dependencies: [],
      },
    ];

    const result = PerformanceLinter.analyzePerformance(tempDir, components);

    expect(result.violations.length).toBe(2);
    expect(result.violations.some((v) => v.kind === 'sync_fs_in_ui')).toBe(true);
    expect(result.violations.some((v) => v.kind === 'sync_exec_in_ui')).toBe(true);
    expect(result.metrics.syncFsInUiCount).toBe(1);
    expect(result.metrics.syncExecCount).toBe(1);
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].severity).toBe('high');
    expect(result.gaps[0].kind).toBe('performance_blocking_io');
  });

  it('detects ipcRenderer.sendSync in renderer files', () => {
    const uiDir = path.join(tempDir, 'src', 'hooks');
    fs.mkdirSync(uiDir, { recursive: true });
    const hookFile = path.join(uiDir, 'useConfig.ts');
    fs.writeFileSync(
      hookFile,
      `export function useConfig() {
  const cfg = (window as any).electron.ipcRenderer.sendSync('get-config');
  return cfg;
}`
    );

    const components: ArchitectureComponent[] = [
      {
        id: 'comp_hooks',
        name: 'Hooks',
        layerId: 'layer_presentation',
        files: [{ path: 'src/hooks/useConfig.ts', role: 'product' }],
        anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
        metrics: { totalFunctions: 1, totalClasses: 0, totalInterfaces: 0, totalExports: 1, linesOfCode: 5 },
        gaps: [],
        dependencies: [],
      },
    ];

    const result = PerformanceLinter.analyzePerformance(tempDir, components);
    expect(result.violations.some((v) => v.kind === 'sync_ipc')).toBe(true);
    expect(result.metrics.syncIpcCount).toBe(1);
  });
});
