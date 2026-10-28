import { describe, it, expect } from 'vitest';
import { gapsOf, scanFixture } from './__tests__/scan-fixture.js';

describe('layer and runtime heuristics', () => {
  it('places electron main, a Cloudflare worker, scripts and shared code in sensible layers', async () => {
    const result = await scanFixture('runtimes');
    const layerOf = (file: string) => result.project.components.find((c) => c.files.some((f) => f.path === file))?.layerId;
    expect(layerOf('electron/main.ts')).toBe('layer_state_ipc');
    expect(layerOf('workers/src/routes/share.ts')).toBe('layer_state_ipc');
    expect(layerOf('scripts/build.mjs')).toBe('layer_tooling');
    expect(layerOf('shared/copy.ts')).toBe('layer_foundation');
    expect(layerOf('src/components/Gallery.tsx')).toBe('layer_presentation');
    expect(result.fileInfo.get('workers/src/index.ts')?.runtime).toMatchObject({ unit: 'workers', kind: 'worker' });
    expect(result.fileInfo.get('electron/main.ts')?.runtime?.kind).toBe('electron-main');
    expect(result.fileInfo.get('src/main.tsx')?.runtime?.kind).toBe('ui');
  });

  it('resolves tsconfig path aliases from a JSONC tsconfig', async () => {
    const result = await scanFixture('runtimes');
    expect(result.fileEdges).toContainEqual(
      expect.objectContaining({ from: 'src/components/Gallery.tsx', to: 'src/policy/access.ts', line: 2 })
    );
  });

  it('flags a worker package reaching into app code and shared code importing app code', async () => {
    const gaps = gapsOf(await scanFixture('runtimes'));
    const cross = gaps.filter((g) => g.kind === 'cross_runtime_import');
    expect(cross).toHaveLength(1);
    expect(cross[0].evidence).toEqual(['workers/src/routes/share.ts:1 → src/policy/access.ts']);
    const shared = gaps.filter((g) => g.kind === 'shared_depends_on_app');
    expect(shared).toHaveLength(1);
    expect(shared[0].evidence).toEqual(['shared/copy.ts:1 → src/policy/access.ts']);
  });

  it('allows main-process code to bundle pure renderer helpers and everyone to import shared/', async () => {
    const gaps = gapsOf(await scanFixture('runtimes'));
    const sources = gaps.flatMap((g) => g.evidence || []);
    expect(sources.some((e) => e.startsWith('electron/'))).toBe(false);
    expect(sources.some((e) => e.includes('→ shared/'))).toBe(false);
    expect(sources.some((e) => e.startsWith('scripts/'))).toBe(false);
  });
});

describe('buildview.config.json', () => {
  it('uses declared layers, test globs, ignore globs and allowed edges', async () => {
    const result = await scanFixture('configured');
    expect(result.configSource).toMatch(/buildview\.config\.json$/);
    expect(result.project.layers.map((l) => l.id)).toEqual(['core', 'app', 'ui']);
    const layerOf = (file: string) => result.project.components.find((c) => c.files.some((f) => f.path === file))?.layerId;
    expect(layerOf('lib/core/store.ts')).toBe('core');
    expect(layerOf('lib/ui/button.ts')).toBe('ui');
    expect(result.fileInfo.get('qa/checks.ts')?.role).toBe('test');
    expect(result.fileInfo.has('legacy/old.ts')).toBe(false);

    const inversions = gapsOf(result).filter((g) => g.kind === 'layer_inversion');
    // core -> ui via store.ts is reported; registry.ts -> ui is an allowed edge.
    expect(inversions).toHaveLength(1);
    expect(inversions[0].evidence).toEqual(['lib/core/store.ts:1 → lib/ui/screen.ts']);
  });
});
