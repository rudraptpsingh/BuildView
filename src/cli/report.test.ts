import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  applyBaseline,
  failingGaps,
  loadBaseline,
  resolveFailThreshold,
  resolvePort,
  writeBaseline,
  ReportedGap,
} from './report.js';
import { parseCliArgs } from './args.js';

const gap = (id: string, severity: ReportedGap['severity']): ReportedGap => ({
  id,
  componentId: 'c',
  componentName: 'C',
  kind: 'layer_inversion',
  severity,
  title: id,
  evidence: [],
  baselined: false,
});

describe('CLI options', () => {
  it('resolves the dashboard port from --port, then BUILDVIEW_PORT, then 3333', () => {
    expect(resolvePort('4100', {})).toBe(4100);
    expect(resolvePort(undefined, { BUILDVIEW_PORT: '4200' })).toBe(4200);
    expect(resolvePort(undefined, {})).toBe(3333);
    expect(() => resolvePort('abc', {})).toThrow(/Invalid port/);
  });

  it('maps --fail-on and --max-severity to a failure threshold', () => {
    expect(resolveFailThreshold()).toBe('low');
    expect(resolveFailThreshold('high')).toBe('high');
    expect(resolveFailThreshold(undefined, 'medium')).toBe('high');
    expect(resolveFailThreshold(undefined, 'critical')).toBe('none');
    expect(resolveFailThreshold('none')).toBe('none');
    expect(() => resolveFailThreshold('severe')).toThrow(/--fail-on expects/);
    expect(() => resolveFailThreshold('high', 'low')).toThrow(/either/);
  });

  it('parses commands, positional target and flags', () => {
    expect(parseCliArgs(['check', 'repo', '--json', '--fail-on=high', '--baseline', 'b.json'])).toMatchObject({
      command: 'check',
      target: 'repo',
      json: true,
      failOn: 'high',
      baseline: 'b.json',
    });
    expect(parseCliArgs(['.'])).toMatchObject({ command: 'scan', target: '.' });
    expect(parseCliArgs(['--help'])).toBe('help');
    expect(() => parseCliArgs(['check', '--bogus'])).toThrow(/Unknown option/);
    expect(() => parseCliArgs(['check', '--update-baseline'])).toThrow(/--baseline/);
  });
});

describe('severity threshold and baseline', () => {
  it('fails only on gaps at or above the threshold', () => {
    const gaps = [gap('a', 'low'), gap('b', 'medium'), gap('c', 'critical')];
    expect(failingGaps(gaps, 'medium').map((g) => g.id)).toEqual(['b', 'c']);
    expect(failingGaps(gaps, 'none')).toEqual([]);
  });

  it('lets existing debt pass while new gaps fail', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-baseline-')), 'buildview-baseline.json');
    writeBaseline(file, [gap('old', 'critical')]);
    const marked = applyBaseline([gap('old', 'critical'), gap('new', 'high')], loadBaseline(file));
    expect(failingGaps(marked, 'low').map((g) => g.id)).toEqual(['new']);
    expect(loadBaseline(path.join(path.dirname(file), 'missing.json'))).toBeNull();
  });
});

describe('check --json (end to end)', () => {
  const tsxCli = path.resolve(import.meta.dirname, '../../node_modules/tsx/dist/cli.mjs');
  const cli = path.resolve(import.meta.dirname, 'index.ts');
  const fixture = path.resolve(import.meta.dirname, '../../test-fixtures/cycles');
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [tsxCli, cli, 'check', fixture, '--json', '--no-write', ...args], {
      encoding: 'utf-8',
      env: { ...process.env, BUILDVIEW_PORT: '' },
    });

  it('leaves the working directory untouched (no artifact, no .buildview state)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-cwd-'));
    spawnSync(process.execPath, [tsxCli, cli, 'check', fixture, '--json', '--no-write'], { cwd, encoding: 'utf-8' });
    expect(fs.readdirSync(cwd)).toEqual([]);
    expect(fs.existsSync(path.join(fixture, 'buildview-architecture.json'))).toBe(false);
  }, 20000);

  it('prints only a JSON report and exits 1 when gaps fail', () => {
    const res = run();
    const report = JSON.parse(res.stdout);
    expect(res.status).toBe(1);
    expect(report.passed).toBe(false);
    expect(report.summary.byKind.circular_dependency).toBe(2);
    expect(report.gaps[0].evidence.length).toBeGreaterThan(0);
  }, 20000);

  it('passes with a baseline of the current gaps', () => {
    const baseline = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-cli-')), 'baseline.json');
    expect(run('--baseline', baseline, '--update-baseline').status).toBe(0);
    const res = run('--baseline', baseline);
    const report = JSON.parse(res.stdout);
    expect(res.status).toBe(0);
    expect(report.summary.baselinedGaps).toBe(2);
    expect(report.summary.newGaps).toBe(0);
  }, 20000);
});
