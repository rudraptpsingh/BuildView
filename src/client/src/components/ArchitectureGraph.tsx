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
  Plus,
  Minus,
  RotateCcw,
  Move,
  Filter,
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
  const [selectedLayerFilter, setSelectedLayerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'gap_detected' | 'prune'>('all');
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [edgeMode, setEdgeMode] = useState<'focused' | 'all'>('focused');
  const [showTestLayer, setShowTestLayer] = useState<boolean>(true);

  // Canvas Pan & Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number }>({
    x: 0,
    y: 0,
    startPanX: 0,
    startPanY: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, CircleNodePosition>>(new Map());
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 1400,
    height: 900,
  });

  // Sort layers foundation-up (order 0, 1, 2, 3, 4)
  const sortedLayers = useMemo(
    () => [...project.layers].sort((a, b) => a.order - b.order),
    [project.layers]
  );

  // Filtered layers based on test toggle
  const visibleLayers = useMemo(() => {
    return sortedLayers.filter((l) => {
      const isTest = l.id === 'layer_4_tests' || l.id === 'layer_verification';
      if (!showTestLayer && isTest) return false;
      return true;
    });
  }, [sortedLayers, showTestLayer]);

  // Filter components according to search, layer, status, and test toggle
  const filteredComponents = useMemo(() => {
    return project.components.filter((comp) => {
      // Test layer toggle
      const isTest = comp.layerId === 'layer_4_tests' || comp.layerId === 'layer_verification';
      if (!showTestLayer && isTest) return false;

      // Layer filter
      if (selectedLayerFilter !== 'all' && comp.layerId !== selectedLayerFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = comp.name.toLowerCase().includes(q) || comp.id.toLowerCase().includes(q);
        const matchesFiles = comp.files.some((f) => f.path.toLowerCase().includes(q));
        const matchesFns = comp.anatomy.functions?.some((fn) => fn.name.toLowerCase().includes(q));
        if (!matchesName && !matchesFiles && !matchesFns) return false;
      }

      // Status filter
      if (statusFilter === 'in_progress' && comp.status !== 'in_progress') return false;
      if (statusFilter === 'gap_detected' && !comp.gaps.some((g) => !g.resolved)) return false;
      if (statusFilter === 'prune' && comp.wasteMetrics?.recommendation !== 'prune') return false;

      return true;
    });
  }, [project.components, searchQuery, selectedLayerFilter, statusFilter, showTestLayer]);

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

  // Measure rendered circle node centers inside the transform content
  const updateNodePositions = useCallback(() => {
    if (!contentRef.current) return;
    const contentEl = contentRef.current;
    const contentRect = contentEl.getBoundingClientRect();
    const map = new Map<string, CircleNodePosition>();

    for (const comp of project.components) {
      const el = contentEl.querySelector(`[data-circle-node="${comp.id}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        // Calculate coordinate unscaled relative to contentEl
        const r = (rect.width / zoom) / 2;
        const cx = (rect.left - contentRect.left) / zoom + r;
        const cy = (rect.top - contentRect.top) / zoom + r;
        map.set(comp.id, {
          id: comp.id,
          cx,
          cy,
          r,
          layerId: comp.layerId,
        });
      }
    }
    setNodePositions(map);
    setCanvasDimensions({
      width: Math.max(1400, contentEl.scrollWidth),
      height: Math.max(850, contentEl.scrollHeight),
    });
  }, [project.components, zoom]);

  useEffect(() => {
    updateNodePositions();
    const timer = setTimeout(updateNodePositions, 80);
    window.addEventListener('resize', updateNodePositions);
    return () => {
      window.removeEventListener('resize', updateNodePositions);
      clearTimeout(timer);
    };
  }, [filteredComponents, isCompact, updateNodePositions]);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-interactive="true"]')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)));
  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Layer Icon helper
  const getLayerIcon = (layerId: string) => {
    switch (layerId) {
      case 'layer_0_native_storage':
      case 'layer_foundation':
        return <Database className="w-3.5 h-3.5 text-blue-400" />;
      case 'layer_1_ai_ml':
      case 'layer_domain':
        return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
      case 'layer_2_ipc_desktop':
      case 'layer_state_ipc':
        return <Terminal className="w-3.5 h-3.5 text-amber-400" />;
      case 'layer_3_studio_ui':
      case 'layer_presentation':
        return <Layout className="w-3.5 h-3.5 text-rose-400" />;
      case 'layer_4_tests':
      case 'layer_verification':
        return <TestTube className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Layers className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex flex-col space-y-3">
      {/* Top Filter and Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl neu-surface hairline-b">
        {/* Left: Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search components, files, functions..."
              className="pl-8 pr-3 py-1 text-xs font-mono rounded neu-well bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none w-48 sm:w-60"
            />
          </div>

          {/* Layer Filter Select */}
          <select
            value={selectedLayerFilter}
            onChange={(e) => setSelectedLayerFilter(e.target.value)}
            className="px-2.5 py-1 text-xs font-mono rounded neu-well bg-transparent text-[var(--text-primary)] border-none focus:outline-none"
          >
            <option value="all">ALL LAYERS ({project.layers.length})</option>
            {project.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name.replace(/^Layer \d+:\s*/, '')}
              </option>
            ))}
          </select>

          {/* Status Quick Filter */}
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
        </div>

        {/* Right: Edge Mode, Test Toggle & Zoom Controls */}
        <div className="flex items-center space-x-2 font-mono text-xs">
          {/* Test Layer Toggle */}
          <button
            onClick={() => setShowTestLayer(!showTestLayer)}
            className={`action-btn text-[10px] font-mono flex items-center space-x-1.5 px-2.5 py-1 transition-all ${
              showTestLayer
                ? 'text-emerald-400 border border-emerald-500/40 bg-emerald-500/10'
                : 'text-[var(--text-tertiary)]'
            }`}
            title="Toggle Verification & Test Harness Layer (Layer 4)"
          >
            <TestTube className="w-3 h-3" />
            <span>TESTS {showTestLayer ? 'ON' : 'OFF'}</span>
          </button>

          {/* Edge Mode: Focused vs All Edges */}
          <div className="segmented-tabs text-[10px]">
            <button
              onClick={() => setEdgeMode('focused')}
              className={`segmented-tab ${edgeMode === 'focused' ? 'active' : ''}`}
              title="Spotlight dependencies on hover"
            >
              <Eye className="w-3 h-3" />
              <span>FOCUSED</span>
            </button>
            <button
              onClick={() => setEdgeMode('all')}
              className={`segmented-tab ${edgeMode === 'all' ? 'active' : ''}`}
              title="Show all architectural dependency lines"
            >
              <GitBranch className="w-3 h-3" />
              <span>ALL EDGES</span>
            </button>
          </div>

          {/* Compact Density Toggle */}
          <button
            onClick={() => setIsCompact(!isCompact)}
            className="action-btn text-xs"
            title={isCompact ? 'Standard Density' : 'Compact Density'}
          >
            {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Zoom Buttons */}
          <div className="action-group">
            <button onClick={handleZoomOut} className="action-btn p-1" title="Zoom Out">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleResetView} className="action-btn px-2 text-[10px]" title="Reset to 100%">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={handleZoomIn} className="action-btn p-1" title="Zoom In">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Graph Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative w-full h-[calc(100vh-140px)] min-h-[680px] overflow-hidden rounded-2xl neu-well canvas-dot-grid border border-[var(--border-default)] select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Transformable Graph Canvas (Pans and Zooms Smoothly) */}
        <div
          ref={contentRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
            transition: isDragging ? 'none' : 'transform 0.1s cubic-bezier(0.16, 1, 0.3, 1)',
            width: `${canvasDimensions.width}px`,
            minHeight: `${canvasDimensions.height}px`,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          className="p-8"
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
                id="dag-arrow-default"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#64748b" opacity="0.3" />
              </marker>
              <marker
                id="dag-arrow-caller"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 7 3.5, 0 7" fill="#10b981" />
              </marker>
              <marker
                id="dag-arrow-callee"
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

              // Compute connection curve from circle perimeter
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
                // Same column loop
                x1 = srcPos.cx + r1;
                y1 = srcPos.cy;
                x2 = tgtPos.cx + r2;
                y2 = tgtPos.cy;
                const loopOut = 32;
                d = `M ${x1} ${y1} C ${x1 + loopOut} ${y1}, ${x2 + loopOut} ${y2}, ${x2} ${y2}`;
              } else if (isForward) {
                // Forward edge
                x1 = srcPos.cx + r1;
                y1 = srcPos.cy;
                x2 = tgtPos.cx - r2;
                y2 = tgtPos.cy;
                const dx = Math.min(160, Math.max(30, (x2 - x1) * 0.45));
                d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              } else {
                // Backward edge
                x1 = srcPos.cx - r1;
                y1 = srcPos.cy;
                x2 = tgtPos.cx + r2;
                y2 = tgtPos.cy;
                const dx = Math.min(120, Math.max(30, Math.abs(x1 - x2) * 0.4));
                d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
              }

              let stroke = 'rgba(100, 116, 139, 0.16)';
              let strokeWidth = 1.2;
              let marker = 'url(#dag-arrow-default)';
              let opacity = 0.5;

              if (isCallerEdge) {
                stroke = '#10b981';
                strokeWidth = 2.5;
                marker = 'url(#dag-arrow-caller)';
                opacity = 1;
              } else if (isCalleeEdge) {
                stroke = '#3b82f6';
                strokeWidth = 2.5;
                marker = 'url(#dag-arrow-callee)';
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
                  strokeDasharray={isCallerEdge || isCalleeEdge ? '6,4' : undefined}
                  markerEnd={marker}
                  opacity={opacity}
                  className="transition-all duration-200"
                />
              );
            })}
          </svg>

          {/* Dedicated Layer Track Columns (Dynamic 4 or 5 columns) */}
          <div
            className="relative z-10 grid gap-6"
            style={{
              gridTemplateColumns: `repeat(${visibleLayers.length}, minmax(280px, 1fr))`,
              minWidth: `${Math.max(1200, visibleLayers.length * 300)}px`,
            }}
          >
            {visibleLayers.map((layer) => {
              const compsInLayer = filteredComponents.filter((c) => c.layerId === layer.id);
              const accent = LAYER_ACCENTS[layer.id] || LAYER_ACCENTS.default;

              return (
                <div
                  key={layer.id}
                  className="flex flex-col space-y-4 rounded-2xl p-4 bg-[var(--surface-window)]/75 border border-[var(--border-subtle)] shadow-xs"
                >
                  {/* Minimal Column Header */}
                  <div className="flex items-center justify-between pb-3 hairline-b">
                    <div className="flex items-center space-x-2">
                      <div className="p-1 rounded-md bg-[var(--surface-control)]">
                        {getLayerIcon(layer.id)}
                      </div>
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
                      const isTestHarness = comp.layerId === 'layer_4_tests' || comp.layerId === 'layer_verification';

                      let isCaller = false;
                      let isCallee = false;
                      let nodeOpacity = 1;

                      if (relationMap && !isHovered && !isSelected) {
                        if (relationMap.callers.has(comp.id)) {
                          isCaller = true;
                        } else if (relationMap.callees.has(comp.id)) {
                          isCallee = true;
                        } else {
                          nodeOpacity = 0.2;
                        }
                      }

                      // Dynamic circle accent border
                      let circleBorder = accent.bar;
                      if (isCaller) circleBorder = '#10b981';
                      else if (isCallee) circleBorder = '#3b82f6';
                      else if (effectiveStatus === 'gap_detected') circleBorder = '#f59e0b';
                      else if (comp.status === 'completed') circleBorder = '#10b981';

                      const circleSize = isCompact ? 'w-10 h-10' : 'w-12 h-12';

                      return (
                        <div
                          key={comp.id}
                          data-interactive="true"
                          onClick={() => onSelectComponent(comp.id)}
                          onMouseEnter={() => setHoveredNodeId(comp.id)}
                          onMouseLeave={() => setHoveredNodeId(null)}
                          style={{ opacity: nodeOpacity }}
                          className={`group relative flex items-center space-x-3 p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? 'neu-surface ring-2 ring-blue-500 shadow-md'
                              : isHovered
                              ? 'neu-surface shadow-xs'
                              : 'hover:bg-[var(--surface-control)]/40'
                          }`}
                        >
                          {/* Circle Node Glyph */}
                          <div
                            data-circle-node={comp.id}
                            className={`relative shrink-0 rounded-full flex items-center justify-center font-mono font-bold transition-all duration-200 ${circleSize} ${
                              isHovered || isSelected ? 'scale-110 shadow-lg' : 'shadow-xs'
                            }`}
                            style={{
                              backgroundColor: 'var(--surface-raised)',
                              border: `2.5px solid ${circleBorder}`,
                            }}
                          >
                            {isTestHarness ? (
                              <TestTube className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <span className="text-[10px] font-bold text-[var(--text-primary)]">
                                P{comp.priority}
                              </span>
                            )}

                            {/* Gap Warning Dot (Top-Right) */}
                            {effectiveStatus === 'gap_detected' && (
                              <span
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs animate-bounce"
                                title={`${activeGaps.length} architectural gap detected`}
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                              </span>
                            )}

                            {/* Completed Checkmark (Bottom-Right) */}
                            {comp.status === 'completed' && effectiveStatus !== 'gap_detected' && (
                              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              </span>
                            )}

                            {/* Prune Waste Tag (Top-Left) */}
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
        </div>

        {/* Floating Docked Active Inspector Card at Bottom-Right */}
        {activeComponent && (
          <div
            data-interactive="true"
            className="absolute bottom-5 right-6 z-30 max-w-lg w-full p-4 rounded-xl neu-surface hairline-t shadow-2xl backdrop-blur-md bg-[var(--surface-window)]/95 border border-[var(--border-default)] animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-xs shadow-xs shrink-0"
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
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                    {activeComponent.description}
                  </p>
                </div>
              </div>

              <button
                onClick={() => onSelectComponent(activeComponent.id)}
                className="action-btn text-xs font-mono font-bold px-2.5 py-1 text-blue-500 shrink-0 flex items-center space-x-1"
              >
                <span>DETAILS</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="mt-3 pt-2.5 hairline-t flex flex-wrap items-center justify-between text-[10px] font-mono text-[var(--text-tertiary)]">
              <div className="flex items-center space-x-2">
                <span>{activeComponent.files.length} files</span>
                <span>•</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {activeComponent.testSummary?.totalTests || 0} tests
                </span>
                <span>•</span>
                <span>{activeComponent.astMetrics?.linesOfCode || 0} LOC</span>
              </div>

              <div className="flex items-center space-x-1.5">
                <WasteBadge wasteMetrics={activeComponent.wasteMetrics} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
