import { describe, it, expect } from 'vitest';
import { ReachabilityAnalyzer } from './reachability-analyzer.js';
import type { ParsedFileResult } from '../parser/repo-parser.js';
import type { FileEdge } from './dependency-graph.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ReachabilityAnalyzer', () => {
  it('detects unmounted components, orphan preload methods, and phantom testids', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-reach-test-'));

    // Create entrypoint
    const mainDir = path.join(tmpDir, 'src');
    fs.mkdirSync(mainDir, { recursive: true });
    const mainPath = path.join(mainDir, 'main.tsx');
    fs.writeFileSync(
      mainPath,
      `
      import React from 'react';
      import { MountedModal } from './components/MountedModal.js';
      console.log(window.electronAPI.usedApi());
      `
    );

    // Create mounted component with testId prop, conditional branch, and interpolated prefix
    const compDir = path.join(mainDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    const mountedCompPath = path.join(compDir, 'MountedModal.tsx');
    fs.writeFileSync(
      mountedCompPath,
      `
      export function MountedModal() {
        return (
          <div>
            <div data-testid="mounted-modal">Mounted</div>
            <Button testId="primitive-action" />
            <div data-testid={open ? "drawer-open" : "drawer-closed"} />
            <div data-testid={\`tile-\${id}\`} />
          </div>
        );
      }
      `
    );

    // Create unmounted (dead) component
    const deadCompPath = path.join(compDir, 'DeadModal.tsx');
    fs.writeFileSync(
      deadCompPath,
      `
      export function DeadModal() {
        return <div data-testid="dead-modal-action">Dead</div>;
      }
      `
    );

    // Create preload file
    const electronDir = path.join(tmpDir, 'electron');
    fs.mkdirSync(electronDir, { recursive: true });
    const preloadPath = path.join(electronDir, 'preload.ts');
    fs.writeFileSync(
      preloadPath,
      `
      contextBridge.exposeInMainWorld('electronAPI', {
        usedApi: () => ipcRenderer.invoke('channel:used'),
        orphanApi: () => ipcRenderer.invoke('channel:orphan'),
      })
      `
    );

    // Create E2E test file querying:
    // 1. live testids (exact, testId prop, branch, prefix interpolation)
    // 2. deliberate negative assertion (.toHaveCount(0))
    // 3. dead component testid (unmounted)
    // 4. completely unknown testid (unknown)
    const e2eDir = path.join(tmpDir, 'e2e');
    fs.mkdirSync(e2eDir, { recursive: true });
    const specPath = path.join(e2eDir, 'modal.spec.ts');
    fs.writeFileSync(
      specPath,
      `
      test('live and dead locators', async ({ page }) => {
        // Live exact & primitive prop
        await page.click('[data-testid="mounted-modal"]');
        await page.getByTestId('primitive-action').click();
        
        // Live conditional branch & dynamic prefix interpolation
        await page.getByTestId('drawer-open').isVisible();
        await page.getByTestId('tile-42').click();

        // Deliberate removal assertion (should NOT be flagged as phantom)
        await expect(page.getByTestId('old-removed-feature')).toHaveCount(0);

        // Unmounted dead locator (REAL phantom finding!)
        await page.click('[data-testid="dead-modal-action"]');

        // Unknown testid non-existent in codebase
        await page.getByTestId('non-existent-ghost').click();
      });
      `
    );

    const parsedFiles: ParsedFileResult[] = [
      { filePath: 'src/main.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
      { filePath: 'src/components/MountedModal.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
      { filePath: 'src/components/DeadModal.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
      { filePath: 'electron/preload.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
      { filePath: 'e2e/modal.spec.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
    ];

    const edges: FileEdge[] = [
      {
        from: 'src/main.tsx',
        to: 'src/components/MountedModal.tsx',
        line: 3,
        specifier: './components/MountedModal.js',
        typeOnly: false,
        kind: 'import',
      },
    ];

    const result = ReachabilityAnalyzer.analyzeReachability(tmpDir, parsedFiles, edges, ['src/main.tsx']);

    // Assertions
    expect(result.metrics.totalUnmountedComponents).toBe(1);
    expect(result.unmountedComponents[0].name).toBe('DeadModal');

    expect(result.metrics.totalOrphanPreloadMethods).toBe(1);
    expect(result.orphanPreloadMethods[0].method).toBe('orphanApi');

    // Only 1 unmounted dead testid reference (dead-modal-action), NOT the live or negative ones!
    expect(result.metrics.totalPhantomTestIds).toBe(1);
    expect(result.metrics.totalUnknownTestIds).toBe(1);

    const unmountedItem = result.phantomTestIds.find((p) => p.kind === 'unmounted');
    expect(unmountedItem).toBeDefined();
    expect(unmountedItem!.testId).toBe('dead-modal-action');
    expect(unmountedItem!.definedInUnmountedFile).toBe('src/components/DeadModal.tsx');

    const unknownItem = result.phantomTestIds.find((p) => p.kind === 'unknown');
    expect(unknownItem).toBeDefined();
    expect(unknownItem!.testId).toBe('non-existent-ghost');

    expect(result.gaps.length).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('correctly recognizes nested namespace, method shorthand, and destructured bridge calls', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-nested-reach-'));

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'main.tsx'),
      `
      // Call via nested namespace with optional chaining
      window.electronAPI?.systemAppearance?.onChanged((theme) => console.log(theme));

      // Destructured call
      const { queryStatus } = window.electronAPI;
      queryStatus();

      // Shorthand method call
      window.electronAPI.getVersion();
      `
    );

    const electronDir = path.join(tmpDir, 'electron');
    fs.mkdirSync(electronDir, { recursive: true });
    fs.writeFileSync(
      path.join(electronDir, 'preload.ts'),
      `
      contextBridge.exposeInMainWorld('electronAPI', {
        systemAppearance: {
          onChanged: (cb: any) => ipcRenderer.on('appearance', cb),
        },
        queryStatus: () => ipcRenderer.invoke('status:query'),
        async getVersion() {
          return ipcRenderer.invoke('app:version');
        },
        trueOrphanMethod: () => ipcRenderer.invoke('orphan:call'),
      });
      `
    );

    const parsedFiles: ParsedFileResult[] = [
      { filePath: 'src/main.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
      { filePath: 'electron/preload.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
    ];

    const result = ReachabilityAnalyzer.analyzeReachability(tmpDir, parsedFiles, [], ['src/main.tsx']);

    // Only 'trueOrphanMethod' should be flagged as orphan!
    // 'onChanged', 'queryStatus', and 'getVersion' must all be recognized as reachable.
    expect(result.metrics.totalOrphanPreloadMethods).toBe(1);
    expect(result.orphanPreloadMethods[0].method).toBe('trueOrphanMethod');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
