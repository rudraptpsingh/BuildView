import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Layers,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  HelpCircle,
  Maximize2,
  Minimize2,
  Info,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());

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
  const relationMap = useMemo(() => {
    const activeId = hoveredNodeId || selectedComponentId;
    if (!activeId) return null;

    const activeComp = project.components.find((c) => c.id === activeId);
    if (!activeComp) return null;

    // Callers: components that call activeComp
    // Callees: components that activeComp calls
    const callers = new Set<string>();
    const callees = new Set<string>();

    for (const c of project.components) {
      if (c.anatomy.callees?.includes(activeId)) {
        callers.add(c.id);
      }
      if (activeComp.anatomy.callees?.includes(c.id)) {
        callees.add(c.id);
      }
      if (activeComp.anatomy.callers?.includes(c.id)) {
        callers.add(c.id);
      }
      if (c.anatomy.callers?.includes(activeId)) {
        callees.add(c.id);
      }
    }

    return { activeId, callers, callees };
  }, [hoveredNodeId, selectedComponentId, project.components]);

  // Generate DAG edges based on callers / callees
  const edges = useMemo(() => {
    const list: Array<{ id: string; source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const comp of project.components) {
      // Callees: comp -> target
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

      // Callers: callerId -> comp
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

  // Measure rendered node positions for drawing Bezier curves
  const updateNodePositions = () => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const map = new Map<string, NodePosition>();

    for (const comp of project.components) {
      const el = containerRef.current.querySelector(`[data-node-id="${comp.id}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        map.set(comp.id, {
          id: comp.id,
          x: rect.left - containerRect.left + containerRef.current.scrollLeft,
          y: rect.top - containerRect.top + containerRef.current.scrollTop,
          width: rect.width,
          height: rect.height,
          layerId: comp.layerId,
        });
      }
    }
    setNodePositions(map);
  };

  useEffect(() => {
    updateNodePositions();
    window.addEventListener('resize', updateNodePositions);
    const timeout = setTimeout(updateNodePositions, 100);
    return () => {
      window.removeEventListener('resize', updateNodePositions);
      clearTimeout(timeout);
    };
  }, [project.components, isCompact, sortedLayers]);

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Filter and Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl neu-surface hairline-b">
        {/* Left: View Legend & Metrics */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded neu-well text-[11px]">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-bold text-[var(--text-primary)]">DAG GRAPH</span>
            <span className="text-[var(--text-tertiary)]">({filteredComponents.length} nodes, {edges.length} edges)</span>
          </div>

          <div className="hidden md:flex items-center space-x-3 text-[11px] text-[var(--text-tertiary)]">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-emerald-500 rounded" />
              <span>Incoming Caller</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-blue-500 rounded" />
              <span>Outgoing Callee</span>
            </span>
          </div>
        </div>

        {/* Right: Search, Filter Tabs, and Compact Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter nodes or functions..."
              className="pl-8 pr-3 py-1 text-xs font-mono rounded neu-well bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none w-44 sm:w-56"
            />
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
            title={isCompact ? 'Detailed Cards' : 'Minimal Compact Nodes'}
          >
            {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isCompact ? 'DETAILED' : 'COMPACT'}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Graph Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto min-h-[580px] p-6 rounded-2xl neu-well select-none"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* SVG Edges Overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          style={{ minWidth: '1000px', minHeight: '600px' }}
        >
          <defs>
            <marker
              id="arrowhead-default"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#64748b" opacity="0.45" />
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

            // Compute connection points: from right/center of source to left/center of target
            const x1 = srcPos.x + srcPos.width;
            const y1 = srcPos.y + srcPos.height / 2;
            const x2 = tgtPos.x;
            const y2 = tgtPos.y + tgtPos.height / 2;

            // Curvature calculation for smooth horizontal Bezier
            const dx = Math.abs(x2 - x1) * 0.5;
            const d = `M ${x1} ${y1} C ${x1 + Math.max(30, dx)} ${y1}, ${x2 - Math.max(30, dx)} ${y2}, ${x2} ${y2}`;

            let stroke = 'rgba(100, 116, 139, 0.28)';
            let strokeWidth = 1.5;
            let marker = 'url(#arrowhead-default)';
            let opacity = 1;

            if (relationMap) {
              const isActiveSource = edge.source === relationMap.activeId;
              const isActiveTarget = edge.target === relationMap.activeId;

              if (isActiveSource) {
                // Outgoing callee call
                stroke = '#3b82f6';
                strokeWidth = 2.5;
                marker = 'url(#arrowhead-callee)';
              } else if (isActiveTarget) {
                // Incoming caller call
                stroke = '#10b981';
                strokeWidth = 2.5;
                marker = 'url(#arrowhead-caller)';
              } else {
                opacity = 0.12;
              }
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

        {/* Columns of Layers */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-w-[950px]">
          {sortedLayers.map((layer) => {
            const compsInLayer = filteredComponents.filter((c) => c.layerId === layer.id);
            const accent = LAYER_ACCENTS[layer.id] || LAYER_ACCENTS.default;

            return (
              <div
                key={layer.id}
                className="flex flex-col space-y-4 rounded-xl p-3 bg-[var(--surface-raised)]/65 border border-[var(--border-subtle)]"
              >
                {/* Layer Column Header */}
                <div className="flex items-center justify-between pb-2 hairline-b">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: layer.color || accent.bar }}
                    />
                    <span className="text-xs font-bold font-mono tracking-tight text-[var(--text-primary)] uppercase">
                      {layer.name.replace(/^Layer \d+:\s*/, '')}
                    </span>
                  </div>
                  <span className="pill neutral text-[10px] font-mono">
                    {compsInLayer.length}
                  </span>
                </div>

                {/* Nodes Stack */}
                <div className="flex flex-col space-y-3.5">
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
                            ? 'ring-2 ring-blue-500 shadow-lg -translate-y-0.5'
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

                        {/* Progress Bar */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                            <span className="text-[var(--text-tertiary)] uppercase font-semibold">EXEC</span>
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
                      No components in layer
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
