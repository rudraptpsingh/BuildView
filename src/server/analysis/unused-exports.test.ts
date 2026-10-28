import { describe, it, expect } from 'vitest';
import { scanFixture } from './__tests__/scan-fixture.js';

describe('unused export classification', () => {
  it('separates "export not needed (used only in file)" from dead symbols, with file:line', async () => {
    const result = await scanFixture('unused-exports');
    const details = (result.waste.repoWaste.unusedExportDetails || []).map((u) => ({
      name: u.name,
      line: u.line,
      usage: u.usage,
      severity: u.severity,
    }));
    expect(details).toEqual([
      { name: 'localOnly', line: 5, usage: 'local_only', severity: 'low' },
      { name: 'deadFn', line: 9, usage: 'dead', severity: 'medium' },
      // An object key with the same name is not a reference.
      { name: 'DEAD_CONST', line: 13, usage: 'dead', severity: 'medium' },
    ]);
    const local = result.waste.repoWaste.unusedExportDetails!.find((u) => u.name === 'localOnly')!;
    expect(local.message).toBe('export not needed (used only in file): localOnly at src/lib.ts:5');
  });

  it('counts only dead symbols as dead code lines', async () => {
    const result = await scanFixture('unused-exports');
    // deadFn (3 lines) + DEAD_CONST (1 line); localOnly's body is still needed.
    expect(result.waste.repoWaste.deadCodeLines).toBe(4);
  });
});
