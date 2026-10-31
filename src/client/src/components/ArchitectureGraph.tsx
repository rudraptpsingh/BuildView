import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, CheckCircle2, AlertTriangle, TestTube, Trash2, Plus, Minus } from 'lucide-react';
import { BuildViewProject, ArchitectureComponent } from '@shared/types.js';
import { LAYER_ACCENTS } from '@shared/tokens.js';
import dagre from '@dagrejs/dagre';

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
  const [layoutMode, setLayoutMode] = useState<'columns' | 'dagre'>('columns');

  // Canvas Pan & Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const previousZoom = useRef(1);
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

  // Automated Hierarchical DAG Layout using Dagre (Sugiyama Algorithm)
  const dagreLayout = useMemo(() => {
    if (layoutMode !== 'dagre') return null;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 160, align: 'UL' });
    g.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = isCompact ? 220 : 260;
    const nodeHeight = isCompact ? 60 : 70;

    for (const comp of filteredComponents) {
      g.setNode(comp.id, { width: nodeWidth, height: nodeHeight });
    }

    for (const edge of edges) {
      if (
        filteredComponents.some((c) => c.id === edge.source) &&
        filteredComponents.some((c) => c.id === edge.target)
      ) {
        g.setEdge(edge.source, edge.target);
      }
    }

    dagre.layout(g);

    let maxX = 600;
    let maxY = 320;
    const posMap = new Map<string, { x: number; y: number }>();

    for (const id of g.nodes()) {
      const node = g.node(id);
      if (node) {
        posMap.set(id, { x: node.x, y: node.y });
        if (node.x + nodeWidth + 120 > maxX) maxX = node.x + nodeWidth + 120;
        if (node.y + nodeHeight + 120 > maxY) maxY = node.y + nodeHeight + 120;
      }
    }

    return { posMap, width: maxX, height: maxY };
  }, [filteredComponents, edges, layoutMode, isCompact]);

  const displayedLayers = visibleLayers.filter(layer => selectedLayerFilter === 'all' || layer.id === selectedLayerFilter);
  const boardWidth = layoutMode === 'columns'
    ? Math.max(368, displayedLayers.length * 320 + Math.max(0, displayedLayers.length - 1) * 16 + 48)
    : (dagreLayout?.width || 600) + 48;
  const boardHeight = layoutMode === 'columns'
    ? Math.max(280, ...displayedLayers.map(layer => 112 + filteredComponents.filter(c => c.layerId === layer.id).length * (isCompact ? 84 : 96)))
    : (dagreLayout?.height || 320) + 48;

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

  }, [project.components, zoom]);

  useEffect(() => {
    updateNodePositions();
    const timer = setTimeout(updateNodePositions, 80);
    window.addEventListener('resize', updateNodePositions);
    return () => {
      window.removeEventListener('resize', updateNodePositions);
      clearTimeout(timer);
    };
  }, [filteredComponents, isCompact, layoutMode, updateNodePositions]);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-interactive="true"]')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: containerRef.current?.scrollLeft || 0,
      startPanY: containerRef.current?.scrollTop || 0,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    containerRef.current?.scrollTo(dragStartRef.current.startPanX - dx, dragStartRef.current.startPanY - dy);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, +(z - 0.15).toFixed(2)));
  const handleResetView = () => {
    setZoom(1.0);
    containerRef.current?.scrollTo(0, 0);
  };

  const handleFit = () => {
    const viewport = containerRef.current;
    if (!viewport) return;
    setZoom(Math.max(0.25, Math.min(1, (viewport.clientWidth - 24) / boardWidth, (viewport.clientHeight - 24) / boardHeight)));
    viewport.scrollTo(0, 0);
  };
  useEffect(() => {
    const viewport = containerRef.current;
    if (viewport && previousZoom.current !== zoom) {
      const ratio = zoom / previousZoom.current;
      viewport.scrollLeft = (viewport.scrollLeft + viewport.clientWidth / 2) * ratio - viewport.clientWidth / 2;
      viewport.scrollTop = (viewport.scrollTop + viewport.clientHeight / 2) * ratio - viewport.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);

  // Reusable Circle Node Renderer (used in both Columns and Dagre layout modes)
  const renderNode = (comp: ArchitectureComponent, customStyle?: React.CSSProperties) => {
    const activeGaps = comp.gaps.filter((g) => !g.resolved);
    const effectiveStatus = activeGaps.length > 0 ? 'gap_detected' : comp.status;
    const isSelected = selectedComponentId === comp.id;
    const isHovered = hoveredNodeId === comp.id;
    const isTestHarness = comp.layerId === 'layer_4_tests' || comp.layerId === 'layer_verification';
    const accent = LAYER_ACCENTS[comp.layerId] || LAYER_ACCENTS.default;

    let isCaller = false;
    let isCallee = false;
    let nodeOpacity = 1;

    if (relationMap && !isHovered && !isSelected) {
      if (relationMap.callers.has(comp.id)) {
        isCaller = true;
      } else if (relationMap.callees.has(comp.id)) {
        isCallee = true;
      } else {
        nodeOpacity = edgeMode === 'focused' ? 0.72 : 1;
      }
    }

    // Dynamic circle accent border
    let circleBorder = accent.bar;
    if (isCaller) circleBorder = '#10b981';
    else if (isCallee) circleBorder = '#3b82f6';
    else if (effectiveStatus === 'gap_detected') circleBorder = '#f59e0b';
    else if (comp.status === 'completed') circleBorder = '#10b981';

    const circleSize = 'w-7 h-7';

    return (
      <button
        type="button"
        aria-label={`Inspect ${comp.name}`}
        key={comp.id}
        data-interactive="true"
        onClick={() => onSelectComponent(comp.id)}
        onMouseEnter={() => setHoveredNodeId(comp.id)}
        onMouseLeave={() => setHoveredNodeId(null)}
        style={{ opacity: nodeOpacity, ...customStyle }}
        className={`group relative w-full text-left flex items-start gap-2.5 ${isCompact ? 'p-2' : 'p-3'} rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] transition-colors ${
          isSelected
            ? 'ring-2 ring-blue-500'
            : isHovered
            ? 'border-blue-400'
            : 'hover:border-blue-400'
        }`}
      >
        {/* Circle Node Glyph */}
        <div
          data-circle-node={comp.id}
          className={`relative shrink-0 rounded-md flex items-center justify-center font-mono font-bold transition-all duration-200 ${circleSize} ${
            isHovered || isSelected ? '' : ''
          }`}
          style={{
            backgroundColor: 'var(--surface-raised)',
            border: `1px solid ${circleBorder}`,
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
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs"
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
            <span className="font-semibold text-sm leading-5 text-[var(--text-primary)] line-clamp-2 group-hover:text-blue-600 transition-colors">
              {comp.name}
            </span>
            {isCaller && (
              <span className="pill green text-[8px] font-mono px-1 py-0 font-bold shrink-0">
                Depends on this
              </span>
            )}
            {isCallee && (
              <span className="pill blue text-[8px] font-mono px-1 py-0 font-bold shrink-0">
                Required first
              </span>
            )}
          </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] mt-1">
              <span>{effectiveStatus === 'gap_detected' ? `${activeGaps.length} open gaps` : comp.status.replace('_', ' ')}</span>
              {comp.planning?.acceptanceTests?.length ? <span>· {comp.planning.acceptanceTests.length} planned checks</span> : null}
              {comp.status === 'in_progress' ? <span>· {comp.progress}%</span> : null}
            </div>
          </div>
        </button>
      );
    };

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <div className="shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-3">
        <div className="relative flex-1 min-w-44 max-w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input aria-label="Search components" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search components…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-[var(--border-default)] bg-transparent" />
        </div>
        <select aria-label="Filter layers" value={selectedLayerFilter} onChange={e=>setSelectedLayerFilter(e.target.value)} className="max-w-64 rounded-md border border-[var(--border-default)] bg-transparent p-2 text-sm">
          <option value="all">All layers</option>
          {project.layers.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select aria-label="Filter status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-md border border-[var(--border-default)] bg-transparent p-2 text-sm">
          <option value="all">All statuses</option><option value="in_progress">In progress</option><option value="gap_detected">Open gaps</option><option value="prune">Prune candidates</option>
        </select>
        <div className="segmented-tabs text-xs">
          <button aria-pressed={layoutMode==='columns'} onClick={()=>{setLayoutMode('columns');containerRef.current?.scrollTo(0,0);}} className={`segmented-tab ${layoutMode==='columns'?'active':''}`}>Layers</button>
          <button aria-pressed={layoutMode==='dagre'} onClick={()=>{setLayoutMode('dagre');containerRef.current?.scrollTo(0,0);}} className={`segmented-tab ${layoutMode==='dagre'?'active':''}`}>Graph</button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={handleZoomOut} className="action-btn" aria-label="Zoom out"><Minus className="w-4 h-4" /></button>
          <button onClick={handleResetView} className="action-btn text-xs min-w-12" aria-label="Reset zoom">{Math.round(zoom*100)}%</button>
          <button onClick={handleZoomIn} className="action-btn" aria-label="Zoom in"><Plus className="w-4 h-4" /></button>
          <button onClick={handleFit} className="action-btn text-xs">Fit</button>
          <details className="relative">
            <summary className="action-btn text-xs cursor-pointer">Options</summary>
            <div className="absolute right-0 top-full z-40 min-w-52 p-3 space-y-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-lg">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edgeMode==='all'} onChange={e=>setEdgeMode(e.target.checked?'all':'focused')} />All connections</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isCompact} onChange={e=>setIsCompact(e.target.checked)} />Compact rows</label>
            </div>
          </details>
        </div>
      </div>

      {/* Main Interactive Graph Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        role="region"
        aria-label="Architecture workflow"
        tabIndex={0}
        className={`relative w-full flex-1 min-h-0 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-window)] ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{scrollbarGutter:'stable'}}
      >
        <div data-testid="workflow-scroll-bounds" style={{width:boardWidth*zoom,height:boardHeight*zoom,position:'relative'}}>
        <div
          ref={contentRef}
          style={{transform:`scale(${zoom})`,transformOrigin:'top left',width:boardWidth,height:boardHeight,position:'absolute',top:0,left:0}}
          className="p-6"
        >
          {/* Dynamic SVG Directed Edges Layer */}
          <svg
            className="absolute left-0 top-0 pointer-events-none z-0"
            style={{
              width: `${boardWidth}px`,
              height: `${boardHeight}px`,
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
              if (edgeMode === 'focused' && (!isFocusActive || !isRelevant)) {
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

          {/* Layout Mode Rendering: Columns vs Dagre DAG */}
          {layoutMode === 'columns' ? (
            /* Dedicated Layer Track Columns (Dynamic 4 or 5 columns) */
            <div
              className="relative z-10 grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${displayedLayers.length}, 320px)`,
                alignItems: 'start',
              }}
            >
              {displayedLayers.map((layer) => {
                const compsInLayer = filteredComponents.filter((c) => c.layerId === layer.id);

                return (
                  <div
                    key={layer.id}
                    className="min-w-0 flex flex-col gap-3"
                  >
                    {/* Minimal Column Header */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
                      <div className="flex items-center space-x-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                            {layer.name.replace(/^Layer \d+:\s*/, '')}
                          </h3>

                        </div>
                      </div>
                      <span className="pill neutral text-[10px] font-mono shrink-0">
                        {compsInLayer.length}
                      </span>
                    </div>

                    {/* Circle Nodes Rail */}
                    <div className="flex flex-col gap-3">
                      {compsInLayer.map((comp) => renderNode(comp))}

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
          ) : (
            /* Hierarchical Sugiyama DAG Layout (Dagre Open Source Engine) */
            <div
              className="relative z-10"
              style={{
                width: `${dagreLayout?.width || 1400}px`,
                height: `${dagreLayout?.height || 850}px`,
                minHeight: '280px',
              }}
            >
              {filteredComponents.map((comp) => {
                const pos = dagreLayout?.posMap.get(comp.id);
                const nodeWidth = isCompact ? 220 : 260;
                const nodeHeight = isCompact ? 60 : 70;
                if (!pos) return null;

                return renderNode(comp, {
                  position: 'absolute',
                  left: `${pos.x - nodeWidth / 2}px`,
                  top: `${pos.y - nodeHeight / 2}px`,
                  width: `${nodeWidth}px`,
                });
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
