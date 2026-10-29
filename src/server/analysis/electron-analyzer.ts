import fs from 'fs';
import path from 'path';
import type { GapItem, ArchitectureComponent } from '../../shared/types.js';

export interface ElectronIpcChannelInfo {
  name: string;
  calledInPreload: boolean;
  handledInMain: boolean;
  preloadLocations: Array<{ file: string; line: number }>;
  mainLocations: Array<{ file: string; line: number }>;
}

export interface ElectronSecurityAudit {
  contextIsolationExplicit: boolean;
  nodeIntegrationDisabled: boolean;
  sandboxExplicit: boolean;
  webSecurityExplicit: boolean;
  insecurePatterns: Array<{ file: string; line: number; message: string }>;
}

export interface ElectronArchitectureMetrics {
  isElectronApp: boolean;
  totalIpcChannels: number;
  totalPreloadExposedMethods: number;
  unhandledIpcChannels: string[];
  orphanIpcHandlers: string[];
  preloadFiles: string[];
  mainProcessFiles: string[];
  security: ElectronSecurityAudit;
}

export class ElectronAnalyzer {
  /**
   * Statically audits an Electron repository's process boundaries,
   * IPC contract symmetry, preload surface area, and security invariants.
   *
   * Inspired by electron-workflow-observer and electron-mcp-bridge.
   */
  public static analyzeElectronApp(
    repoPath: string,
    components: ArchitectureComponent[] = []
  ): {
    metrics: ElectronArchitectureMetrics;
    gaps: GapItem[];
  } {
    const electronDir = path.join(repoPath, 'electron');
    const hasElectronDir = fs.existsSync(electronDir);

    let isElectronApp = hasElectronDir;
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.dependencies?.electron || pkg.devDependencies?.electron) {
          isElectronApp = true;
        }
      } catch {
        // ignore
      }
    }

    if (!isElectronApp) {
      return {
        metrics: {
          isElectronApp: false,
          totalIpcChannels: 0,
          totalPreloadExposedMethods: 0,
          unhandledIpcChannels: [],
          orphanIpcHandlers: [],
          preloadFiles: [],
          mainProcessFiles: [],
          security: {
            contextIsolationExplicit: false,
            nodeIntegrationDisabled: false,
            sandboxExplicit: false,
            webSecurityExplicit: false,
            insecurePatterns: [],
          },
        },
        gaps: [],
      };
    }

    // 1. Collect all Electron files
    const allElectronFiles: string[] = [];
    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            scanDir(full);
          }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.cjs') || entry.name.endsWith('.mjs')) {
          if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
            allElectronFiles.push(full);
          }
        }
      }
    }

    if (hasElectronDir) {
      scanDir(electronDir);
    }

    const preloadFiles = allElectronFiles.filter((f) => path.basename(f).includes('preload'));
    const mainProcessFiles = allElectronFiles.filter((f) => !path.basename(f).includes('preload'));

    // 2. Parse IPC Channels
    const channels = new Map<string, ElectronIpcChannelInfo>();
    function getOrCreateChannel(name: string): ElectronIpcChannelInfo {
      let info = channels.get(name);
      if (!info) {
        info = {
          name,
          calledInPreload: false,
          handledInMain: false,
          preloadLocations: [],
          mainLocations: [],
        };
        channels.set(name, info);
      }
      return info;
    }

    let totalPreloadExposedMethods = 0;

    // Scan Preload Files
    const INVOKE_PATTERN = /ipcRenderer\.(?:invoke|send)\s*\(\s*(['"][^'"]+['"])/g;
    const EXPOSE_METHOD_PATTERN = /^\s*([a-zA-Z0-9_$]+)\s*:\s*(?:\([^)]*\)|async\s*\([^)]*\)|\(.*?\)\s*=>)/gm;

    for (const pf of preloadFiles) {
      try {
        const content = fs.readFileSync(pf, 'utf-8');
        const lines = content.split('\n');

        // Measure exposed method surface
        for (let i = 0; i < lines.length; i++) {
          const lineStr = lines[i];
          let match: RegExpExecArray | null;
          INVOKE_PATTERN.lastIndex = 0;
          while ((match = INVOKE_PATTERN.exec(lineStr)) !== null) {
            const chName = match[1].slice(1, -1);
            const ch = getOrCreateChannel(chName);
            ch.calledInPreload = true;
            ch.preloadLocations.push({ file: path.relative(repoPath, pf), line: i + 1 });
          }

          if (lineStr.match(EXPOSE_METHOD_PATTERN)) {
            totalPreloadExposedMethods++;
          }
        }
      } catch {
        // ignore
      }
    }

    // Scan Main Files
    const HANDLE_PATTERN = /ipcMain\.(?:handle|on)\s*\(\s*(['"][^'"]+['"])/g;
    const insecurePatterns: Array<{ file: string; line: number; message: string }> = [];
    let contextIsolationExplicit = false;
    let nodeIntegrationDisabled = false;
    let sandboxExplicit = false;
    let webSecurityExplicit = false;

    for (const mf of mainProcessFiles) {
      try {
        const content = fs.readFileSync(mf, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const lineStr = lines[i];
          const lineNum = i + 1;
          const relPath = path.relative(repoPath, mf);

          let match: RegExpExecArray | null;
          HANDLE_PATTERN.lastIndex = 0;
          while ((match = HANDLE_PATTERN.exec(lineStr)) !== null) {
            const chName = match[1].slice(1, -1);
            const ch = getOrCreateChannel(chName);
            ch.handledInMain = true;
            ch.mainLocations.push({ file: relPath, line: lineNum });
          }

          // Security checks in webPreferences
          if (lineStr.includes('contextIsolation: true')) contextIsolationExplicit = true;
          if (lineStr.includes('nodeIntegration: false')) nodeIntegrationDisabled = true;
          if (lineStr.includes('sandbox: true')) sandboxExplicit = true;
          if (lineStr.includes('webSecurity: true')) webSecurityExplicit = true;

          if (lineStr.includes('nodeIntegration: true')) {
            insecurePatterns.push({
              file: relPath,
              line: lineNum,
              message: 'Dangerous configuration: nodeIntegration is enabled in BrowserWindow.',
            });
          }
          if (lineStr.includes('contextIsolation: false')) {
            insecurePatterns.push({
              file: relPath,
              line: lineNum,
              message: 'Dangerous configuration: contextIsolation is explicitly disabled.',
            });
          }
        }
      } catch {
        // ignore
      }
    }

    const unhandledIpcChannels: string[] = [];
    const orphanIpcHandlers: string[] = [];

    for (const [name, info] of channels.entries()) {
      if (info.calledInPreload && !info.handledInMain) {
        unhandledIpcChannels.push(name);
      }
      if (info.handledInMain && !info.calledInPreload) {
        orphanIpcHandlers.push(name);
      }
    }

    // 3. Synthesize Architectural Gaps
    const gaps: GapItem[] = [];

    // Preload God-Object Gap (>150 exposed methods)
    if (totalPreloadExposedMethods > 150) {
      gaps.push({
        id: 'gap_electron_preload_god_object',
        title: `Electron Architecture: Preload exposes ${totalPreloadExposedMethods} methods on window.electronAPI (God-Object)`,
        description: `Exposing ${totalPreloadExposedMethods} flat methods on window.electronAPI causes high contextBridge serialization overhead on window creation and couples UI components to a monolithic interface.`,
        severity: 'medium',
        resolved: false,
        evidence: preloadFiles.map((f) => path.relative(repoPath, f)),
        kind: 'electron_preload_monolith',
        resolutionNote: 'Partition window.electronAPI into domain namespaces (e.g. electronAPI.media, electronAPI.collab, electronAPI.drive).',
      });
    }

    // Security Invariant Gaps
    if (insecurePatterns.length > 0) {
      gaps.push({
        id: 'gap_electron_security_invariants',
        title: `Electron Security: ${insecurePatterns.length} insecure webPreferences detected`,
        description: 'Enabling nodeIntegration or disabling contextIsolation exposes the client to Remote Code Execution (RCE).',
        severity: 'critical',
        resolved: false,
        evidence: insecurePatterns.map((p) => `${p.file}:${p.line} (${p.message})`),
        kind: 'electron_security_violation',
        resolutionNote: 'Enforce contextIsolation: true and nodeIntegration: false.',
      });
    }

    return {
      metrics: {
        isElectronApp,
        totalIpcChannels: channels.size,
        totalPreloadExposedMethods,
        unhandledIpcChannels,
        orphanIpcHandlers,
        preloadFiles: preloadFiles.map((f) => path.relative(repoPath, f)),
        mainProcessFiles: mainProcessFiles.map((f) => path.relative(repoPath, f)),
        security: {
          contextIsolationExplicit,
          nodeIntegrationDisabled,
          sandboxExplicit,
          webSecurityExplicit,
          insecurePatterns,
        },
      },
      gaps,
    };
  }
}
