import { describe, it, expect } from 'vitest';
import { classifyFileRole, isTestPath } from './file-roles.js';
import { gapsOf, scanFixture } from './__tests__/scan-fixture.js';

describe('test-aware classification', () => {
  it('classifies test files, test folders, stories, fixtures and test configs as tests', () => {
    for (const p of [
      'src/a.test.ts',
      'src/a.spec.tsx',
      'src/components/__tests__/seed.ts',
      'tests/unit.ts',
      'test/x.js',
      'e2e/helpers/app.ts',
      'e2e/fixtures/data.ts',
      'packages/web/cypress/support.ts',
      'src/Button.stories.tsx',
      'playwright.config.ts',
      'playwright.visual.config.ts',
      'src/testing/factories.ts',
    ]) {
      expect(isTestPath(p), p).toBe(true);
    }
    for (const p of ['src/latest.ts', 'src/contest/entry.ts', 'src/components/Panel.tsx', 'electron/main.ts']) {
      expect(isTestPath(p), p).toBe(false);
    }
  });

  it('honours configured test globs and tooling folders', () => {
    expect(classifyFileRole('qa/checks.ts', { testGlobs: ['qa/**'] })).toBe('test');
    expect(classifyFileRole('scripts/release.ts')).toBe('tooling');
    expect(classifyFileRole('src/scripts/inline.ts')).toBe('product');
    expect(classifyFileRole('vite.config.ts')).toBe('tooling');
    expect(classifyFileRole('src/index.ts')).toBe('product');
  });

  it('puts e2e/, fixtures and specs in the test layer and scripts in the tooling layer', async () => {
    const result = await scanFixture('tests-vs-product');
    const layerOf = (file: string) => result.project.components.find((c) => c.files.some((f) => f.path === file))?.layerId;
    expect(layerOf('e2e/helpers/app.ts')).toBe('layer_verification');
    expect(layerOf('e2e/fixtures/data.ts')).toBe('layer_verification');
    expect(layerOf('src/components/Panel.stories.tsx')).toBe('layer_verification');
    expect(layerOf('playwright.config.ts')).toBe('layer_verification');
    expect(layerOf('scripts/verify.ts')).toBe('layer_tooling');
    expect(layerOf('src/components/Panel.tsx')).toBe('layer_presentation');
  });

  it('ignores test-only cycles and tests importing product code', async () => {
    const gaps = gapsOf(await scanFixture('tests-vs-product'));
    // scripts/verify.ts <-> e2e/helpers/app.ts is a test/tooling-only loop.
    expect(gaps.filter((g) => g.kind === 'circular_dependency')).toEqual([]);
    // e2e/ and e2e/fixtures importing src/components is how tests work.
    expect(gaps.filter((g) => g.kind === 'layer_inversion')).toEqual([]);
  });

  it('flags product code importing test code, with file:line evidence', async () => {
    const gaps = gapsOf(await scanFixture('tests-vs-product'));
    const forbidden = gaps.filter((g) => g.kind === 'forbidden_dependency');
    expect(forbidden).toHaveLength(1);
    expect(forbidden[0].severity).toBe('critical');
    expect(forbidden[0].evidence).toEqual(['src/store/state.ts:1 → src/__tests__/seed.ts']);
  });
});

describe('nested package tooling', () => {
  it('treats scripts/ at the root of a nested package as tooling', () => {
    // test-fixtures/runtimes/workers has its own package.json
    const root = new URL('../../../test-fixtures/runtimes', import.meta.url).pathname;
    expect(classifyFileRole('workers/scripts/seed.ts', {}, root)).toBe('tooling');
    expect(classifyFileRole('src/scripts/seed.ts', {}, root)).toBe('product');
  });
});
