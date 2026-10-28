import { describe, it, expect } from 'vitest';
import { gapsOf, scanFixture } from './__tests__/scan-fixture.js';

describe('cycle detection', () => {
  it('reports each distinct runtime cycle once, shortest first, with file:line imports', async () => {
    const cycles = gapsOf(await scanFixture('cycles')).filter((g) => g.kind === 'circular_dependency');
    expect(cycles.map((c) => c.evidence)).toEqual([
      ['src/a.ts:1 → src/b.ts', 'src/b.ts:1 → src/a.ts'],
      ['src/c.ts:1 → src/engine/e.ts', 'src/engine/e.ts:1 → src/engine/f.ts', 'src/engine/f.ts:1 → src/c.ts'],
    ]);
  });

  it('rates a loop inside one folder high and a loop across components critical', async () => {
    const cycles = gapsOf(await scanFixture('cycles')).filter((g) => g.kind === 'circular_dependency');
    expect(cycles.map((c) => c.severity)).toEqual(['high', 'critical']);
    expect(cycles[1].title).toMatch(/3 files across 2 components/);
  });

  it('ignores type-only, dynamic-import and test-only loops', async () => {
    const cycles = gapsOf(await scanFixture('cycles')).filter((g) => g.kind === 'circular_dependency');
    const files = cycles.flatMap((c) => c.evidence || []).join(' ');
    expect(files).not.toMatch(/t1|t2|lazy|e2e/);
  });
});
