import path from 'path';
import { ArchitectureComponent, ArchitectureLayer, ComponentGap } from '../../shared/types.js';

export interface ArchitectureRuleViolation {
  type: 'circular_dependency' | 'layer_inversion' | 'isolated_component' | 'forbidden_dependency';
  sourceId: string;
  targetId?: string;
  sourceName: string;
  targetName?: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  remediation: string;
}

export interface ArchitectureRuleAnalysisResult {
  violations: ArchitectureRuleViolation[];
  cycleCount: number;
  inversionCount: number;
  isolatedCount: number;
  healthyComponentCount: number;
}

/**
 * Architecture Rules & Invariant Validation Engine
 * Inspired by open-source dependency-cruiser and ArchUnit.
 * Enforces clean hexagonal architecture invariants, detects cycles, and flags architectural gaps.
 */
export class ArchitectureRulesEngine {
  /**
   * Analyzes an entire architecture component graph against clean layering invariants.
   */
  public static analyzeArchitecture(
    components: ArchitectureComponent[],
    layers: ArchitectureLayer[]
  ): ArchitectureRuleAnalysisResult {
    const violations: ArchitectureRuleViolation[] = [];
    const layerOrderMap = new Map<string, number>();
    for (const l of layers) {
      layerOrderMap.set(l.id, l.order);
    }

    const compMap = new Map<string, ArchitectureComponent>();
    for (const c of components) {
      compMap.set(c.id, c);
    }

    // 1. Detect Circular Dependencies (Tarjan's or DFS cycle detection)
    const cycles = this.findDependencyCycles(components);
    for (const cycle of cycles) {
      const cycleNames = cycle.map((id) => compMap.get(id)?.name || id).join(' ➔ ');
      for (const compId of cycle) {
        const comp = compMap.get(compId);
        if (comp) {
          violations.push({
            type: 'circular_dependency',
            sourceId: compId,
            sourceName: comp.name,
            severity: 'critical',
            message: `Circular dependency loop detected: ${cycleNames}`,
            remediation: 'Break circular coupling using dependency inversion (interfaces) or event-driven IPC message passing.',
          });
        }
      }
    }

    // 2. Detect Layer Inversion Violations (Clean Architecture Boundary Rules)
    for (const comp of components) {
      const sourceOrder = layerOrderMap.get(comp.layerId) ?? 0;
      const isTestLayer = comp.layerId === 'layer_4_tests' || comp.layerId === 'layer_verification';

      // Test layer is allowed to call anything for verification, but non-test code must NOT depend on tests!
      if (!isTestLayer) {
        for (const calleeId of comp.anatomy.callees || []) {
          const callee = compMap.get(calleeId);
          if (!callee) continue;

          const calleeIsTest = callee.layerId === 'layer_4_tests' || callee.layerId === 'layer_verification';
          if (calleeIsTest) {
            violations.push({
              type: 'forbidden_dependency',
              sourceId: comp.id,
              targetId: callee.id,
              sourceName: comp.name,
              targetName: callee.name,
              severity: 'critical',
              message: `Production component "${comp.name}" illegally imports test harness "${callee.name}".`,
              remediation: 'Remove test suite imports from production runtime code.',
            });
            continue;
          }

          const calleeOrder = layerOrderMap.get(callee.layerId) ?? 0;

          // Check for Layer Inversion: Lower layer calling a higher layer (e.g. Layer 0 Storage calling Layer 3 UI)
          // Foundation/Storage (0) must never depend on UI/Presentation (3)
          if (sourceOrder < calleeOrder && calleeOrder - sourceOrder >= 2) {
            violations.push({
              type: 'layer_inversion',
              sourceId: comp.id,
              targetId: callee.id,
              sourceName: comp.name,
              targetName: callee.name,
              severity: 'high',
              message: `Layer inversion: Lower layer "${comp.name}" (Layer ${sourceOrder}) directly imports higher layer "${callee.name}" (Layer ${calleeOrder}).`,
              remediation: `Inject dependencies via interfaces or emit events up through state router instead of direct import.`,
            });
          }
        }
      }
    }

    // 3. Detect Isolated Components (No callers and no callees in a non-entrypoint)
    for (const comp of components) {
      const isTest = comp.layerId === 'layer_4_tests' || comp.layerId === 'layer_verification';
      const callersCount = (comp.anatomy.callers || []).length;
      const calleesCount = (comp.anatomy.callees || []).length;

      if (!isTest && callersCount === 0 && calleesCount === 0 && comp.files.length > 0) {
        violations.push({
          type: 'isolated_component',
          sourceId: comp.id,
          sourceName: comp.name,
          severity: 'medium',
          message: `Component "${comp.name}" has no registered callers or outbound dependencies (potential dead module island).`,
          remediation: 'Verify whether this module is an unused remnant or wire its exports into parent components.',
        });
      }
    }

    const cycleCount = violations.filter((v) => v.type === 'circular_dependency').length;
    const inversionCount = violations.filter((v) => v.type === 'layer_inversion').length;
    const isolatedCount = violations.filter((v) => v.type === 'isolated_component').length;
    const violatingSourceIds = new Set(violations.map((v) => v.sourceId));

    return {
      violations,
      cycleCount,
      inversionCount,
      isolatedCount,
      healthyComponentCount: components.length - violatingSourceIds.size,
    };
  }

  /**
   * Applies rule violations to components as actionable Architectural Gaps.
   */
  public static attachRuleGapsToComponents(
    components: ArchitectureComponent[],
    analysis: ArchitectureRuleAnalysisResult
  ): void {
    const compMap = new Map<string, ArchitectureComponent>();
    for (const c of components) {
      compMap.set(c.id, c);
    }

    for (const violation of analysis.violations) {
      const comp = compMap.get(violation.sourceId);
      if (!comp) continue;

      const gapId = `rule_gap_${violation.type}_${violation.sourceId}_${violation.targetId || 'self'}`;
      // Prevent duplicate gaps
      if (!comp.gaps.some((g) => g.id === gapId)) {
        const gap: ComponentGap = {
          id: gapId,
          title: `[${violation.type.toUpperCase().replace('_', ' ')}] ${violation.message}`,
          description: `${violation.message}\n\nRecommended Remediation: ${violation.remediation}`,
          severity: violation.severity,
          resolved: false,
        };
        comp.gaps.push(gap);

        if (comp.status !== 'in_progress') {
          comp.status = 'gap_detected';
        }
      }
    }
  }

  /**
   * Finds all directed cycles in the component graph using DFS.
   */
  private static findDependencyCycles(components: ArchitectureComponent[]): string[][] {
    const adjList = new Map<string, string[]>();
    for (const c of components) {
      adjList.set(c.id, c.anatomy.callees || []);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];
    const cycles: string[][] = [];

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Found cycle: slice from neighbor to end
          const cycleStartIndex = path.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            const cycle = path.slice(cycleStartIndex);
            cycle.push(neighbor);
            cycles.push(cycle);
          }
        }
      }

      recStack.delete(node);
      path.pop();
    };

    for (const c of components) {
      if (!visited.has(c.id)) {
        dfs(c.id);
      }
    }

    return cycles;
  }
}
