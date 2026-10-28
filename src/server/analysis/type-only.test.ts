import { describe, it, expect } from 'vitest';
import { RepoParser } from '../parser/repo-parser.js';
import { gapsOf, scanFixture } from './__tests__/scan-fixture.js';

describe('type-only imports', () => {
  it('marks `import type` and all-`type` specifier imports as type-only, with line numbers', () => {
    const parsed = RepoParser.parseFile(
      'src/x.ts',
      `import type { A } from './a';\nimport { type B, type C } from './b';\nimport { D, type E } from './d';\nexport type { F } from './f';\n`
    );
    const byspec = Object.fromEntries((parsed.importDetails || []).map((d) => [d.specifier, d]));
    expect(byspec['./a'].isTypeOnly).toBe(true);
    expect(byspec['./b'].isTypeOnly).toBe(true);
    expect(byspec['./d'].isTypeOnly).toBe(false);
    expect(byspec['./f']).toMatchObject({ isTypeOnly: true, kind: 'reexport', line: 4 });
    expect(byspec['./b'].line).toBe(2);
  });

  it('reports a renderer importing main-process types as a low "type-only boundary crossing"', async () => {
    const gaps = gapsOf(await scanFixture('type-only'));
    const typeOnly = gaps.filter((g) => g.kind === 'type_only_boundary');
    expect(typeOnly).toHaveLength(1);
    expect(typeOnly[0].severity).toBe('low');
    expect(typeOnly[0].evidence).toEqual([
      'src/components/JobPanel.tsx:2 → electron/jobs.ts (type-only)',
      'src/components/JobPanel.tsx:3 → electron/jobs.ts (type-only)',
    ]);
    expect(typeOnly[0].description).toMatch(/shared module/);
  });

  it('still reports a runtime import from the renderer into main-process code as high', async () => {
    const gaps = gapsOf(await scanFixture('type-only'));
    const runtime = gaps.filter((g) => g.kind === 'cross_runtime_import');
    expect(runtime).toHaveLength(1);
    expect(runtime[0].severity).toBe('high');
    expect(runtime[0].evidence).toEqual(['src/hooks/useLimit.ts:1 → electron/jobs.ts']);
    // Type-only imports never count as hard dependencies.
    expect(gaps.some((g) => g.kind === 'circular_dependency' || g.kind === 'layer_inversion')).toBe(false);
  });
});
