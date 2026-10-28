import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Layers,
  Search,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Box,
  Eye,
  GitBranch,
} from 'lucide-react';
import { BuildViewProject, ArchitectureComponent } from '@shared/types.js';
import { LAYER_ACCENTS } from '@shared/tokens.js';
import { StatusBadge } from './ui/StatusBadge.js';
import { TestBadge } from './ui/TestBadge.js';
import { WasteBadge } from './ui/WasteBadge.js';

interface ArchitectureGraphProps {
  project: BuildViewProject;
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layerId: string;
}

export const ArchitectureGraph: React.FC<ArchitectureGraphProps> = ({
  project,
  selectedComponentId,
  onSelectComponent,
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'gap_detected' | 'prune'>('all');
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [edgeMode, setEdgeMode] = useState<'focused' | 'all'>('focused');
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 1300,
    height: 900,
  });

  // Sort layers foundation-up (order 0, 1, 2, 3)
  const sortedLayers = useMemo(
    () => [...project.layers].sort((a, b) => a.order - b.order),
    [project.layers]
  );

  // Filter components according to search and status filter
  const filteredComponents = useMemo(() => {
    return project.components.filter((comp) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = comp.name.toLowerCase().includes(q) || comp.id.toLowerCase().includes(q);
        const matchesFiles = comp.files.some((f) => f.path.toLowerCase().includes(q));
        const matchesFns = comp.anatomy.functions?.some((fn) => fn.name.toLowerCase().includes(q));
        if (!matchesName && !matchesFiles && !matchesFns) return false;
      }

      if (statusFilter === 'in_progress' && comp.status !== 'in_progress') return false;
      if (statusFilter === 'gap_detected' && !comp.gaps.some((g) => !g.resolved)) return false;
      if (statusFilter === 'prune' && comp.wasteMetrics?.recommendation !== 'prune') return false;

      return true;
    });
  }, [project.components, searchQuery, statusFilter]);

  // Map of active relationships for the hovered/selected node
  const activeFocusId = hoveredNodeId || selectedComponentId;
  const relationMap = useMemo(() => {
    if (!activeFocusId) return null;

    const activeComp = project.components.find((c) => c.id === activeFocusId);
    if (!activeComp) return null;

    const callers = new Set<string>();
    const callees = new Set<string>();

    for (const c of project.components) {
      if (c.anatomy.callees?.includes(activeFocusId)) callers.add(c.id);
      if (activeComp.anatomy.callees?.includes(c.id)) callees.add(c.id);
      if (activeComp.anatomy.callers?.includes(c.id)) callers.add(c.id);
      if (c.anatomy.callers?.includes(activeFocusId)) callees.add(c.id);
    }

    return { activeId: activeFocusId, callers, callees };
  }, [activeFocusId, project.components]);

  // Generate DAG edges based on callers / callees
  const edges = useMemo(() => {
    const list: Array<{ id: string; source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const comp of project.components) {
      if (comp.anatomy.callees) {
        for (const calleeId of comp.anatomy.callees) {
          if (project.components.some((c) => c.id === calleeId)) {
            const key = `${comp.id}->${calleeId}`;
            if (!seen.has(key)) {
              seen.add(key);
              list.push({ id: key, source: comp.id, target: calleeId });
            }
          }
        }
      }

      if (comp.anatomy.callers) {
        for (const callerId of comp.anatomy.callers) {
          if (project.components.some((c) => c.id === callerId)) {
            const key = `${callerId}->${comp.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              list.push({ id: key, source: callerId, target: comp.id });
            }
          }
        }
      }
    }
    return list;
  }, [project.components]);

  // Measure rendered node positions and full scrollable canvas dimensions
  const updateNodePositions = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const map = new Map<string, NodePosition>();

    for (const comp of project.components) {
      const el = container.querySelector(`[data-node-id="${comp.id}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        map.set(comp.id, {
          id: comp.id,
          x: rect.left - containerRect.left + container.scrollLeft,
          y: rect.top - containerRect.top + container.scrollTop,
          width: rect.width,
          height: rect.height,
          layerId: comp.layerId,
        });
      }
    }
    setNodePositions(map);
    setCanvasDimensions({
      width: Math.max(1300, container.scrollWidth),
      height: Math.max(800, container.scrollHeight),
    });
  }, [project.components]);

  useEffect(() => {
    updateNodePositions();
    const timer = setTimeout(updateNodePositions, 150);
    window.addEventListener('resize', updateNodePositions);
    return () => {
      window.removeEventListener('resize', updateNodePositions);
      clearTimeout(timer);
    };
  }, [filteredComponents, isCompact, updateNodePositions]);

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Filter and Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl neu-surface hairline-b">
        {/* Left: View Legend & Metrics */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded neu-well text-[11px]">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-bold text-[var(--text-primary)]">DAG ARCHITECTURE</span>
            <span className="text-[var(--text-tertiary)]">({filteredComponents.length} nodes, {edges.length} edges)</span>
          </div>

          <div className="hidden lg:flex items-center space-x-3 text-[11px] text-[var(--text-tertiary)]">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-emerald-500 rounded" />
              <span>Caller (Incoming)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-blue-500 rounded" />
              <span>Callee (Outbound)</span>
            </span>
          </div>
        </div>

        {/* Right: Search, Edge Mode, Filter Tabs, and Compact Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search components or files..."
              className="pl-8 pr-3 py-1 text-xs font-mono rounded neu-well bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none w-44 sm:w-52"
            />
          </div>

          {/* Edge Mode Segmented Toggle */}
          <div className="segmented-tabs font-mono text-[10px]" title="Edge visualization mode">
            <button
              onClick={() => setEdgeMode('focused')}
              className={`segmented-tab ${edgeMode === 'focused' ? 'active' : ''}`}
            >
              <Eye className="w-3 h-3" />
              <span>FOCUSED</span>
            </button>
            <button
              onClick={() => setEdgeMode('all')}
              className={`segmented-tab ${edgeMode === 'all' ? 'active' : ''}`}
            >
              <GitBranch className="w-3 h-3" />
              <span>ALL EDGES</span>
            </button>
          </div>

          {/* Status Segmented Filter */}
          <div className="segmented-tabs font-mono text-[10px]">
            <button
              onClick={() => setStatusFilter('all')}
              className={`segmented-tab ${statusFilter === 'all' ? 'active' : ''}`}
            >
              ALL
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={`segmented-tab ${statusFilter === 'in_progress' ? 'active' : ''}`}
            >
              BUILDING
            </button>
            <button
              onClick={() => setStatusFilter('gap_detected')}
              className={`segmented-tab ${statusFilter === 'gap_detected' ? 'active' : ''}`}
            >
              GAPS
            </button>
            <button
              onClick={() => setStatusFilter('prune')}
              className={`segmented-tab ${statusFilter === 'prune' ? 'active' : ''}`}
            >
              PRUNE
            </button>
          </div>

          {/* Compact Toggle */}
          <button
            onClick={() => setIsCompact(!isCompact)}
            className="action-btn text-xs font-mono flex items-center space-x-1"
            title={isCompact ? 'Detailed Cards' : 'Compact Pills'}
          >
            {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isCompact ? 'DETAILED' : 'COMPACT'}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Graph Canvas Container */}
      <div
        ref={containerRef}
        onScroll={updateNodePositions}
        className="relative overflow-x-auto min-h-[640px] max-h-[82vh] p-6 rounded-2xl neu-well select-none"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* Dynamic SVG Edges Canvas Layer */}
        <svg
          className="absolute left-0 top-0 pointer-events-none z-0"
          style={{
            width: `${canvasDimensions.width}px`,
            height: `${canvasDimensions.height}px`,
          }}
        >
          <defs>
            <marker
              id="arrowhead-default"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="#64748b" opacity="0.35" />
            </marker>
            <marker
              id="arrowhead-caller"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#10b981" />
            </marker>
            <marker
              id="arrowhead-callee"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#3b82f6" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const srcPos = nodePositions.get(edge.source);
            const tgtPos = nodePositions.get(edge.target);
            if (!srcPos || !tgtPos) return null;

            const isFocusActive = !!relationMap;
            const isCallerEdge = relationMap && edge.target === relationMap.activeId;
            const isCalleeEdge = relationMap && edge.source === relationMap.activeId;
            const isRelevant = isCallerEdge || isCalleeEdge;

            // In focused mode: only display edges related to active hovered/selected node
            if (edgeMode === 'focused' && isFocusActive && !isRelevant) {
              return null;
            }
            if (edgeMode === 'focused' && !isFocusActive) {
              // Idle state: show faint outline
              // Proceed with ultra-faint rendering
            }

            // Curve calculation based on relative positions
            const isForward = tgtPos.x > srcPos.x + 80;
            const isSameCol = Math.abs(tgtPos.x - srcPos.x) <= 80;

            let x1: number;
            let y1: number;
            let x2: number;
            let y2: number;
            let d: string;

            if (isSameCol) {
              // Same column: curve loops cleanly out to the right margin
              x1 = srcPos.x + srcPos.width;
              y1 = srcPos.y + srcPos.height / 2;
              x2 = tgtPos.x + tgtPos.width;
              y2 = tgtPos.y + tgtPos.height / 2;
              const loopOut = 45;
              d = `M ${x1} ${y1} C ${x1 + loopOut} ${y1}, ${x2 + loopOut} ${y2}, ${x2} ${y2}`;
            } else if (isForward) {
              // Forward Left-to-Right edge
              x1 = srcPos.x + srcPos.width;
              y1 = srcPos.y + srcPos.height / 2;
              x2 = tgtPos.x;
              y2 = tgtPos.y + tgtPos.height / 2;
              const dx = Math.min(160, Math.max(40, (x2 - x1) * 0.45));
              d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            } else {
              // Backward Right-to-Left edge (reverse dependency)
              x1 = srcPos.x;
              y1 = srcPos.y + srcPos.height / 2;
              x2 = tgtPos.x + tgtPos.width;
              y2 = tgtPos.y + tgtPos.height / 2;
              const dx = Math.min(120, Math.max(35, Math.abs(x1 - x2) * 0.4));
              d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
            }

            let stroke = 'rgba(100, 116, 139, 0.16)';
            let strokeWidth = 1.2;
            let marker = 'url(#arrowhead-default)';
            let opacity = 0.55;

            if (isCallerEdge) {
              stroke = '#10b981';
              strokeWidth = 2.5;
              marker = 'url(#arrowhead-caller)';
              opacity = 1;
            } else if (isCalleeEdge) {
              stroke = '#3b82f6';
              strokeWidth = 2.5;
              marker = 'url(#arrowhead-callee)';
              opacity = 1;
            } else if (isFocusActive) {
              opacity = 0.04;
            }

            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                markerEnd={marker}
                opacity={opacity}
                className="transition-all duration-200"
              />
            );
          })}
        </svg>

        {/* 4 Dedicated Layer Columns side-by-side */}
        <div className="relative z-10 grid grid-cols-4 gap-6 min-w-[1240px]">
          {sortedLayers.map((layer) => {
            const compsInLayer = filteredComponents.filter((c) => c.layerId === layer.id);
            const accent = LAYER_ACCENTS[layer.id] || LAYER_ACCENTS.default;

            return (
              <div
                key={layer.id}
                className="flex flex-col space-y-4 rounded-xl p-3.5 bg-[var(--surface-raised)]/70 border border-[var(--border-subtle)]"
              >
                {/* Layer Column Header */}
                <div className="flex items-center justify-between pb-2.5 hairline-b">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-3 h-3 rounded-full shadow-xs"
                      style={{ backgroundColor: layer.color || accent.bar }}
                    />
                    <div>
                      <h3 className="text-xs font-bold font-mono tracking-tight text-[var(--text-primary)] uppercase">
                        {layer.name.replace(/^Layer \d+:\s*/, '')}
                      </h3>
                      <p className="text-[10px] text-[var(--text-tertiary)] font-mono line-clamp-1">
                        {layer.description}
                      </p>
                    </div>
                  </div>
                  <span className="pill neutral text-[10px] font-mono shrink-0">
                    {compsInLayer.length}
                  </span>
                </div>

                {/* Nodes Stack */}
                <div className="flex flex-col space-y-3">
                  {compsInLayer.map((comp) => {
                    const activeGaps = comp.gaps.filter((g) => !g.resolved);
                    const effectiveStatus = activeGaps.length > 0 ? 'gap_detected' : comp.status;
                    const isSelected = selectedComponentId === comp.id;
                    const isHovered = hoveredNodeId === comp.id;

                    let relationshipBadge: React.ReactNode = null;
                    let nodeOpacity = 1;

                    if (relationMap && !isHovered && !isSelected) {
                      if (relationMap.callers.has(comp.id)) {
                        relationshipBadge = (
                          <span className="pill green text-[9px] font-mono font-bold animate-pulse">
                            CALLER
                          </span>
                        );
                      } else if (relationMap.callees.has(comp.id)) {
                        relationshipBadge = (
                          <span className="pill blue text-[9px] font-mono font-bold animate-pulse">
                            CALLEE
                          </span>
                        );
                      } else {
                        nodeOpacity = 0.35;
                      }
                    }

                    return (
                      <div
                        key={comp.id}
                        data-node-id={comp.id}
                        onClick={() => onSelectComponent(comp.id)}
                        onMouseEnter={() => setHoveredNodeId(comp.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        style={{ opacity: nodeOpacity }}
                        className={`cursor-pointer rounded-xl neu-card transition-all duration-200 border-l-4 ${
                          isSelected
                            ? 'ring-2 ring-blue-500 shadow-xl -translate-y-0.5'
                            : isHovered
                            ? 'shadow-md -translate-y-0.5'
                            : ''
                        } ${
                          effectiveStatus === 'gap_detected'
                            ? 'border-l-amber-500'
                            : comp.status === 'completed'
                            ? 'border-l-emerald-500'
                            : comp.status === 'in_progress'
                            ? 'border-l-blue-500'
                            : 'border-l-slate-400'
                        } ${isCompact ? 'p-2.5' : 'p-3.5'}`}
                      >
                        {/* Top Meta: Priority & Status Pill */}
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center space-x-1.5 font-mono text-[10px]">
                            <span className="px-1.5 py-0.2 rounded neu-well font-bold text-[var(--text-primary)]">
                              P{comp.priority}
                            </span>
                            {relationshipBadge}
                          </div>
                          <StatusBadge status={effectiveStatus} gapCount={activeGaps.length} />
                        </div>

                        {/* Title */}
                        <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-1 hover:text-blue-500 transition-colors">
                          {comp.name}
                        </h4>

                        {!isCompact && (
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2 leading-tight">
                            {comp.description}
                          </p>
                        )}

                        {/* Progress Bar & Files count */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                            <span className="text-[var(--text-tertiary)] flex items-center space-x-1">
                              <FileCode className="w-3 h-3" />
                              <span>{comp.files.length} files</span>
                            </span>
                            <span className="font-bold text-[var(--text-primary)]">{comp.progress}%</span>
                          </div>
                          <div className="w-full h-1 rounded-full neu-well overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                comp.status === 'completed'
                                  ? 'bg-[#30d158]'
                                  : effectiveStatus === 'gap_detected'
                                  ? 'bg-[#ff9f0a]'
                                  : 'bg-[#32ade6]'
                              }`}
                              style={{ width: `${comp.progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Health Badges: Tests & Waste Prune */}
                        <div className="mt-2.5 pt-2 hairline-t flex flex-wrap items-center gap-1.5 text-[9px] font-mono">
                          <TestBadge testSummary={comp.testSummary} />
                          <WasteBadge wasteMetrics={comp.wasteMetrics} />
                        </div>
                      </div>
                    );
                  })}

                  {compsInLayer.length === 0 && (
                    <div className="p-4 text-center text-xs font-mono text-[var(--text-tertiary)] neu-well rounded-lg">
                      No matching components
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
