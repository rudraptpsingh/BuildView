import path from 'path';
import type {
  BuildViewProject,
  ArchitectureHealthScore,
  ScoreDimension,
  RemediationAction,
  HealthGrade,
} from '../../shared/types.js';
import type { WasteAnalysisResult } from '../parser/waste-detector.js';
import type { ArchitectureRuleAnalysisResult, ArchitectureRuleViolation } from '../parser/architecture-rules.js';

export class ArchitectureScorer {
  /**
   * Computes an objective, multi-dimensional architectural health score
   * and prioritized remediation plan for a scanned repository.
   */
  public static calculateHealthScore(
    project: BuildViewProject,
    waste: WasteAnalysisResult,
    rules: ArchitectureRuleAnalysisResult
  ): ArchitectureHealthScore {
    const remediationPlan: RemediationAction[] = [];

    // 1. Architecture Adherence (35% weight)
    const archDeductions: Array<{ reason: string; penalty: number; file?: string; line?: number }> = [];
    let archPenaltyTotal = 0;

    for (const v of rules.violations) {
      const kind = (v as any).kind || v.type || 'architecture_violation';
      const firstEv = v.evidence?.[0];
      const fromFile = (v as any).fromFile || firstEv?.from;
      const line = (v as any).line || firstEv?.line;

      let penalty = 10;
      let priority: 1 | 2 | 3 = 1;

      if (kind === 'circular_dependency') {
        penalty = v.severity === 'critical' ? 20 : 12;
      } else if (kind === 'layer_inversion' || kind === 'forbidden_dependency') {
        penalty = 15;
      } else if (kind === 'cross_runtime_import' || kind === 'shared_depends_on_app') {
        penalty = 15;
      } else if (kind === 'type_only_boundary') {
        penalty = 3;
        priority = 3;
      }

      archPenaltyTotal += penalty;
      archDeductions.push({
        reason: `[${kind}] ${v.message}`,
        penalty,
        file: fromFile,
        line,
      });

      remediationPlan.push({
        id: `rem_arch_${kind}_${remediationPlan.length + 1}`,
        priority,
        category: 'architecture',
        title: `Resolve ${kind.replace(/_/g, ' ')}`,
        impactScorePoints: Math.round(penalty * 0.35),
        description: v.message,
        file: fromFile,
        line,
      });
    }

    // Check for performance hotpath violations attached as component gaps
    const seenPerfGaps = new Set<string>();
    for (const comp of project.components) {
      for (const gap of comp.gaps) {
        if (gap.kind === 'performance_blocking_io' && !gap.resolved && !seenPerfGaps.has(gap.id)) {
          seenPerfGaps.add(gap.id);
          const penalty = gap.severity === 'high' ? 15 : 8;
          archPenaltyTotal += penalty;
          archDeductions.push({
            reason: `[performance_blocking_io] ${gap.title}`,
            penalty,
            file: gap.evidence?.[0]?.split(':')[0],
          });
          remediationPlan.push({
            id: `rem_perf_${gap.id}`,
            priority: 1,
            category: 'architecture',
            title: gap.title,
            impactScorePoints: Math.round(penalty * 0.35),
            description: gap.description,
            file: gap.evidence?.[0]?.split(':')[0],
          });
        }
      }
    }

    const archScore = Math.max(0, 100 - archPenaltyTotal);
    const architectureDimension: ScoreDimension = {
      name: 'Architecture & Invariant Integrity',
      score: archScore,
      weight: 0.35,
      deductions: archDeductions,
      summary:
        archDeductions.length === 0
          ? 'Perfect layer separation and zero cyclic dependencies.'
          : `${archDeductions.length} architectural rule violations detected (penalties: -${archPenaltyTotal} pts).`,
    };

    // 2. Code Cleanliness & Dead Code (25% weight)
    const cleanDeductions: Array<{ reason: string; penalty: number; file?: string; line?: number }> = [];
    let cleanPenaltyTotal = 0;

    // Dead exports
    const deadExports = waste.allUnusedExports.filter((e) => e.usage === 'dead');
    const deadPenalty = Math.min(50, deadExports.length * 6);
    if (deadExports.length > 0) {
      cleanPenaltyTotal += deadPenalty;
      cleanDeductions.push({
        reason: `${deadExports.length} dead exports never referenced anywhere`,
        penalty: deadPenalty,
      });
      for (const de of deadExports.slice(0, 10)) {
        remediationPlan.push({
          id: `rem_clean_dead_${de.name}_${de.line}`,
          priority: 2,
          category: 'cleanliness',
          title: `Prune dead export "${de.name}"`,
          impactScorePoints: 2,
          description: `Symbol "${de.name}" in ${path.basename(de.file)}:${de.line} is never referenced in product or tests. Safe to prune.`,
          file: de.file,
          line: de.line,
        });
      }
    }

    // Local-only exports
    const localExports = waste.allUnusedExports.filter((e) => e.usage === 'local_only');
    const localPenalty = Math.min(20, localExports.length * 1.5);
    if (localExports.length > 0) {
      cleanPenaltyTotal += localPenalty;
      cleanDeductions.push({
        reason: `${localExports.length} exports only used within their declaring file`,
        penalty: Math.round(localPenalty),
      });
    }

    // Orphan files
    const orphanPenalty = Math.min(40, waste.allOrphanFiles.length * 12);
    if (waste.allOrphanFiles.length > 0) {
      cleanPenaltyTotal += orphanPenalty;
      cleanDeductions.push({
        reason: `${waste.allOrphanFiles.length} orphan files with zero incoming imports`,
        penalty: orphanPenalty,
      });
      for (const of of waste.allOrphanFiles.slice(0, 5)) {
        remediationPlan.push({
          id: `rem_clean_orphan_${path.basename(of)}`,
          priority: 2,
          category: 'cleanliness',
          title: `Remove or wire orphan file "${path.basename(of)}"`,
          impactScorePoints: 4,
          description: `File "${of}" is not imported by any file or entrypoint.`,
          file: of,
        });
      }
    }

    const cleanScore = Math.max(0, 100 - Math.round(cleanPenaltyTotal));
    const cleanlinessDimension: ScoreDimension = {
      name: 'Code Cleanliness & Dead Code',
      score: cleanScore,
      weight: 0.25,
      deductions: cleanDeductions,
      summary:
        cleanDeductions.length === 0
          ? 'Zero dead exports and zero orphan files.'
          : `${deadExports.length} dead exports and ${waste.allOrphanFiles.length} orphan files found.`,
    };

    // 3. Verification & Testing Health (25% weight)
    const testDeductions: Array<{ reason: string; penalty: number; file?: string; line?: number }> = [];
    let testScoreBase = 100;

    // Component test coverage ratio
    const productComponents = project.components.filter(
      (c) => c.layerId !== 'layer_verification' && c.layerId !== 'layer_4_tests' && c.layerId !== 'layer_tooling'
    );
    const testedComponents = productComponents.filter((c) => (c.testSummary?.totalTests || 0) > 0);
    const testCoverageRatio =
      productComponents.length > 0 ? testedComponents.length / productComponents.length : 1;

    const untestedPenalty = Math.round((1 - testCoverageRatio) * 50);
    if (untestedPenalty > 0) {
      testScoreBase -= untestedPenalty;
      testDeductions.push({
        reason: `${productComponents.length - testedComponents.length} of ${productComponents.length} product components lack tests`,
        penalty: untestedPenalty,
      });

      for (const uc of productComponents.filter((c) => (c.testSummary?.totalTests || 0) === 0).slice(0, 5)) {
        remediationPlan.push({
          id: `rem_test_untested_${uc.id}`,
          priority: 2,
          category: 'verification',
          title: `Add verification test harness for "${uc.name}"`,
          impactScorePoints: Math.round(untestedPenalty / (productComponents.length - testedComponents.length)),
          description: `Component "${uc.name}" in layer "${uc.layerId}" has 0 automated tests verifying its contracts.`,
        });
      }
    }

    // Test zombies penalty (code only called by tests)
    const zombiePenalty = Math.min(40, waste.allTestZombies.length * 8);
    if (waste.allTestZombies.length > 0) {
      testScoreBase -= zombiePenalty;
      testDeductions.push({
        reason: `${waste.allTestZombies.length} test zombies (functions only referenced by tests, dead in production)`,
        penalty: zombiePenalty,
      });
      for (const tz of waste.allTestZombies.slice(0, 5)) {
        remediationPlan.push({
          id: `rem_test_zombie_${tz.name}_${tz.line}`,
          priority: 2,
          category: 'verification',
          title: `Wire or remove test zombie "${tz.name}"`,
          impactScorePoints: 3,
          description: `Function "${tz.name}" in ${path.basename(tz.file)}:${tz.line} is only exercised by tests, but has zero production callers.`,
          file: tz.file,
          line: tz.line,
        });
      }
    }

    // Check for design standard / testid reachability gaps
    const seenDesignGaps = new Set<string>();
    for (const comp of project.components) {
      for (const gap of comp.gaps) {
        if (gap.kind === 'design_standard_missing_testid' && !gap.resolved && !seenDesignGaps.has(gap.id)) {
          seenDesignGaps.add(gap.id);
          const penalty = gap.severity === 'medium' ? 8 : 4;
          testScoreBase -= penalty;
          testDeductions.push({
            reason: `[design_standard_missing_testid] ${gap.title}`,
            penalty,
          });
          remediationPlan.push({
            id: `rem_design_${gap.id}`,
            priority: 2,
            category: 'verification',
            title: gap.title,
            impactScorePoints: Math.round(penalty * 0.25),
            description: gap.description,
          });
        }
      }
    }

    const testScore = Math.max(0, Math.min(100, testScoreBase));
    const verificationDimension: ScoreDimension = {
      name: 'Verification & Test Contracts',
      score: testScore,
      weight: 0.25,
      deductions: testDeductions,
      summary:
        testDeductions.length === 0
          ? 'All architectural components have verifying test suites with zero test zombies.'
          : `${testedComponents.length}/${productComponents.length} components tested; ${waste.allTestZombies.length} test zombies detected.`,
    };

    // 4. Modularity & Reusability (15% weight)
    const modDeductions: Array<{ reason: string; penalty: number; file?: string; line?: number }> = [];
    let modScoreBase = 100;

    const dupPenalty = Math.min(50, waste.allDuplicates.length * 12);
    if (waste.allDuplicates.length > 0) {
      modScoreBase -= dupPenalty;
      modDeductions.push({
        reason: `${waste.allDuplicates.length} duplicate function implementations across files`,
        penalty: dupPenalty,
      });

      for (const d of waste.allDuplicates.slice(0, 5)) {
        remediationPlan.push({
          id: `rem_mod_dup_${d.name}_${path.basename(d.sourceFile)}`,
          priority: 3,
          category: 'modularity',
          title: `Consolidate duplicate function "${d.name}()"`,
          impactScorePoints: 4,
          description: `Logic matches "${d.name}()" in ${path.basename(d.duplicateOfFile)}. Extract to a shared utility module.`,
          file: d.sourceFile,
        });
      }
    }

    const modScore = Math.max(0, Math.min(100, modScoreBase));
    const modularityDimension: ScoreDimension = {
      name: 'Modularity & Reusability',
      score: modScore,
      weight: 0.15,
      deductions: modDeductions,
      summary:
        modDeductions.length === 0
          ? 'High modularity with zero duplicated logic across modules.'
          : `${waste.allDuplicates.length} duplicate logic clusters detected.`,
    };

    // Composite Calculation
    const overallScore = Math.round(
      archScore * 0.35 + cleanScore * 0.25 + testScore * 0.25 + modScore * 0.15
    );

    let grade: HealthGrade = 'F';
    if (overallScore >= 95) grade = 'A+';
    else if (overallScore >= 88) grade = 'A';
    else if (overallScore >= 78) grade = 'B';
    else if (overallScore >= 68) grade = 'C';
    else if (overallScore >= 55) grade = 'D';

    // Sort remediation plan by priority and impact
    remediationPlan.sort((a, b) => a.priority - b.priority || b.impactScorePoints - a.impactScorePoints);

    return {
      overallScore,
      grade,
      dimensions: {
        architecture: architectureDimension,
        cleanliness: cleanlinessDimension,
        verification: verificationDimension,
        modularity: modularityDimension,
      },
      remediationPlan,
      generatedAt: new Date().toISOString(),
    };
  }
}
