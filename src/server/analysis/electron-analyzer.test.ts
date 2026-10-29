import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ElectronAnalyzer } from './electron-analyzer.js';

describe('ElectronAnalyzer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-electron-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects unhandled IPC channels and insecure webPreferences', () => {
    const electronDir = path.join(tempDir, 'electron');
    fs.mkdirSync(electronDir, { recursive: true });

    // Preload script invoking channels
    fs.writeFileSync(
      path.join(electronDir, 'preload.ts'),
      `import { ipcRenderer } from 'electron';
export const api = {
  fetchUser: () => ipcRenderer.invoke('user:fetch'),
  unhandledOp: () => ipcRenderer.invoke('media:unhandled'),
};`
    );

    // Main process handling one channel and setting insecure webPreferences
    fs.writeFileSync(
      path.join(electronDir, 'main.ts'),
      `import { ipcMain, BrowserWindow } from 'electron';

ipcMain.handle('user:fetch', async () => {
  return { id: 1 };
});

const win = new BrowserWindow({
  webPreferences: {
    nodeIntegration: true,
  }
});`
    );

    const result = ElectronAnalyzer.analyzeElectronApp(tempDir);

    expect(result.metrics.isElectronApp).toBe(true);
    expect(result.metrics.totalIpcChannels).toBe(2);
    expect(result.metrics.unhandledIpcChannels).toContain('media:unhandled');
    expect(result.metrics.security.insecurePatterns.length).toBe(1);
    expect(result.gaps.some((g) => g.kind === 'electron_security_violation')).toBe(true);
  });
});
