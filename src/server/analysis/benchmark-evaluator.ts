import type {
  BuildViewProject,
  ArchitectureHealthScore,
  AgentBenchmarkEvaluation,
  GapItem,
} from '../../shared/types.js';
import type { WasteAnalysisResult } from '../parser/waste-detector.js';
import type { ArchitectureRuleAnalysisResult } from '../parser/architecture-rules.js';
import { ArchitectureScorer } from './scorer.js';

export interface EvaluationInput {
  projectBefore: BuildViewProject;
  wasteBefore: WasteAnalysisResult;
  rulesBefore: ArchitectureRuleAnalysisResult;
  projectAfter: BuildViewProject;
  wasteAfter: WasteAnalysisResult;
  rulesAfter: ArchitectureRuleAnalysisResult;
}

export class BenchmarkEvaluator {
  /**
   * Compares the codebase state before and after an agent's run
   * to evaluate whether the agent improved or regressed architectural health.
   */
  public static evaluateAgentRun(input: EvaluationInput): AgentBenchmarkEvaluation {
    const scoreBefore = ArchitectureScorer.calculateHealthScore(
      input.projectBefore,
      input.wasteBefore,
      input.rulesBefore
    );
    const scoreAfter = ArchitectureScorer.calculateHealthScore(
      input.projectAfter,
      input.wasteAfter,
      input.rulesAfter
    );

    const scoreDelta = scoreAfter.overallScore - scoreBefore.overallScore;

    const getViolationKey = (v: any) => {
      const kind = v.kind || v.type || 'violation';
      const from = v.fromFile || v.evidence?.[0]?.from || v.sourceId || '';
      const to = v.toFile || v.evidence?.[0]?.to || v.targetId || '';
      const line = v.line || v.evidence?.[0]?.line || 0;
      return `${kind}:${from}->${to}:${line}`;
    };

    // Detect new regressions
    const beforeViolationKeys = new Set(input.rulesBefore.violations.map(getViolationKey));
    const regressionsIntroduced: AgentBenchmarkEvaluation['regressionsIntroduced'] = [];

    for (const v of input.rulesAfter.violations) {
      const key = getViolationKey(v);
      if (!beforeViolationKeys.has(key)) {
        regressionsIntroduced.push({
          type: (v as any).kind || v.type,
          severity: v.severity,
          message: v.message,
          evidence: (v.evidence as any) || [],
        });
      }
    }

    // New dead exports introduced
    const beforeDeadExports = new Set(
      input.wasteBefore.allUnusedExports.filter((e) => e.usage === 'dead').map((e) => `${e.file}:${e.name}`)
    );
    for (const de of input.wasteAfter.allUnusedExports.filter((e) => e.usage === 'dead')) {
      const key = `${de.file}:${de.name}`;
      if (!beforeDeadExports.has(key)) {
        regressionsIntroduced.push({
          type: 'new_dead_export',
          severity: 'medium',
          message: `Introduced dead export "${de.name}" in ${de.file}:${de.line}`,
        });
      }
    }

    // Detect improvements
    const improvementsAchieved: AgentBenchmarkEvaluation['improvementsAchieved'] = [];
    const afterViolationKeys = new Set(input.rulesAfter.violations.map(getViolationKey));
    for (const v of input.rulesBefore.violations) {
      const key = getViolationKey(v);
      if (!afterViolationKeys.has(key)) {
        const kind = (v as any).kind || v.type;
        improvementsAchieved.push({
          type: `resolved_${kind}`,
          message: `Resolved violation: ${v.message}`,
        });
      }
    }

    const afterDeadExports = new Set(
      input.wasteAfter.allUnusedExports.filter((e) => e.usage === 'dead').map((e) => `${e.file}:${e.name}`)
    );
    for (const de of input.wasteBefore.allUnusedExports.filter((e) => e.usage === 'dead')) {
      const key = `${de.file}:${de.name}`;
      if (!afterDeadExports.has(key)) {
        improvementsAchieved.push({
          type: 'pruned_dead_export',
          message: `Pruned dead export "${de.name}" from ${de.file}`,
        });
      }
    }

    // Estimate token efficiency: raw files vs component contract
    const totalFiles = input.projectAfter.components.reduce((sum, c) => sum + c.files.length, 0);
    const estimatedRawTokens = totalFiles * 800; // ~800 tokens per file average
    const estimatedContractTokens = input.projectAfter.components.length * 150; // ~150 tokens per component anatomy
    const tokensSaved = Math.max(0, estimatedRawTokens - estimatedContractTokens);
    const savingsPercent =
      estimatedRawTokens > 0 ? Math.round((tokensSaved / estimatedRawTokens) * 100) : 0;

    // Determine verdict
    let verdict: AgentBenchmarkEvaluation['verdict'] = 'neutral';
    const criticalRegressions = regressionsIntroduced.filter(
      (r) => r.severity === 'critical' || r.severity === 'high'
    );

    if (criticalRegressions.length > 0) {
      verdict = 'blocked';
    } else if (regressionsIntroduced.length > 0 && scoreDelta <= 0) {
      verdict = 'regressed';
    } else if (scoreDelta > 0 || improvementsAchieved.length > 0) {
      verdict = 'improved';
    }

    const summary = [
      `Agent Evaluation: ${verdict.toUpperCase()}`,
      `Health Score: ${scoreBefore.overallScore} (${scoreBefore.grade}) -> ${scoreAfter.overallScore} (${scoreAfter.grade}) [${scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} pts]`,
      `Regressions Introduced: ${regressionsIntroduced.length}`,
      `Improvements Achieved: ${improvementsAchieved.length}`,
      `Token Savings: ~${tokensSaved.toLocaleString()} tokens saved (${savingsPercent}% reduction vs raw file dumps)`,
    ].join(' | ');

    return {
      verdict,
      scoreBefore: scoreBefore.overallScore,
      scoreAfter: scoreAfter.overallScore,
      scoreDelta,
      gradeBefore: scoreBefore.grade,
      gradeAfter: scoreAfter.grade,
      regressionsIntroduced,
      improvementsAchieved,
      tokenSavingsEstimate: {
        rawFilesTokens: estimatedRawTokens,
        componentContractTokens: estimatedContractTokens,
        tokensSaved,
        savingsPercent,
      },
      summary,
    };
  }
}
