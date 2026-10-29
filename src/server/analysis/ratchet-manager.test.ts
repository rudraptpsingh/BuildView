import { describe, it, expect } from 'vitest';
import { RatchetManager, type BuildViewRatchetTotals } from './ratchet-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('RatchetManager', () => {
  it('establishes baseline, detects improvements, and halts regressions', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-ratchet-test-'));

    const initialTotals: BuildViewRatchetTotals = {
      colorLiterals: 10,
      offScaleHeights: 5,
      offScaleTypeSizes: 8,
      iconLiterals: 2,
      arbitraryClasses: 4,
      unmergedDynamicClasses: 3,
      syncIoCalls: 1,
      missingTestIds: 2,
    };

    // 1. First run establishes baseline
    const r1 = RatchetManager.checkRatchet(tmpDir, initialTotals, { mode: 'enforce' });
    expect(r1.passed).toBe(true);
    expect(r1.baselineExists).toBe(false);
    expect(fs.existsSync(r1.baselinePath)).toBe(true);

    // 2. Second run with same values holds steady
    const r2 = RatchetManager.checkRatchet(tmpDir, initialTotals, { mode: 'enforce' });
    expect(r2.passed).toBe(true);
    expect(r2.baselineExists).toBe(true);
    expect(r2.regressions.length).toBe(0);
    expect(r2.improvements.length).toBe(0);
    expect(r2.summary).toContain('HELD');

    // 3. Third run with improved (lower) numbers passes
    const improvedTotals: BuildViewRatchetTotals = {
      ...initialTotals,
      colorLiterals: 6, // 4 paid down
      syncIoCalls: 0,   // 1 eliminated
    };
    const r3 = RatchetManager.checkRatchet(tmpDir, improvedTotals, { mode: 'enforce' });
    expect(r3.passed).toBe(true);
    expect(r3.regressions.length).toBe(0);
    expect(r3.improvements.length).toBe(2);
    expect(r3.summary).toContain('IMPROVED');

    // 4. Fourth run with regressed numbers fails in enforce mode
    const regressedTotals: BuildViewRatchetTotals = {
      ...initialTotals,
      offScaleHeights: 7, // +2 regression
    };
    const r4 = RatchetManager.checkRatchet(tmpDir, regressedTotals, { mode: 'enforce' });
    expect(r4.passed).toBe(false);
    expect(r4.regressions.length).toBe(1);
    expect(r4.regressions[0].category).toBe('offScaleHeights');
    expect(r4.regressions[0].delta).toBe(2);
    expect(r4.summary).toContain('REGRESSION');

    // 5. Update mode updates baseline file
    const r5 = RatchetManager.checkRatchet(tmpDir, improvedTotals, { mode: 'update' });
    expect(r5.passed).toBe(true);
    const readBack = RatchetManager.readBaseline(tmpDir);
    expect(readBack?.totals.colorLiterals).toBe(6);
    expect(readBack?.totals.syncIoCalls).toBe(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
