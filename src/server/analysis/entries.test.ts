import { describe, it, expect } from 'vitest';
import { scanFixture } from './__tests__/scan-fixture.js';

describe('config files and entry points are roots, not orphans', () => {
  it('reports only the genuinely unreferenced file as an orphan', async () => {
    const result = await scanFixture('config-entries');
    // vite/eslint/playwright/tailwind/postcss/commitlint configs, build-*.js,
    // package.json bin + scripts targets and .d.ts files are all roots.
    expect(result.waste.allOrphanFiles).toEqual(['src/unused.ts']);
  });

  it('keeps the exports of package entry points', async () => {
    const result = await scanFixture('config-entries');
    const unused = (result.waste.repoWaste.unusedExportDetails || []).map((u) => `${u.file}:${u.name}`);
    expect(unused).toContain('src/unused.ts:nobodyImportsMe');
    expect(unused).not.toContain('src/index.ts:run');
  });

  it('treats configured entryPoints as roots', async () => {
    const result = await scanFixture('configured');
    expect(result.waste.allOrphanFiles).not.toContain('lib/plugins/extra.ts');
  });
});
