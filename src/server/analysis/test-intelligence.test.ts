import { describe, it, expect } from 'vitest';
import { TestIntelligenceEngine } from './test-intelligence.js';
import type { ParsedFileResult } from '../parser/repo-parser.js';
import type { FileEdge } from './dependency-graph.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TestIntelligenceEngine', () => {
  it('classifies test lanes accurately', () => {
    expect(TestIntelligenceEngine.classifyTestLane('src/utils/math.test.ts')).toBe('L1_unit');
    expect(TestIntelligenceEngine.classifyTestLane('src/components/__tests__/Button.test.tsx')).toBe('L2_component');
    expect(TestIntelligenceEngine.classifyTestLane('scripts/test-contracts.cjs')).toBe('L3_contract');
    expect(TestIntelligenceEngine.classifyTestLane('electron/main.test.ts')).toBe('L4_platform');
    expect(TestIntelligenceEngine.classifyTestLane('electron/driveProfiles.test.ts')).toBe('L5_hardware');
    expect(TestIntelligenceEngine.classifyTestLane('e2e/specs/cull/review.spec.ts')).toBe('L6_e2e');
  });

  it('maps impacted tests across reverse DAG, co-location, and testids', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-test-map-'));

    const parsedFiles: ParsedFileResult[] = [
      { filePath: 'src/components/MyButton.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '<button data-testid="my-button" />' },
      { filePath: 'src/components/MyButton.test.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'test()' },
      { filePath: 'src/views/MyView.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'import { MyButton } from "../components/MyButton"' },
      { filePath: 'src/views/MyView.test.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'import { MyView } from "./MyView"' },
      { filePath: 'e2e/specs/button.spec.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'page.getByTestId("my-button")' },
    ];

    const edges: FileEdge[] = [
      {
        from: 'src/views/MyView.tsx',
        to: 'src/components/MyButton.tsx',
        line: 1,
        specifier: '../components/MyButton',
        typeOnly: false,
        kind: 'import',
      },
      {
        from: 'src/views/MyView.test.tsx',
        to: 'src/views/MyView.tsx',
        line: 1,
        specifier: './MyView',
        typeOnly: false,
        kind: 'import',
      },
      {
        from: 'src/components/MyButton.test.tsx',
        to: 'src/components/MyButton.tsx',
        line: 1,
        specifier: './MyButton',
        typeOnly: false,
        kind: 'import',
      },
    ];

    const result = TestIntelligenceEngine.mapImpactedTests(tmpDir, ['src/components/MyButton.tsx'], parsedFiles, edges);

    // Assertions
    expect(result.impactedTests.length).toBeGreaterThanOrEqual(3);

    const testFiles = result.impactedTests.map((t) => t.testFile);
    // Co-located test
    expect(testFiles).toContain('src/components/MyButton.test.tsx');
    // Reverse DAG consumer test
    expect(testFiles).toContain('src/views/MyView.test.tsx');
    // TestID querying E2E spec
    expect(testFiles).toContain('e2e/specs/button.spec.ts');

    expect(result.commands.length).toBeGreaterThanOrEqual(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('suggests auto-healing repairs for dead selectors based on semantic similarity', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-repair-test-'));

    // Create entrypoint
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'main.tsx'), `import './components/LiveModal.js';`);

    const compDir = path.join(srcDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(
      path.join(compDir, 'LiveModal.tsx'),
      `<div data-testid="share-session-join">Live Modal</div>`
    );

    const e2eDir = path.join(tmpDir, 'e2e');
    fs.mkdirSync(e2eDir, { recursive: true });
    const specPath = path.join(e2eDir, 'modal.spec.ts');
    fs.writeFileSync(
      specPath,
      `await page.getByTestId('share-session-button').click();`
    );

    const parsedFiles: ParsedFileResult[] = [
      { filePath: 'src/main.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '' },
      { filePath: 'src/components/LiveModal.tsx', classes: [], interfaces: [], functions: [], exports: [], rawContent: '<div data-testid="share-session-join">Live Modal</div>' },
      { filePath: 'e2e/modal.spec.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: `await page.getByTestId('share-session-button').click();` },
    ];

    const edges: FileEdge[] = [
      {
        from: 'src/main.tsx',
        to: 'src/components/LiveModal.tsx',
        line: 1,
        specifier: './components/LiveModal.js',
        typeOnly: false,
        kind: 'import',
      },
    ];

    const repair = TestIntelligenceEngine.suggestSpecRepairs(tmpDir, parsedFiles, edges);

    expect(repair.suggestions.length).toBe(1);
    expect(repair.suggestions[0].deadTestId).toBe('share-session-button');
    expect(repair.suggestions[0].suggestedLiveTestId).toBe('share-session-join');
    expect(repair.suggestions[0].confidence).toBeGreaterThan(0.5);
    expect(repair.suggestions[0].patchDiff).toContain('- [data-testid="share-session-button"]');
    expect(repair.suggestions[0].patchDiff).toContain('+ [data-testid="share-session-join"]');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates targeted execution commands for L3 architectural contract tests and node scripts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-l3-test-'));

    const parsedFiles: ParsedFileResult[] = [
      { filePath: 'src/core/schema.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'export const schema = 1;' },
      { filePath: 'scripts/verify-contracts.cjs', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'const { schema } = require("../src/core/schema");' },
      { filePath: 'src/contracts/invariants.test.ts', classes: [], interfaces: [], functions: [], exports: [], rawContent: 'import { schema } from "../core/schema";' },
    ];

    const edges: FileEdge[] = [
      {
        from: 'scripts/verify-contracts.cjs',
        to: 'src/core/schema.ts',
        line: 1,
        specifier: '../src/core/schema',
        typeOnly: false,
        kind: 'require',
      },
      {
        from: 'src/contracts/invariants.test.ts',
        to: 'src/core/schema.ts',
        line: 1,
        specifier: '../core/schema',
        typeOnly: false,
        kind: 'import',
      },
    ];

    const result = TestIntelligenceEngine.mapImpactedTests(tmpDir, ['src/core/schema.ts'], parsedFiles, edges);

    expect(result.byLane.L3_contract).toHaveLength(2);
    expect(result.byLane.L3_contract).toContain('src/contracts/invariants.test.ts');
    expect(result.byLane.L3_contract).toContain('scripts/verify-contracts.cjs');

    const l3Commands = result.commands.filter((c) => c.lane === 'L3_contract');
    expect(l3Commands).toHaveLength(2);

    const vitestCmd = l3Commands.find((c) => c.command.startsWith('npx vitest run'));
    expect(vitestCmd).toBeDefined();
    expect(vitestCmd!.command).toContain('src/contracts/invariants.test.ts');

    const nodeCmd = l3Commands.find((c) => c.command.startsWith('node'));
    expect(nodeCmd).toBeDefined();
    expect(nodeCmd!.command).toBe('node scripts/verify-contracts.cjs');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
