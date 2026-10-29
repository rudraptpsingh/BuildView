import { describe, it, expect } from 'vitest';
import { ArchitectureScorer } from './scorer.js';
import { BenchmarkEvaluator } from './benchmark-evaluator.js';
import type { BuildViewProject } from '../../shared/types.js';
import type { WasteAnalysisResult } from '../parser/waste-detector.js';
import type { ArchitectureRuleAnalysisResult } from '../parser/architecture-rules.js';

describe('ArchitectureScorer & BenchmarkEvaluator', () => {
  const createMockProject = (overrides: Partial<BuildViewProject> = {}): BuildViewProject => ({
    id: 'proj_test',
    name: 'Test Project',
    description: 'Test architecture',
    version: '1.0.0',
    layers: [
      { id: 'layer_0', name: 'Foundation', order: 0, description: 'Core' },
      { id: 'layer_1', name: 'Domain', order: 1, description: 'Domain logic' },
      { id: 'layer_verification', name: 'Verification', order: 2, description: 'Tests' },
    ],
    components: [
      {
        id: 'comp_core',
        name: 'Core Module',
        layerId: 'layer_0',
        description: 'Core logic',
        color: 'indigo',
        priority: 1,
        status: 'completed',
        progress: 100,
        anatomy: { members: [], functions: [], state: [], callers: [], callees: [] },
        files: [{ path: 'src/core.ts', status: 'created' }],
        testSummary: { testFilesCount: 1, totalTests: 5, status: 'tested', coverageEstimatePercent: 100 },
        gaps: [],
        updatedAt: new Date().toISOString(),
      },
    ],
    lastUpdated: new Date().toISOString(),
    ...overrides,
  });

  const createMockWaste = (overrides: Partial<WasteAnalysisResult> = {}): WasteAnalysisResult => ({
    fileWaste: new Map(),
    repoWaste: {
      unusedExports: [],
      deadCodeLines: 0,
      duplicateFunctions: [],
      orphanFiles: [],
      testZombies: [],
      cleanlinessScore: 100,
      recommendation: 'clean',
    },
    allUnusedExports: [],
    allDuplicates: [],
    allTestZombies: [],
    allOrphanFiles: [],
    ...overrides,
  });

  const createMockRules = (overrides: Partial<ArchitectureRuleAnalysisResult> = {}): ArchitectureRuleAnalysisResult => ({
    violations: [],
    cycles: [],
    checkedFileCount: 1,
    checkedEdgeCount: 0,
    ...overrides,
  });

  it('calculates a pristine A+ score for a clean, fully tested project', () => {
    const project = createMockProject();
    const waste = createMockWaste();
    const rules = createMockRules();

    const score = ArchitectureScorer.calculateHealthScore(project, waste, rules);

    expect(score.overallScore).toBe(100);
    expect(score.grade).toBe('A+');
    expect(score.dimensions.architecture.score).toBe(100);
    expect(score.dimensions.cleanliness.score).toBe(100);
    expect(score.dimensions.verification.score).toBe(100);
    expect(score.dimensions.modularity.score).toBe(100);
    expect(score.remediationPlan.length).toBe(0);
  });

  it('applies proportional deductions for architectural cycles and layer inversions', () => {
    const project = createMockProject();
    const waste = createMockWaste();
    const rules = createMockRules({
      violations: [
        {
          kind: 'circular_dependency',
          severity: 'critical',
          message: 'Component A calls B which calls A',
          fromComponent: 'comp_a',
          toComponent: 'comp_b',
          fromFile: 'src/a.ts',
          toFile: 'src/b.ts',
          line: 10,
        },
        {
          kind: 'layer_inversion',
          severity: 'high',
          message: 'Foundation imports Domain',
          fromComponent: 'comp_core',
          toComponent: 'comp_domain',
          fromFile: 'src/core.ts',
          toFile: 'src/domain.ts',
          line: 5,
        },
      ],
    });

    const score = ArchitectureScorer.calculateHealthScore(project, waste, rules);

    expect(score.dimensions.architecture.score).toBe(65); // 100 - (20 + 15)
    expect(score.overallScore).toBeLessThan(90);
    expect(score.remediationPlan.length).toBe(2);
    expect(score.remediationPlan[0].priority).toBe(1);
    expect(score.remediationPlan[0].category).toBe('architecture');
  });

  it('penalizes dead exports and test zombies', () => {
    const project = createMockProject();
    const waste = createMockWaste({
      allUnusedExports: [
        { name: 'deadFn', kind: 'function', file: 'src/core.ts', line: 12, loc: 25, usage: 'dead' },
      ],
      allTestZombies: [
        { name: 'zombieFn', kind: 'function', file: 'src/core.ts', line: 30, loc: 15 },
      ],
    });
    const rules = createMockRules();

    const score = ArchitectureScorer.calculateHealthScore(project, waste, rules);

    expect(score.dimensions.cleanliness.score).toBeLessThan(100);
    expect(score.dimensions.verification.score).toBeLessThan(100);
    expect(score.remediationPlan.some((r) => r.title.includes('deadFn'))).toBe(true);
    expect(score.remediationPlan.some((r) => r.title.includes('zombieFn'))).toBe(true);
  });

  it('evaluates agent run deltas and detects improvements or regressions', () => {
    const projectBefore = createMockProject();
    const wasteBefore = createMockWaste({
      allUnusedExports: [
        { name: 'oldDeadSymbol', kind: 'function', file: 'src/core.ts', line: 10, loc: 20, usage: 'dead' },
      ],
    });
    const rulesBefore = createMockRules();

    // Agent prunes the dead export in projectAfter
    const projectAfter = createMockProject();
    const wasteAfter = createMockWaste({ allUnusedExports: [] });
    const rulesAfter = createMockRules();

    const evaluation = BenchmarkEvaluator.evaluateAgentRun({
      projectBefore,
      wasteBefore,
      rulesBefore,
      projectAfter,
      wasteAfter,
      rulesAfter,
    });

    expect(evaluation.verdict).toBe('improved');
    expect(evaluation.scoreDelta).toBeGreaterThan(0);
    expect(evaluation.improvementsAchieved.length).toBe(1);
    expect(evaluation.improvementsAchieved[0].message).toContain('oldDeadSymbol');
    expect(evaluation.regressionsIntroduced.length).toBe(0);
    expect(evaluation.tokenSavingsEstimate.tokensSaved).toBeGreaterThan(0);
  });

  it('blocks agent patches that introduce critical circular dependencies', () => {
    const projectBefore = createMockProject();
    const wasteBefore = createMockWaste();
    const rulesBefore = createMockRules();

    // Agent accidentally creates a cycle in projectAfter
    const projectAfter = createMockProject();
    const wasteAfter = createMockWaste();
    const rulesAfter = createMockRules({
      violations: [
        {
          kind: 'circular_dependency',
          severity: 'critical',
          message: 'Cycle between A and B',
          fromFile: 'src/a.ts',
          toFile: 'src/b.ts',
        },
      ],
    });

    const evaluation = BenchmarkEvaluator.evaluateAgentRun({
      projectBefore,
      wasteBefore,
      rulesBefore,
      projectAfter,
      wasteAfter,
      rulesAfter,
    });

    expect(evaluation.verdict).toBe('blocked');
    expect(evaluation.regressionsIntroduced.length).toBe(1);
    expect(evaluation.scoreDelta).toBeLessThan(0);
  });
});
