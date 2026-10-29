import fs from 'fs';
import path from 'path';

export interface BuildViewRatchetTotals {
  colorLiterals: number;
  offScaleHeights: number;
  offScaleTypeSizes: number;
  iconLiterals: number;
  arbitraryClasses: number;
  unmergedDynamicClasses: number;
  syncIoCalls: number;
  missingTestIds: number;
}

export interface BuildViewBaseline {
  version: number;
  updatedAt: string;
  totals: BuildViewRatchetTotals;
  files?: Record<string, Partial<BuildViewRatchetTotals>>;
}

export interface RatchetDelta {
  category: keyof BuildViewRatchetTotals;
  baseline: number;
  current: number;
  delta: number;
  status: 'improved' | 'held' | 'regressed';
}

export interface RatchetCheckResult {
  passed: boolean;
  baselineExists: boolean;
  baselinePath: string;
  deltas: RatchetDelta[];
  regressions: RatchetDelta[];
  improvements: RatchetDelta[];
  summary: string;
}

export class RatchetManager {
  public static readonly DEFAULT_BASELINE_FILE = '.buildview-baseline.json';

  /**
   * Resolves baseline file path in target repository.
   */
  public static resolveBaselinePath(repoPath: string, customFile?: string): string {
    const filename = customFile || this.DEFAULT_BASELINE_FILE;
    return path.isAbsolute(filename) ? filename : path.join(repoPath, filename);
  }

  /**
   * Reads existing baseline if available.
   */
  public static readBaseline(repoPath: string, customFile?: string): BuildViewBaseline | null {
    const filePath = this.resolveBaselinePath(repoPath, customFile);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as BuildViewBaseline;
    } catch {
      return null;
    }
  }

  /**
   * Writes or updates the baseline file.
   */
  public static writeBaseline(
    repoPath: string,
    totals: BuildViewRatchetTotals,
    files?: Record<string, Partial<BuildViewRatchetTotals>>,
    customFile?: string
  ): void {
    const filePath = this.resolveBaselinePath(repoPath, customFile);
    const baseline: BuildViewBaseline = {
      version: 1,
      updatedAt: new Date().toISOString(),
      totals,
      files,
    };
    fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
  }

  /**
   * Compares current totals against recorded baseline with strict monotonicity.
   * In 'enforce' mode: fails if any category increases.
   * In 'update' mode: updates the baseline with current totals if valid.
   * In 'report' mode: computes deltas without failing or updating.
   */
  public static checkRatchet(
    repoPath: string,
    currentTotals: BuildViewRatchetTotals,
    options: {
      mode?: 'enforce' | 'update' | 'report';
      baselineFile?: string;
      files?: Record<string, Partial<BuildViewRatchetTotals>>;
    } = {}
  ): RatchetCheckResult {
    const mode = options.mode || 'enforce';
    const baselinePath = this.resolveBaselinePath(repoPath, options.baselineFile);
    const baseline = this.readBaseline(repoPath, options.baselineFile);

    if (!baseline) {
      // First run: establish baseline
      if (mode === 'update' || mode === 'enforce') {
        this.writeBaseline(repoPath, currentTotals, options.files, options.baselineFile);
      }
      return {
        passed: true,
        baselineExists: false,
        baselinePath,
        deltas: [],
        regressions: [],
        improvements: [],
        summary: `Established new ratchet baseline in ${path.basename(baselinePath)}. All subsequent changes will enforce monotonic debt reduction.`,
      };
    }

    const categories: (keyof BuildViewRatchetTotals)[] = [
      'colorLiterals',
      'offScaleHeights',
      'offScaleTypeSizes',
      'iconLiterals',
      'arbitraryClasses',
      'unmergedDynamicClasses',
      'syncIoCalls',
      'missingTestIds',
    ];

    const deltas: RatchetDelta[] = [];
    const regressions: RatchetDelta[] = [];
    const improvements: RatchetDelta[] = [];

    for (const cat of categories) {
      const baseVal = baseline.totals[cat] ?? 0;
      const currVal = currentTotals[cat] ?? 0;
      const diff = currVal - baseVal;

      let status: 'improved' | 'held' | 'regressed' = 'held';
      if (diff > 0) {
        status = 'regressed';
      } else if (diff < 0) {
        status = 'improved';
      }

      const deltaObj: RatchetDelta = {
        category: cat,
        baseline: baseVal,
        current: currVal,
        delta: diff,
        status,
      };

      deltas.push(deltaObj);
      if (status === 'regressed') regressions.push(deltaObj);
      if (status === 'improved') improvements.push(deltaObj);
    }

    const passed = mode !== 'enforce' || regressions.length === 0;

    // In update mode, update baseline to current or lower counts
    if (mode === 'update' && (regressions.length === 0 || options.mode === 'update')) {
      this.writeBaseline(repoPath, currentTotals, options.files, options.baselineFile);
    }

    let summary = '';
    if (regressions.length > 0) {
      const regList = regressions.map((r) => `${r.category} (+${r.delta})`).join(', ');
      summary = `❌ Ratchet REGRESSION detected: ${regList} increased over baseline! Total debt must never grow.`;
    } else if (improvements.length > 0) {
      const impList = improvements.map((i) => `${i.category} (${i.delta})`).join(', ');
      summary = `✅ Ratchet IMPROVED: ${impList} successfully paid down.`;
    } else {
      summary = `✅ Ratchet HELD: All 8 architectural debt metrics held steady with baseline.`;
    }

    return {
      passed,
      baselineExists: true,
      baselinePath,
      deltas,
      regressions,
      improvements,
      summary,
    };
  }
}
