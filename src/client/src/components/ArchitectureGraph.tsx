import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Layers,
  Search,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  TestTube,
  Trash2,
  Eye,
  GitBranch,
  ArrowRight,
  Database,
  Cpu,
  Terminal,
  Layout,
  ExternalLink,
} from 'lucide-react';
import { BuildViewProject, ArchitectureComponent } from '@shared/types.js';
import { LAYER_ACCENTS } from '@shared/tokens.js';
import { StatusBadge } from './ui/StatusBadge.js';
import { TestBadge } from './ui/TestBadge.js';
import { WasteBadge } from './ui/WasteBadge.js';

interface ArchitectureGraphProps {
  project: BuildViewProject;
  selectedComponentId: string | null;
  onSelectComponent: (id: string, tab?: string) => void;
}

interface CircleNodePosition {
  id: string;
  cx: number;
  cy: number;
  r: number;
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
  const [nodePositions, setNodePositions] = useState<Map<string, CircleNodePosition>>(new Map());
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

  // Active focused node (hovered takes precedence, then selected)
  const activeFocusId = hoveredNodeId || selectedComponentId;
  const activeComponent = useMemo(
    () => project.components.find((c) => c.id === activeFocusId) || null,
    [activeFocusId, project.components]
  );

  // Map of active relationships for the hovered/selected node
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

  // Measure rendered circle node centers and full scrollable canvas dimensions
  const updateNodePositions = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const map = new Map<string, CircleNodePosition>();

    for (const comp of project.components) {
      const el = container.querySelector(`[data-circle-node="${comp.id}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const r = rect.width / 2;
        map.set(comp.id, {
          id: comp.id,
          cx: rect.left - containerRect.left + container.scrollLeft + r,
          cy: rect.top - containerRect.top + container.scrollTop + r,
          r,
          layerId: comp.layerId,
        });
      }
    }
    setNodePositions(map);
    setCanvasDimensions({
      width: Math.max(1240, container.scrollWidth),
      height: Math.max(820, container.scrollHeight),
    });
  }, [project.components]);

  useEffect(() => {
    updateNodePositions();
    const timer = setTimeout(updateNodePositions, 100);
    window.addEventListener('resize', updateNodePositions);
    return () => {
      window.removeEventListener('resize', updateNodePositions);
      clearTimeout(timer);
    };
  }, [filteredComponents, isCompact, updateNodePositions]);

  // Icon helper based on layer
  const getLayerIcon = (layerId: string) => {
    switch (layerId) {
      case 'layer_0_native_storage':
        return <Database className="w-3.5 h-3.5" />;
      case 'layer_1_ai_ml':
        return <Cpu className="w-3.5 h-3.5" />;
      case 'layer_2_ipc_desktop':
        return <Terminal className="w-3.5 h-3.5" />;
      default:
        return <Layout className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Filter and Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl neu-surface hairline-b">
        {/* Left: Legend & Node/Edge counters */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded neu-well text-[11px]">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-bold text-[var(--text-primary)]">DAG CIRCLE GRAPH</span>
            <span className="text-[var(--text-tertiary)]">({filteredComponents.length} nodes, {edges.length} edges)</span>
          </div>

          <div className="hidden lg:flex items-center space-x-3 text-[11px] text-[var(--text-tertiary)]">
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Caller (Incoming)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Callee (Outbound)</span>
            </span>
          </div>
        </div>

        {/* Right: Search, Edge Mode, Filter, and Density */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
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

          {/* Edge Mode: Focused vs All Edges */}
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

          {/* Status Filter */}
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
            title={isCompact ? 'Standard Circles' : 'Compact Circles'}
          >
            {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isCompact ? 'STANDARD' : 'COMPACT'}</span>
          </button>
        </div>
      </div>

      {/* Main Graph Canvas Container with Circles and Edges */}
      <div
        ref={containerRef}
        onScroll={updateNodePositions}
        className="relative overflow-x-auto min-h-[660px] max-h-[82vh] p-6 rounded-2xl neu-well select-none"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* Dynamic SVG Directed Edges Layer */}
        <svg
          className="absolute left-0 top-0 pointer-events-none z-0"
          style={{
            width: `${canvasDimensions.width}px`,
            height: `${canvasDimensions.height}px`,
          }}
        >
          <defs>
            <marker
              id="circle-arrow-default"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="#64748b" opacity="0.35" />
            </marker>
            <marker
              id="circle-arrow-caller"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#10b981" />
            </marker>
            <marker
              id="circle-arrow-callee"
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

            // Curve calculation based on circle perimeters
            const r1 = srcPos.r;
            const r2 = tgtPos.r;
            const isForward = tgtPos.cx > srcPos.cx + 50;
            const isSameCol = Math.abs(tgtPos.cx - srcPos.cx) <= 50;

            let x1: number;
            let y1: number;
            let x2: number;
            let y2: number;
            let d: string;

            if (isSameCol) {
              // Same layer: curves out cleanly to the right
              x1 = srcPos.cx + r1;
              y1 = srcPos.cy;
              x2 = tgtPos.cx + r2;
              y2 = tgtPos.cy;
              const loopOut = 35;
              d = `M ${x1} ${y1} C ${x1 + loopOut} ${y1}, ${x2 + loopOut} ${y2}, ${x2} ${y2}`;
            } else if (isForward) {
              // Forward Left-to-Right edge
              x1 = srcPos.cx + r1;
              y1 = srcPos.cy;
              x2 = tgtPos.cx - r2;
              y2 = tgtPos.cy;
              const dx = Math.min(160, Math.max(30, (x2 - x1) * 0.45));
              d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            } else {
              // Backward Right-to-Left edge (reverse feedback loop)
              x1 = srcPos.cx - r1;
              y1 = srcPos.cy;
              x2 = tgtPos.cx + r2;
              y2 = tgtPos.cy;
              const dx = Math.min(120, Math.max(30, Math.abs(x1 - x2) * 0.4));
              d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
            }

            let stroke = 'rgba(100, 116, 139, 0.16)';
            let strokeWidth = 1.2;
            let marker = 'url(#circle-arrow-default)';
            let opacity = 0.55;

            if (isCallerEdge) {
              stroke = '#10b981';
              strokeWidth = 2.5;
              marker = 'url(#circle-arrow-caller)';
              opacity = 1;
            } else if (isCalleeEdge) {
              stroke = '#3b82f6';
              strokeWidth = 2.5;
              marker = 'url(#circle-arrow-callee)';
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

        {/* 4 Dedicated Layer Columns: Circles and Labels */}
        <div className="relative z-10 grid grid-cols-4 gap-6 min-w-[1240px]">
          {sortedLayers.map((layer) => {
            const compsInLayer = filteredComponents.filter((c) => c.layerId === layer.id);
            const accent = LAYER_ACCENTS[layer.id] || LAYER_ACCENTS.default;

            return (
              <div
                key={layer.id}
                className="flex flex-col space-y-4 rounded-xl p-3.5 bg-[var(--surface-raised)]/60 border border-[var(--border-subtle)]"
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

                {/* Circle Nodes Rail */}
                <div className="flex flex-col space-y-3.5">
                  {compsInLayer.map((comp) => {
                    const activeGaps = comp.gaps.filter((g) => !g.resolved);
                    const effectiveStatus = activeGaps.length > 0 ? 'gap_detected' : comp.status;
                    const isSelected = selectedComponentId === comp.id;
                    const isHovered = hoveredNodeId === comp.id;

                    let isCaller = false;
                    let isCallee = false;
                    let nodeOpacity = 1;

                    if (relationMap && !isHovered && !isSelected) {
                      if (relationMap.callers.has(comp.id)) {
                        isCaller = true;
                      } else if (relationMap.callees.has(comp.id)) {
                        isCallee = true;
                      } else {
                        nodeOpacity = 0.25;
                      }
                    }

                    // Circle Border Color
                    let circleBorderColor = accent.bar;
                    if (isCaller) circleBorderColor = '#10b981';
                    else if (isCallee) circleBorderColor = '#3b82f6';
                    else if (effectiveStatus === 'gap_detected') circleBorderColor = '#f59e0b';
                    else if (comp.status === 'completed') circleBorderColor = '#10b981';

                    const circleSizeClass = isCompact ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm';

                    return (
                      <div
                        key={comp.id}
                        onClick={() => onSelectComponent(comp.id)}
                        onMouseEnter={() => setHoveredNodeId(comp.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        style={{ opacity: nodeOpacity }}
                        className={`group relative flex items-center space-x-3 p-2 rounded-xl transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'neu-surface ring-2 ring-blue-500 shadow-md'
                            : isHovered
                            ? 'neu-surface shadow-xs'
                            : 'hover:bg-[var(--surface-sunken)]/60'
                        }`}
                      >
                        {/* Circle Node Element */}
                        <div
                          data-circle-node={comp.id}
                          className={`relative shrink-0 rounded-full flex items-center justify-center font-mono font-bold transition-transform duration-200 ${circleSizeClass} ${
                            isHovered || isSelected ? 'scale-110 shadow-lg' : 'shadow-xs'
                          }`}
                          style={{
                            backgroundColor: 'var(--surface-raised)',
                            border: `2.5px solid ${circleBorderColor}`,
                          }}
                        >
                          {/* Inner Label: Priority or Layer Icon */}
                          <div className="flex flex-col items-center justify-center">
                            <span className="text-[10px] font-bold text-[var(--text-primary)]">
                              P{comp.priority}
                            </span>
                          </div>

                          {/* Gap Indicator Dot on Circle (Top-Right) */}
                          {effectiveStatus === 'gap_detected' && (
                            <span
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs animate-bounce"
                              title={`${activeGaps.length} architectural gap detected`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                            </span>
                          )}

                          {/* Completed Checkmark on Circle (Bottom-Right) */}
                          {comp.status === 'completed' && effectiveStatus !== 'gap_detected' && (
                            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            </span>
                          )}

                          {/* Prune Indicator (Top-Left) */}
                          {comp.wasteMetrics?.recommendation === 'prune' && (
                            <span
                              className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-xs"
                              title="Dead code prune candidate"
                            >
                              <Trash2 className="w-2 h-2" />
                            </span>
                          )}
                        </div>

                        {/* Node Label & Telemetry beside Circle */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-xs text-[var(--text-primary)] truncate group-hover:text-blue-500 transition-colors">
                              {comp.name}
                            </span>
                            {isCaller && (
                              <span className="pill green text-[8px] font-mono px-1 py-0 font-bold shrink-0 animate-pulse">
                                CALLER
                              </span>
                            )}
                            {isCallee && (
                              <span className="pill blue text-[8px] font-mono px-1 py-0 font-bold shrink-0 animate-pulse">
                                CALLEE
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">
                            <span className="flex items-center space-x-0.5">
                              <FileCode className="w-2.5 h-2.5" />
                              <span>{comp.files.length}f</span>
                            </span>
                            <span>•</span>
                            <span className="flex items-center space-x-0.5 text-emerald-600 dark:text-emerald-400">
                              <TestTube className="w-2.5 h-2.5" />
                              <span>{comp.testSummary?.totalTests || 0}t</span>
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-[var(--text-primary)]">{comp.progress}%</span>
                          </div>
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

        {/* Floating / Docked Active Inspector Card */}
        {activeComponent && (
          <div className="sticky bottom-0 z-20 mt-6 p-4 rounded-xl neu-surface hairline-t shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-blue-500 backdrop-blur-md bg-[var(--surface-window)]/90 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start md:items-center space-x-3.5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm shadow-xs shrink-0"
                style={{
                  backgroundColor: 'var(--surface-raised)',
                  border: `2.5px solid ${
                    activeComponent.gaps.some((g) => !g.resolved)
                      ? '#f59e0b'
                      : activeComponent.status === 'completed'
                      ? '#10b981'
                      : '#3b82f6'
                  }`,
                }}
              >
                P{activeComponent.priority}
              </div>

              <div>
                <div className="flex items-center space-x-2 font-mono text-xs">
                  <span className="font-bold text-sm text-[var(--text-primary)]">
                    {activeComponent.name}
                  </span>
                  <StatusBadge
                    status={activeComponent.gaps.some((g) => !g.resolved) ? 'gap_detected' : activeComponent.status}
                    gapCount={activeComponent.gaps.filter((g) => !g.resolved).length}
                  />
                </div>

                <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1 max-w-2xl">
                  {activeComponent.description}
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] font-mono text-[var(--text-tertiary)]">
                  <span className="flex items-center space-x-1">
                    <FileCode className="w-3 h-3" />
                    <span>{activeComponent.files.length} files</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
                    <TestTube className="w-3 h-3" />
                    <span>{activeComponent.testSummary?.totalTests || 0} tests ({activeComponent.testSummary?.status || 'untested'})</span>
                  </span>
                  <span>•</span>
                  <span>{activeComponent.astMetrics?.linesOfCode || 0} LOC</span>
                  <span>•</span>
                  <span>Callers: {activeComponent.anatomy.callers?.length || 0}</span>
                  <span>•</span>
                  <span>Callees: {activeComponent.anatomy.callees?.length || 0}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                onClick={() => onSelectComponent(activeComponent.id)}
                className="action-btn font-mono text-xs font-bold px-3 py-1.5 flex items-center space-x-1.5"
              >
                <span>OPEN DRAWER</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
