import fs from 'fs';
import path from 'path';
import type { BuildViewProject, GapItem, UnusedExportDetail } from '../shared/types.js';

export type Severity = GapItem['severity'];
export const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high', 'critical'];

export function severityRank(s: Severity): number {
  return SEVERITIES.indexOf(s);
}

/** Lowest severity that fails the check, or 'none' to never fail. */
export type FailThreshold = Severity | 'none';

export function parseSeverity(value: string | undefined, flag: string): Severity {
  const v = (value || '').toLowerCase() as Severity;
  if (!SEVERITIES.includes(v)) {
    throw new Error(`${flag} expects one of ${SEVERITIES.join(', ')} (got "${value ?? ''}")`);
  }
  return v;
}

/**
 * `--fail-on high` fails on high and critical gaps. `--max-severity medium`
 * tolerates up to medium, i.e. the same as `--fail-on high`. Default: any gap fails.
 */
export function resolveFailThreshold(failOn?: string, maxSeverity?: string): FailThreshold {
  if (failOn !== undefined && maxSeverity !== undefined) {
    throw new Error('Use either --fail-on or --max-severity, not both');
  }
  if (failOn !== undefined) return failOn.toLowerCase() === 'none' ? 'none' : parseSeverity(failOn, '--fail-on');
  if (maxSeverity !== undefined) {
    const max = parseSeverity(maxSeverity, '--max-severity');
    return SEVERITIES[severityRank(max) + 1] ?? 'none';
  }
  return 'low';
}

/** Port the dashboard is served on: --port, then BUILDVIEW_PORT, then 3333 (the BuildView server). */
export function resolvePort(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): number {
  const raw = flag ?? (env.BUILDVIEW_PORT || '3333');
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port "${raw}" (use --port <1-65535> or BUILDVIEW_PORT)`);
  }
  return port;
}

export interface ReportedGap {
  id: string;
  componentId: string;
  componentName: string;
  kind: string;
  severity: Severity;
  title: string;
  evidence: string[];
  /** Present in the baseline file, so it does not fail the check. */
  baselined: boolean;
}

export interface Baseline {
  version: 1;
  generatedAt: string;
  gaps: Array<{ id: string; severity: Severity; title: string }>;
}

export function collectGaps(project: BuildViewProject): ReportedGap[] {
  const gaps: ReportedGap[] = [];
  for (const comp of project.components) {
    for (const g of comp.gaps) {
      if (g.resolved) continue;
      gaps.push({
        id: g.id,
        componentId: comp.id,
        componentName: comp.name,
        kind: g.kind || 'reported',
        severity: g.severity,
        title: g.title,
        evidence: g.evidence || [],
        baselined: false,
      });
    }
  }
  return gaps.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id));
}

export function loadBaseline(file: string): Baseline | null {
  if (!fs.existsSync(file)) return null;
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!json || !Array.isArray(json.gaps)) throw new Error(`Invalid baseline file: ${file}`);
  return json as Baseline;
}

export function writeBaseline(file: string, gaps: ReportedGap[]): Baseline {
  const baseline: Baseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    gaps: gaps.map((g) => ({ id: g.id, severity: g.severity, title: g.title })),
  };
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
  return baseline;
}

/** Marks gaps whose id is in the baseline; only the others can fail CI. */
export function applyBaseline(gaps: ReportedGap[], baseline: Baseline | null): ReportedGap[] {
  if (!baseline) return gaps;
  const known = new Set(baseline.gaps.map((g) => g.id));
  return gaps.map((g) => ({ ...g, baselined: known.has(g.id) }));
}

/** Gaps that fail the check: not baselined and at or above the threshold. */
export function failingGaps(gaps: ReportedGap[], failOn: FailThreshold): ReportedGap[] {
  if (failOn === 'none') return [];
  return gaps.filter((g) => !g.baselined && severityRank(g.severity) >= severityRank(failOn));
}

export interface CheckReport {
  tool: 'buildview';
  reportVersion: 1;
  target: string;
  passed: boolean;
  failOn: FailThreshold;
  baseline: string | null;
  summary: {
    gaps: number;
    newGaps: number;
    baselinedGaps: number;
    failingGaps: number;
    bySeverity: Record<Severity, number>;
    byKind: Record<string, number>;
    unusedExports: { localOnly: number; dead: number };
    orphanFiles: number;
  };
  gaps: ReportedGap[];
  waste: {
    unusedExports: UnusedExportDetail[];
    orphanFiles: string[];
  };
  artifact: string | null;
}

export function buildCheckReport(input: {
  target: string;
  gaps: ReportedGap[];
  failOn: FailThreshold;
  baselinePath: string | null;
  unusedExports: UnusedExportDetail[];
  orphanFiles: string[];
  artifact: string | null;
}): CheckReport {
  const failing = failingGaps(input.gaps, input.failOn);
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 } as Record<Severity, number>;
  const byKind: Record<string, number> = {};
  for (const g of input.gaps) {
    bySeverity[g.severity]++;
    byKind[g.kind] = (byKind[g.kind] || 0) + 1;
  }
  const baselined = input.gaps.filter((g) => g.baselined).length;
  return {
    tool: 'buildview',
    reportVersion: 1,
    target: input.target,
    passed: failing.length === 0,
    failOn: input.failOn,
    baseline: input.baselinePath,
    summary: {
      gaps: input.gaps.length,
      newGaps: input.gaps.length - baselined,
      baselinedGaps: baselined,
      failingGaps: failing.length,
      bySeverity,
      byKind,
      unusedExports: {
        localOnly: input.unusedExports.filter((u) => u.usage === 'local_only').length,
        dead: input.unusedExports.filter((u) => u.usage === 'dead').length,
      },
      orphanFiles: input.orphanFiles.length,
    },
    gaps: input.gaps,
    waste: { unusedExports: input.unusedExports, orphanFiles: input.orphanFiles },
    artifact: input.artifact,
  };
}
