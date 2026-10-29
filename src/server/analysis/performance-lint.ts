import fs from 'fs';
import path from 'path';
import type {
  PerformanceViolation,
  PerformanceMetrics,
  GapItem,
  ArchitectureComponent,
} from '../../shared/types.js';

export interface PerformanceLintOptions {
  enforceUiSyncIo?: boolean;
  enforceMainStartup?: boolean;
}

const SYNC_FS_PATTERN = /\bfs\.(readFileSync|writeFileSync|appendFileSync|statSync)\s*\(/g;
const SYNC_EXEC_PATTERN = /\b(?:child_process\.)?(execSync|spawnSync)\s*\(/g;
const SYNC_IPC_PATTERN = /\bipcRenderer\.sendSync\s*\(/g;

export class PerformanceLinter {
  /**
   * Scans repository files for synchronous, blocking calls on UI rendering and
   * Electron main threads that degrade Event Loop Stall Time (EST) and Time To First Pixels (TTFP).
   *
   * Inspired by app-vitals and electron-workflow-observer telemetry standards.
   */
  public static analyzePerformance(
    repoPath: string,
    components: ArchitectureComponent[],
    options: PerformanceLintOptions = {}
  ): {
    metrics: PerformanceMetrics;
    violations: PerformanceViolation[];
    gaps: GapItem[];
  } {
    const violations: PerformanceViolation[] = [];
    const filesWithViolations = new Set<string>();
    let syncFsInUiCount = 0;
    let syncExecCount = 0;
    let syncIpcCount = 0;

    for (const comp of components) {
      for (const fileObj of comp.files) {
        const filePath = fileObj.path;
        // Ignore test files and test suites
        if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
          continue;
        }

        const normPath = filePath.replace(/\\/g, '/');
        const isUi =
          normPath.includes('/components/') ||
          normPath.includes('/hooks/') ||
          normPath.includes('/views/') ||
          normPath.includes('/pages/') ||
          normPath.includes('/renderer/') ||
          normPath.startsWith('client-web/') ||
          (comp.layerId === 'layer_presentation' && !normPath.includes('/cli/'));
        const isElectronMain = normPath.startsWith('electron/');

        if (!isUi && !isElectronMain) {
          continue;
        }

        const absPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath);
        if (!fs.existsSync(absPath)) continue;

        let content = '';
        try {
          content = fs.readFileSync(absPath, 'utf-8');
        } catch {
          continue;
        }

        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const lineStr = lines[i];
          const lineNum = i + 1;

          // 1. Synchronous FS in UI or Electron main
          let match: RegExpExecArray | null;
          SYNC_FS_PATTERN.lastIndex = 0;
          while ((match = SYNC_FS_PATTERN.exec(lineStr)) !== null) {
            const op = `fs.${match[1]}`;
            if (isUi) {
              syncFsInUiCount++;
              filesWithViolations.add(filePath);
              violations.push({
                file: filePath,
                line: lineNum,
                severity: 'high',
                kind: 'sync_fs_in_ui',
                operation: op,
                contextSnippet: lineStr.trim(),
                message: `Synchronous I/O "${op}" detected on UI thread. Blocks React event loop, directly spiking EST and causing frame drops.`,
                remediation: `Migrate "${op}" to async fs.promises.${match[1].replace('Sync', '')} or delegate to background worker.`,
              });
            } else if (isElectronMain && (lineNum < 100 || normPath.includes('main.') || normPath.includes('index.'))) {
              syncFsInUiCount++;
              filesWithViolations.add(filePath);
              violations.push({
                file: filePath,
                line: lineNum,
                severity: 'medium',
                kind: 'sync_fs_in_main_startup',
                operation: op,
                contextSnippet: lineStr.trim(),
                message: `Synchronous I/O "${op}" detected during Electron main process startup. Spikes cold-start TTFP latency.`,
                remediation: `Replace "${op}" with non-blocking async equivalent or defer until after app.whenReady().`,
              });
            }
          }

          // 2. Synchronous Process Execution (execSync, spawnSync)
          SYNC_EXEC_PATTERN.lastIndex = 0;
          while ((match = SYNC_EXEC_PATTERN.exec(lineStr)) !== null) {
            const op = match[1];
            syncExecCount++;
            filesWithViolations.add(filePath);
            violations.push({
              file: filePath,
              line: lineNum,
              severity: 'high',
              kind: 'sync_exec_in_ui',
              operation: op,
              contextSnippet: lineStr.trim(),
              message: `Synchronous child process execution "${op}" blocks event loop until subprocess exits.`,
              remediation: `Use asynchronous execFile / spawn with promises instead of ${op}.`,
            });
          }

          // 3. Synchronous IPC (ipcRenderer.sendSync)
          SYNC_IPC_PATTERN.lastIndex = 0;
          while ((match = SYNC_IPC_PATTERN.exec(lineStr)) !== null) {
            syncIpcCount++;
            filesWithViolations.add(filePath);
            violations.push({
              file: filePath,
              line: lineNum,
              severity: 'high',
              kind: 'sync_ipc',
              operation: 'ipcRenderer.sendSync',
              contextSnippet: lineStr.trim(),
              message: `Synchronous IPC "sendSync" completely blocks renderer event loop until main process responds.`,
              remediation: `Refactor to async ipcRenderer.invoke with Promise response.`,
            });
          }
        }
      }
    }

    const gaps: GapItem[] = [];
    if (syncFsInUiCount > 0 || syncExecCount > 0 || syncIpcCount > 0) {
      const highSevCount = violations.filter((v) => v.severity === 'high').length;
      gaps.push({
        id: 'gap_perf_blocking_sync_io',
        title: `Performance Hotpath: ${violations.length} blocking synchronous I/O or IPC call(s) detected`,
        description: `Calling synchronous fs or process APIs on UI render threads or Electron startup spikes Event Loop Stall Time (EST) and delays Time To First Pixels (TTFP).`,
        severity: highSevCount > 0 ? 'high' : 'medium',
        resolved: false,
        evidence: violations.slice(0, 5).map((v) => `${v.file}:${v.line} (${v.operation})`),
        kind: 'performance_blocking_io',
        resolutionNote: 'Replace synchronous I/O with fs.promises or async IPC to protect UI responsiveness.',
      });
    }

    return {
      metrics: {
        totalViolations: violations.length,
        syncFsInUiCount,
        syncExecCount,
        syncIpcCount,
        filesWithViolations: Array.from(filesWithViolations),
      },
      violations,
      gaps,
    };
  }
}
