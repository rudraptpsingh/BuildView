import { ArchitectureComponent, ArchitectureLayer, ComponentGap } from '../../shared/types.js';
import type { AllowedEdgeConfig } from '../analysis/config.js';
import type { FileClassification, FileEdge } from '../analysis/dependency-graph.js';
import { formatEdgeLocation } from '../analysis/dependency-graph.js';
import { crossesRuntimeBoundary } from '../analysis/file-roles.js';
import { matchesGlob } from '../analysis/glob.js';

export type ArchitectureRuleType =
  | 'circular_dependency'
  | 'layer_inversion'
  | 'isolated_component'
  | 'forbidden_dependency'
  | 'cross_runtime_import'
  | 'shared_depends_on_app'
  | 'type_only_boundary';

/** One import that proves a violation. */
export interface RuleEvidence {
  from: string;
  to: string;
  line: number;
  typeOnly: boolean;
}

export interface ArchitectureRuleViolation {
  /** Stable id used as the gap id / baseline fingerprint. */
  id?: string;
  type: ArchitectureRuleType;
  sourceId: string;
  targetId?: string;
  sourceName: string;
  targetName?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  remediation: string;
  /** Imports (file:line) behind this violation. */
  evidence?: RuleEvidence[];
  /** Component ids of a dependency cycle, first id repeated at the end. */
  cycle?: string[];
  /** For type_only_boundary: the rule the import would break if it were a runtime import. */
  underlyingType?: ArchitectureRuleType;
}

export interface ArchitectureRuleAnalysisResult {
  violations: ArchitectureRuleViolation[];
  cycleCount: number;
  inversionCount: number;
  isolatedCount: number;
  healthyComponentCount: number;
  crossRuntimeCount?: number;
  typeOnlyCount?: number;
}

/**
 * File-level facts that make the analysis precise. Without it the engine
 * falls back to component callees (legacy mode).
 */
export interface ArchitectureRuleContext {
  fileEdges: FileEdge[];
  fileInfo: Map<string, FileClassification>;
  fileToComponent: Map<string, string>;
  allowedEdges?: AllowedEdgeConfig[];
}

const MAX_EVIDENCE = 50;
const EVIDENCE_PER_CYCLE_HOP = 3;

const isTestLayerId = (layerId: string) => layerId === 'layer_4_tests' || layerId === 'layer_verification';
const isNonProductLayerId = (layerId: string) => isTestLayerId(layerId) || layerId === 'layer_tooling';

const RULE_LABEL: Record<ArchitectureRuleType, string> = {
  circular_dependency: 'CIRCULAR DEPENDENCY',
  layer_inversion: 'LAYER INVERSION',
  isolated_component: 'ISOLATED COMPONENT',
  forbidden_dependency: 'FORBIDDEN DEPENDENCY',
  cross_runtime_import: 'CROSS-RUNTIME IMPORT',
  shared_depends_on_app: 'SHARED DEPENDS ON APP',
  type_only_boundary: 'TYPE-ONLY BOUNDARY',
};

/**
 * Architecture Rules & Invariant Validation Engine
 * Inspired by open-source dependency-cruiser and ArchUnit.
 * Enforces clean layering invariants, detects cycles, and flags architectural gaps.
 *
 * Only product code is checked: test and tooling files may import anything,
 * and product code importing tests is itself a violation.
 */
export class ArchitectureRulesEngine {
  public static analyzeArchitecture(
    components: ArchitectureComponent[],
    layers: ArchitectureLayer[],
    context?: ArchitectureRuleContext
  ): ArchitectureRuleAnalysisResult {
    const layerOrderMap = new Map<string, number>();
    for (const l of layers) layerOrderMap.set(l.id, l.order);
    const compMap = new Map<string, ArchitectureComponent>();
    for (const c of components) compMap.set(c.id, c);

    const violations = context
      ? this.analyzeFileGraph(compMap, layerOrderMap, context)
      : this.analyzeComponentGraph(components, compMap, layerOrderMap);

    // Isolated components: no callers and no callees in a non-entrypoint.
    for (const comp of components) {
      if (isNonProductLayerId(comp.layerId)) continue;
      const callersCount = (comp.anatomy.callers || []).filter((c) => compMap.has(c)).length;
      const calleesCount = (comp.anatomy.callees || []).length;
      if (callersCount > 0 || calleesCount > 0 || comp.files.length === 0) continue;
      // With waste data, only flag a component when every file in it is an orphan (no entry point inside).
      if (comp.wasteMetrics && comp.wasteMetrics.orphanFiles.length < comp.files.length) continue;
      violations.push({
        type: 'isolated_component',
        sourceId: comp.id,
        sourceName: comp.name,
        severity: 'medium',
        message: `Component "${comp.name}" has no registered callers or outbound dependencies (potential dead module island).`,
        remediation: 'Verify whether this module is an unused remnant or wire its exports into parent components.',
      });
    }

    const count = (t: ArchitectureRuleType) => violations.filter((v) => v.type === t).length;
    const violatingSourceIds = new Set(violations.map((v) => v.sourceId));

    return {
      violations,
      cycleCount: count('circular_dependency'),
      inversionCount: count('layer_inversion'),
      isolatedCount: count('isolated_component'),
      crossRuntimeCount: count('cross_runtime_import') + count('shared_depends_on_app'),
      typeOnlyCount: count('type_only_boundary'),
      healthyComponentCount: components.length - violatingSourceIds.size,
    };
  }

  /** Precise mode: classify each resolved import, then aggregate per component pair. */
  private static analyzeFileGraph(
    compMap: Map<string, ArchitectureComponent>,
    layerOrderMap: Map<string, number>,
    ctx: ArchitectureRuleContext
  ): ArchitectureRuleViolation[] {
    type Bucket = { type: ArchitectureRuleType; underlying?: ArchitectureRuleType; source: string; target: string; edges: FileEdge[] };
    const buckets = new Map<string, Bucket>();
    const fileGraph = new Map<string, FileEdge[]>();

    const add = (type: ArchitectureRuleType, source: string, target: string, edge: FileEdge, underlying?: ArchitectureRuleType) => {
      const key = `${type}|${source}|${target}`;
      let b = buckets.get(key);
      if (!b) {
        b = { type, underlying, source, target, edges: [] };
        buckets.set(key, b);
      }
      b.edges.push(edge);
    };

    for (const edge of ctx.fileEdges) {
      const source = ctx.fileToComponent.get(edge.from);
      const target = ctx.fileToComponent.get(edge.to);
      if (!source || !target) continue;
      const fromInfo = ctx.fileInfo.get(edge.from);
      const toInfo = ctx.fileInfo.get(edge.to);
      const fromRole = fromInfo?.role ?? 'product';
      const toRole = toInfo?.role ?? 'product';

      // Tests and tooling may import anything (that is how they verify and build product code).
      if (fromRole !== 'product') continue;
      if (toRole === 'tooling') continue;
      if (ctx.allowedEdges?.some((a) => matchesGlob(edge.from, a.from) && matchesGlob(edge.to, a.to))) continue;

      let type: ArchitectureRuleType | null = null;
      if (toRole === 'test') {
        type = 'forbidden_dependency';
      } else {
        const fromRt = fromInfo?.runtime;
        const toRt = toInfo?.runtime;
        if (fromRt && toRt && fromRt.unit !== toRt.unit && toRt.kind !== 'shared') {
          if (fromRt.kind === 'shared') type = 'shared_depends_on_app';
          else if (crossesRuntimeBoundary(fromRt, toRt)) type = 'cross_runtime_import';
        }
        if (!type && source !== target) {
          const sComp = compMap.get(source)!;
          const tComp = compMap.get(target)!;
          // Only trust layers that came from config, folder keywords or a shared folder.
          const confident = (c: ArchitectureComponent) =>
            !c.layerSource || c.layerSource === 'config' || c.layerSource === 'keyword' || c.layerSource === 'shared';
          const sOrder = layerOrderMap.get(sComp.layerId) ?? 0;
          const tOrder = layerOrderMap.get(tComp.layerId) ?? 0;
          if (confident(sComp) && confident(tComp) && sOrder < tOrder && tOrder - sOrder >= 2) type = 'layer_inversion';
        }
        // Product runtime imports form the file graph used for cycle detection.
        if (!edge.typeOnly && edge.kind !== 'dynamic') {
          const out = fileGraph.get(edge.from) || [];
          out.push(edge);
          fileGraph.set(edge.from, out);
        }
      }

      if (!type) continue;
      if (edge.typeOnly) add('type_only_boundary', source, target, edge, type);
      else add(type, source, target, edge);
    }

    const violations: ArchitectureRuleViolation[] = [];
    const runtimePairs = new Set(
      Array.from(buckets.values())
        .filter((b) => b.type !== 'type_only_boundary')
        .map((b) => `${b.source}|${b.target}`)
    );

    for (const b of buckets.values()) {
      // A type-only crossing is redundant when the same pair already has a runtime violation.
      if (b.type === 'type_only_boundary' && runtimePairs.has(`${b.source}|${b.target}`)) continue;
      const s = compMap.get(b.source)!;
      const t = compMap.get(b.target)!;
      const evidence = b.edges.slice(0, MAX_EVIDENCE).map((e) => ({ from: e.from, to: e.to, line: e.line, typeOnly: e.typeOnly }));
      const files = Array.from(new Set(b.edges.map((e) => e.from)));
      const fileNote = files.length === 1 ? files[0] : `${files.length} files`;
      const fromRt = ctx.fileInfo.get(b.edges[0].from)?.runtime;
      const toRt = ctx.fileInfo.get(b.edges[0].to)?.runtime;
      const id = `rule_gap_${b.type}_${b.source}_${b.target}`;
      const base = { id, sourceId: b.source, targetId: b.target, sourceName: s.name, targetName: t.name, evidence };

      switch (b.type) {
        case 'forbidden_dependency':
          violations.push({
            ...base,
            type: b.type,
            severity: 'critical',
            message: `Production component "${s.name}" imports test code "${t.name}" (${fileNote}).`,
            remediation: 'Remove test imports from production code; move the shared helper into a product module that tests import instead.',
          });
          break;
        case 'shared_depends_on_app':
          violations.push({
            ...base,
            type: b.type,
            severity: 'high',
            message: `Shared module "${s.name}" imports app code "${t.name}" (${toRt?.kind ?? 'app'} runtime "${toRt?.unit}") from ${fileNote}.`,
            remediation: 'Shared code must not depend on an app runtime. Move the imported code into the shared module, or invert the dependency.',
          });
          break;
        case 'cross_runtime_import':
          violations.push({
            ...base,
            type: b.type,
            severity: 'high',
            message: `Cross-runtime import: "${s.name}" (${fromRt?.kind} runtime "${fromRt?.unit}") imports "${t.name}" (${toRt?.kind} runtime "${toRt?.unit}") from ${fileNote}.`,
            remediation: 'Code that both runtimes need belongs in a shared module or package; import it from there instead of reaching into another runtime.',
          });
          break;
        case 'layer_inversion': {
          const sOrder = layerOrderMap.get(s.layerId) ?? 0;
          const tOrder = layerOrderMap.get(t.layerId) ?? 0;
          violations.push({
            ...base,
            type: b.type,
            severity: 'high',
            message: `Layer inversion: Lower layer "${s.name}" (Layer ${sOrder}) directly imports higher layer "${t.name}" (Layer ${tOrder}) from ${fileNote}.`,
            remediation: 'Inject dependencies via interfaces or emit events up through state router instead of direct import.',
          });
          break;
        }
        case 'type_only_boundary':
          violations.push({
            ...base,
            type: b.type,
            underlyingType: b.underlying,
            severity: 'low',
            message: `Type-only boundary crossing: "${s.name}" imports types from "${t.name}" (${fileNote}); erased at build time, but it would be a ${RULE_LABEL[b.underlying!].toLowerCase()} at runtime.`,
            remediation: 'Move the shared type into a shared module (e.g. shared/ or a types package) that both sides import.',
          });
          break;
      }
    }

    violations.push(...this.fileCycleViolations(fileGraph, ctx.fileToComponent, compMap));
    return violations;
  }

  /**
   * One violation per strongly connected group of files (a real runtime import
   * cycle), ranked by the length of its shortest loop. The loop's imports are
   * the evidence; type-only and dynamic imports never form cycles.
   */
  private static fileCycleViolations(
    graph: Map<string, FileEdge[]>,
    fileToComponent: Map<string, string>,
    compMap: Map<string, ArchitectureComponent>
  ): ArchitectureRuleViolation[] {
    const sccs = this.stronglyConnectedComponents(graph);
    const found: Array<{ scc: string[]; loop: FileEdge[] }> = [];

    for (const scc of sccs) {
      if (scc.length < 2) continue;
      const members = new Set(scc);
      const start = [...scc].sort()[0];
      // BFS for the shortest loop start -> ... -> start inside the group.
      const prev = new Map<string, FileEdge>();
      const queue = [start];
      let closing: FileEdge | null = null;
      for (let i = 0; i < queue.length && !closing; i++) {
        for (const e of graph.get(queue[i]) || []) {
          if (!members.has(e.to)) continue;
          if (e.to === start) {
            closing = e;
            break;
          }
          if (!prev.has(e.to)) {
            prev.set(e.to, e);
            queue.push(e.to);
          }
        }
      }
      if (!closing) continue;
      const loop: FileEdge[] = [closing];
      for (let node = closing.from; node !== start; ) {
        const e = prev.get(node)!;
        loop.unshift(e);
        node = e.from;
      }
      found.push({ scc: [...scc].sort(), loop });
    }

    found.sort((a, b) => a.loop.length - b.loop.length || a.scc.length - b.scc.length || a.scc[0].localeCompare(b.scc[0]));

    return found.map(({ scc, loop }) => {
      const files = loop.map((e) => e.from);
      const compIds = Array.from(new Set(files.map((f) => fileToComponent.get(f)!)));
      const sourceId = fileToComponent.get(scc[0])!;
      const names = [...files, files[0]].join(' ➔ ');
      const crossesComponents = compIds.length > 1;
      const extra = scc.length > loop.length ? ` The cycle group contains ${scc.length} files in total.` : '';
      return {
        id: `rule_gap_circular_dependency_${sourceId}_${scc[0].replace(/[^a-zA-Z0-9]/g, '_')}`,
        type: 'circular_dependency' as const,
        sourceId,
        sourceName: compMap.get(sourceId)?.name || sourceId,
        severity: crossesComponents ? ('critical' as const) : ('high' as const),
        message: `Import cycle of ${loop.length} files${crossesComponents ? ` across ${compIds.length} components` : ''}: ${names}.${extra}`,
        remediation: 'Break the loop by moving the shared piece into a module both sides import, using dependency inversion (interfaces), or a lazy/dynamic import.',
        evidence: loop.map((e) => ({ from: e.from, to: e.to, line: e.line, typeOnly: e.typeOnly })),
        cycle: [...compIds, compIds[0]],
      };
    });
  }

  /** Tarjan's algorithm (iterative, safe for large repos). */
  private static stronglyConnectedComponents(graph: Map<string, FileEdge[]>): string[][] {
    let index = 0;
    const indices = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const result: string[][] = [];
    const nodes = new Set<string>();
    for (const [from, edges] of graph) {
      nodes.add(from);
      for (const e of edges) nodes.add(e.to);
    }

    for (const root of Array.from(nodes).sort()) {
      if (indices.has(root)) continue;
      const work: Array<{ node: string; i: number }> = [{ node: root, i: 0 }];
      indices.set(root, index);
      low.set(root, index++);
      stack.push(root);
      onStack.add(root);

      while (work.length > 0) {
        const frame = work[work.length - 1];
        const edges = graph.get(frame.node) || [];
        if (frame.i < edges.length) {
          const next = edges[frame.i++].to;
          if (!indices.has(next)) {
            indices.set(next, index);
            low.set(next, index++);
            stack.push(next);
            onStack.add(next);
            work.push({ node: next, i: 0 });
          } else if (onStack.has(next)) {
            low.set(frame.node, Math.min(low.get(frame.node)!, indices.get(next)!));
          }
        } else {
          work.pop();
          if (work.length > 0) {
            const parent = work[work.length - 1].node;
            low.set(parent, Math.min(low.get(parent)!, low.get(frame.node)!));
          }
          if (low.get(frame.node) === indices.get(frame.node)) {
            const scc: string[] = [];
            let w: string;
            do {
              w = stack.pop()!;
              onStack.delete(w);
              scc.push(w);
            } while (w !== frame.node);
            result.push(scc);
          }
        }
      }
    }
    return result;
  }

  /** Legacy mode (no file graph): component callees, with test components left out of cycles. */
  private static analyzeComponentGraph(
    components: ArchitectureComponent[],
    compMap: Map<string, ArchitectureComponent>,
    layerOrderMap: Map<string, number>
  ): ArchitectureRuleViolation[] {
    const violations: ArchitectureRuleViolation[] = [];
    const graph = new Map<string, Map<string, FileEdge[]>>();

    for (const comp of components) {
      if (isNonProductLayerId(comp.layerId)) continue;
      const sourceOrder = layerOrderMap.get(comp.layerId) ?? 0;
      const out = new Map<string, FileEdge[]>();
      graph.set(comp.id, out);

      for (const calleeId of comp.anatomy.callees || []) {
        const callee = compMap.get(calleeId);
        if (!callee) continue;

        if (isTestLayerId(callee.layerId)) {
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
        if (isNonProductLayerId(callee.layerId)) continue;
        out.set(callee.id, []);

        const calleeOrder = layerOrderMap.get(callee.layerId) ?? 0;
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

    violations.push(...this.cycleViolations(graph, compMap));
    return violations;
  }

  /** One violation per distinct cycle, shortest first, with the imports behind every hop. */
  private static cycleViolations(
    graph: Map<string, Map<string, FileEdge[]>>,
    compMap: Map<string, ArchitectureComponent>
  ): ArchitectureRuleViolation[] {
    const cycles = this.findDependencyCycles(graph);
    return cycles.map((cycle) => {
      const names = cycle.map((id) => compMap.get(id)?.name || id).join(' ➔ ');
      const evidence: RuleEvidence[] = [];
      for (let i = 0; i < cycle.length - 1; i++) {
        const hop = graph.get(cycle[i])?.get(cycle[i + 1]) || [];
        for (const e of hop.slice(0, EVIDENCE_PER_CYCLE_HOP)) {
          evidence.push({ from: e.from, to: e.to, line: e.line, typeOnly: e.typeOnly });
        }
      }
      const first = compMap.get(cycle[0]);
      return {
        id: `rule_gap_circular_dependency_${cycle.slice(0, -1).join('__')}`,
        type: 'circular_dependency' as const,
        sourceId: cycle[0],
        sourceName: first?.name || cycle[0],
        severity: 'critical' as const,
        message: `Circular dependency loop detected (${cycle.length - 1} components): ${names}`,
        remediation: 'Break circular coupling using dependency inversion (interfaces) or event-driven IPC message passing.',
        evidence,
        cycle,
      };
    });
  }

  /**
   * Applies rule violations to components as actionable Architectural Gaps.
   */
  public static attachRuleGapsToComponents(
    components: ArchitectureComponent[],
    analysis: ArchitectureRuleAnalysisResult
  ): void {
    const compMap = new Map<string, ArchitectureComponent>();
    for (const c of components) compMap.set(c.id, c);

    for (const violation of analysis.violations) {
      const comp = compMap.get(violation.sourceId);
      if (!comp) continue;

      const gapId = violation.id || `rule_gap_${violation.type}_${violation.sourceId}_${violation.targetId || 'self'}`;
      if (comp.gaps.some((g) => g.id === gapId)) continue;

      const evidence = (violation.evidence || []).map(
        (e) => `${formatEdgeLocation(e)} → ${e.to}${e.typeOnly ? ' (type-only)' : ''}`
      );
      const evidenceText = evidence.length > 0 ? `\n\nImports:\n${evidence.map((l) => `  - ${l}`).join('\n')}` : '';
      const gap: ComponentGap = {
        id: gapId,
        title: `[${RULE_LABEL[violation.type]}] ${violation.message}`,
        description: `${violation.message}${evidenceText}\n\nRecommended Remediation: ${violation.remediation}`,
        severity: violation.severity,
        resolved: false,
        kind: violation.type,
        evidence: evidence.length > 0 ? evidence : undefined,
      };
      comp.gaps.push(gap);

      if (comp.status !== 'in_progress') {
        comp.status = 'gap_detected';
      }
    }
  }

  /**
   * Finds directed cycles with DFS, deduplicated by rotation and sorted by length
   * (shortest, most actionable loops first). Each cycle repeats its first id at the end.
   */
  private static findDependencyCycles(graph: Map<string, Map<string, unknown>>): string[][] {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const stack: string[] = [];
    const seen = new Set<string>();
    const cycles: string[][] = [];

    const record = (loop: string[]) => {
      // Rotate so the smallest id leads; identical loops then share one key.
      let min = 0;
      for (let i = 1; i < loop.length; i++) if (loop[i] < loop[min]) min = i;
      const rotated = [...loop.slice(min), ...loop.slice(0, min)];
      const key = rotated.join('>');
      if (seen.has(key)) return;
      seen.add(key);
      cycles.push([...rotated, rotated[0]]);
    };

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      stack.push(node);
      for (const neighbor of graph.get(node)?.keys() || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          const start = stack.indexOf(neighbor);
          if (start !== -1) record(stack.slice(start));
        }
      }
      recStack.delete(node);
      stack.pop();
    };

    for (const node of Array.from(graph.keys()).sort()) {
      if (!visited.has(node)) dfs(node);
    }

    return cycles.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
  }
}
