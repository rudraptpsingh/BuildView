import {
  ArchitectureComponent,
  ArchitecturePlan,
  ArchitectureStep,
  BuildViewProject,
} from '../../shared/types.js';

export interface BlastRadiusResult {
  targetComponentId: string;
  directCallers: string[];
  transitiveCallers: string[];
  totalAffectedComponents: number;
  impactedLayerIds: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  downstreamBreakageWarning?: string;
}

export class ArchitecturePlanner {
  /**
   * Calculates the exact blast radius of modifying a component:
   * Traverses all direct and transitive callers across the codebase graph.
   */
  public static calculateBlastRadius(
    components: ArchitectureComponent[],
    targetComponentId: string
  ): BlastRadiusResult {
    const compMap = new Map<string, ArchitectureComponent>();
    for (const c of components) compMap.set(c.id, c);

    const directCallers = new Set<string>();
    const transitiveCallers = new Set<string>();
    const impactedLayerIds = new Set<string>();

    const targetComp = compMap.get(targetComponentId);
    if (!targetComp) {
      return {
        targetComponentId,
        directCallers: [],
        transitiveCallers: [],
        totalAffectedComponents: 0,
        impactedLayerIds: [],
        riskLevel: 'LOW',
      };
    }

    // Direct callers: who explicitly lists targetComponentId in callees or has targetComp in its callers
    for (const c of components) {
      if (c.id === targetComponentId) continue;
      const callsTarget =
        c.anatomy.callees.includes(targetComponentId) ||
        targetComp.anatomy.callers.includes(c.id);
      if (callsTarget) {
        directCallers.add(c.id);
        impactedLayerIds.add(c.layerId);
      }
    }

    // Transitive callers via BFS traversal
    const queue = Array.from(directCallers);
    const visited = new Set<string>(directCallers);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const c of components) {
        if (visited.has(c.id) || c.id === targetComponentId) continue;
        if (c.anatomy.callees.includes(currentId)) {
          visited.add(c.id);
          transitiveCallers.add(c.id);
          impactedLayerIds.add(c.layerId);
          queue.push(c.id);
        }
      }
    }

    const totalAffected = directCallers.size + transitiveCallers.size;
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (totalAffected >= 8 || impactedLayerIds.size >= 3) {
      riskLevel = 'CRITICAL';
    } else if (totalAffected >= 4 || impactedLayerIds.size >= 2) {
      riskLevel = 'HIGH';
    } else if (totalAffected >= 2) {
      riskLevel = 'MEDIUM';
    }

    let downstreamBreakageWarning: string | undefined;
    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      downstreamBreakageWarning = `Modifying "${targetComp.name}" impacts ${totalAffected} downstream component(s) across ${impactedLayerIds.size} architectural layer(s). Invert dependencies with interfaces to mitigate blast radius.`;
    }

    return {
      targetComponentId,
      directCallers: Array.from(directCallers),
      transitiveCallers: Array.from(transitiveCallers),
      totalAffectedComponents: totalAffected,
      impactedLayerIds: Array.from(impactedLayerIds),
      riskLevel,
      downstreamBreakageWarning,
    };
  }

  /**
   * Generates a structured Architecture Change & Migration Plan for a project.
   */
  public static generatePlan(
    project: BuildViewProject,
    title = 'Architecture Invariant & Decoupling Plan',
    summary = 'Systematic migration to resolve circular dependencies, isolate layer boundaries, and prune dead code.'
  ): ArchitecturePlan {
    const steps: ArchitectureStep[] = [];
    const affectedComponentIds = new Set<string>();
    let stepOrder = 1;

    // 1. Identify components with circular dependencies / architectural gaps
    const gapComponents = project.components.filter((c) => c.gaps.some((g) => !g.resolved));

    for (const comp of gapComponents) {
      affectedComponentIds.add(comp.id);
      const cycleGap = comp.gaps.find((g) => g.title.includes('CIRCULAR DEPENDENCY'));

      steps.push({
        id: `step_${stepOrder}`,
        order: stepOrder++,
        title: cycleGap ? `Decouple Circular Coupling in ${comp.name}` : `Resolve Gap: ${comp.name}`,
        description: cycleGap
          ? cycleGap.description
          : `Remediate active architectural gaps in ${comp.name}.`,
        targetComponentId: comp.id,
        action: 'refactor',
        status: 'pending',
        requiredFiles: comp.files.map((f) => f.path).slice(0, 3),
        verificationCriteria: [
          'Break circular import coupling with dependency inversion',
          'Pass 100% of component test suites',
        ],
      });
    }

    // 2. Identify components with dead code / prune recommendations
    const pruneComponents = project.components.filter(
      (c) => c.wasteMetrics && c.wasteMetrics.recommendation === 'prune'
    );

    for (const comp of pruneComponents.slice(0, 3)) {
      if (!affectedComponentIds.has(comp.id)) {
        affectedComponentIds.add(comp.id);
        steps.push({
          id: `step_${stepOrder}`,
          order: stepOrder++,
          title: `Prune Dead Code & Duplicate AST in ${comp.name}`,
          description: `Clean up ${comp.wasteMetrics?.unusedExports.length || 0} unused exports and ${comp.wasteMetrics?.deadCodeLines || 0} dead code lines.`,
          targetComponentId: comp.id,
          action: 'deprecate',
          status: 'pending',
          requiredFiles: comp.files.map((f) => f.path).slice(0, 2),
          verificationCriteria: [
            'Safely prune uncalled functions and orphan files',
            'Verify zero regression across callers',
          ],
        });
      }
    }

    // 3. Fallback: If no gaps or dead code, plan verification harness
    if (steps.length === 0 && project.components.length > 0) {
      const topComp = project.components[0];
      affectedComponentIds.add(topComp.id);
      steps.push({
        id: `step_${stepOrder}`,
        order: stepOrder++,
        title: `Establish Invariant Contract for ${topComp.name}`,
        description: `Add automated contract tests verifying layer boundary invariants.`,
        targetComponentId: topComp.id,
        action: 'verify',
        status: 'pending',
        verificationCriteria: ['Implement Vitest test suite enforcing component API integrity'],
      });
    }

    // Mark first step as in_progress
    if (steps.length > 0) {
      steps[0].status = 'in_progress';
    }

    return {
      id: `plan_${Date.now()}`,
      title,
      summary,
      createdAt: new Date().toISOString(),
      status: 'in_progress',
      activeStepIndex: 0,
      steps,
      affectedComponentIds: Array.from(affectedComponentIds),
    };
  }
}
