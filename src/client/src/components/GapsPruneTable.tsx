import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Trash2,
  Copy,
  Sparkles,
  Search,
  ArrowRight,
  Filter,
  CheckCircle2,
  FileCode,
  TestTube,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { BuildViewProject, ArchitectureComponent, GapItem, DuplicateCodeItem } from '@shared/types.js';
import { LAYER_ACCENTS } from '@shared/tokens.js';
import { SeverityBadge } from './ui/SeverityBadge.js';
import { StatusBadge } from './ui/StatusBadge.js';
import { TestBadge } from './ui/TestBadge.js';
import { WasteBadge } from './ui/WasteBadge.js';

interface GapsPruneTableProps {
  project: BuildViewProject;
  onSelectComponent: (componentId: string, initialTab?: string) => void;
}

type FilterCategory = 'all' | 'gaps' | 'prune' | 'duplicates' | 'clean';

export const GapsPruneTable: React.FC<GapsPruneTableProps> = ({
  project,
  onSelectComponent,
}) => {
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLayer, setSelectedLayer] = useState<string>('all');

  // Compute aggregate numbers
  const totalGaps = useMemo(() => {
    return project.components.reduce(
      (sum, c) => sum + c.gaps.filter((g) => !g.resolved).length,
      0
    );
  }, [project.components]);

  const totalPruneComps = useMemo(() => {
    return project.components.filter(
      (c) => c.wasteMetrics?.recommendation === 'prune'
    ).length;
  }, [project.components]);

  const totalDuplicateFunctions = useMemo(() => {
    return project.components.reduce(
      (sum, c) => sum + (c.wasteMetrics?.duplicateFunctions?.length || 0),
      0
    );
  }, [project.components]);

  const totalUnusedExports = useMemo(() => {
    return project.components.reduce(
      (sum, c) => sum + (c.wasteMetrics?.unusedExports?.length || 0),
      0
    );
  }, [project.components]);

  // Flatten items into actionable table rows
  interface TableRowItem {
    id: string;
    componentId: string;
    componentName: string;
    layerId: string;
    layerName: string;
    priority: number;
    kind: 'gap' | 'prune' | 'duplicate' | 'clean';
    title: string;
    description: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    wasteScore?: number;
    unusedCount?: number;
    duplicates?: DuplicateCodeItem[];
    testCount: number;
    testStatus: string;
    loc: number;
    filesCount: number;
    rawGap?: GapItem;
  }

  const tableItems = useMemo<TableRowItem[]>(() => {
    const items: TableRowItem[] = [];

    for (const comp of project.components) {
      const layer = project.layers.find((l) => l.id === comp.layerId);
      const layerName = layer ? layer.name.replace(/^Layer \d+:\s*/, '') : comp.layerId;
      const testCount = comp.testSummary?.totalTests || 0;
      const testStatus = comp.testSummary?.status || 'untested';
      const loc = comp.astMetrics?.linesOfCode || 0;
      const filesCount = comp.files.length;

      // 1. Gaps
      const activeGaps = comp.gaps.filter((g) => !g.resolved);
      for (const gap of activeGaps) {
        items.push({
          id: `gap-${gap.id}`,
          componentId: comp.id,
          componentName: comp.name,
          layerId: comp.layerId,
          layerName,
          priority: comp.priority,
          kind: 'gap',
          title: gap.title,
          description: gap.description,
          severity: gap.severity,
          testCount,
          testStatus,
          loc,
          filesCount,
          rawGap: gap,
        });
      }

      // 2. Prune recommendations
      if (comp.wasteMetrics) {
        const hasUnused = comp.wasteMetrics.unusedExports.length > 0;
        const hasDuplicates = comp.wasteMetrics.duplicateFunctions.length > 0;
        const isPrune = comp.wasteMetrics.recommendation === 'prune';

        if (isPrune || hasUnused) {
          items.push({
            id: `prune-${comp.id}`,
            componentId: comp.id,
            componentName: comp.name,
            layerId: comp.layerId,
            layerName,
            priority: comp.priority,
            kind: 'prune',
            title: `Unused Exports Prune Target (${comp.wasteMetrics.unusedExports.length} symbols)`,
            description: `Identified ${comp.wasteMetrics.unusedExports.length} exported functions or interfaces never imported across the repository. Prune to reduce bundle size and AST overhead.`,
            wasteScore: comp.wasteMetrics.cleanlinessScore,
            unusedCount: comp.wasteMetrics.unusedExports.length,
            testCount,
            testStatus,
            loc,
            filesCount,
          });
        }

        if (hasDuplicates) {
          items.push({
            id: `dup-${comp.id}`,
            componentId: comp.id,
            componentName: comp.name,
            layerId: comp.layerId,
            layerName,
            priority: comp.priority,
            kind: 'duplicate',
            title: `AST Duplicate Functions (${comp.wasteMetrics.duplicateFunctions.length} pairs)`,
            description: `Duplicate implementations found matching 90%+ AST token similarity: ${comp.wasteMetrics.duplicateFunctions
              .slice(0, 2)
              .map((d) => d.name)
              .join(', ')}.`,
            duplicates: comp.wasteMetrics.duplicateFunctions,
            wasteScore: comp.wasteMetrics.cleanlinessScore,
            testCount,
            testStatus,
            loc,
            filesCount,
          });
        }

        if (comp.wasteMetrics.recommendation === 'clean' && activeGaps.length === 0) {
          items.push({
            id: `clean-${comp.id}`,
            componentId: comp.id,
            componentName: comp.name,
            layerId: comp.layerId,
            layerName,
            priority: comp.priority,
            kind: 'clean',
            title: 'Verified Clean Component Contract',
            description: `Fully compliant with zero unused exports, zero duplicate functions, and verified test coverage.`,
            wasteScore: comp.wasteMetrics.cleanlinessScore,
            testCount,
            testStatus,
            loc,
            filesCount,
          });
        }
      }
    }

    return items;
  }, [project.components, project.layers]);

  // Filter items
  const filteredItems = useMemo(() => {
    return tableItems.filter((item) => {
      // Layer filter
      if (selectedLayer !== 'all' && item.layerId !== selectedLayer) {
        return false;
      }

      // Category filter
      if (filterCategory === 'gaps' && item.kind !== 'gap') return false;
      if (filterCategory === 'prune' && item.kind !== 'prune') return false;
      if (filterCategory === 'duplicates' && item.kind !== 'duplicate') return false;
      if (filterCategory === 'clean' && item.kind !== 'clean') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.componentName.toLowerCase().includes(q);
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesLayer = item.layerName.toLowerCase().includes(q);
        if (!matchesName && !matchesTitle && !matchesDesc && !matchesLayer) {
          return false;
        }
      }

      return true;
    });
  }, [tableItems, selectedLayer, filterCategory, searchQuery]);

  return (
    <div className="flex flex-col space-y-6">
      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Active Gaps */}
        <div
          onClick={() => setFilterCategory('gaps')}
          className={`cursor-pointer p-4 rounded-xl neu-surface transition-all ${
            filterCategory === 'gaps' ? 'ring-2 ring-amber-500 shadow-md' : 'hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] mb-1">
            <span className="uppercase font-semibold">Active Gaps</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            {totalGaps}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-1">
            {totalGaps > 0 ? 'Requires code fix / override' : 'All contracts satisfied'}
          </p>
        </div>

        {/* Card 2: Prune Targets */}
        <div
          onClick={() => setFilterCategory('prune')}
          className={`cursor-pointer p-4 rounded-xl neu-surface transition-all ${
            filterCategory === 'prune' ? 'ring-2 ring-red-500 shadow-md' : 'hover:border-red-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] mb-1">
            <span className="uppercase font-semibold">Prune Candidates</span>
            <Trash2 className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            {totalPruneComps}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-1">
            Components with dead code
          </p>
        </div>

        {/* Card 3: Duplicate Functions */}
        <div
          onClick={() => setFilterCategory('duplicates')}
          className={`cursor-pointer p-4 rounded-xl neu-surface transition-all ${
            filterCategory === 'duplicates' ? 'ring-2 ring-purple-500 shadow-md' : 'hover:border-purple-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] mb-1">
            <span className="uppercase font-semibold">AST Duplicates</span>
            <Copy className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            {totalDuplicateFunctions}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-1">
            Functions with 90%+ similarity
          </p>
        </div>

        {/* Card 4: Unused Exports */}
        <div
          onClick={() => setFilterCategory('prune')}
          className={`cursor-pointer p-4 rounded-xl neu-surface transition-all ${
            filterCategory === 'prune' ? 'ring-2 ring-blue-500 shadow-md' : 'hover:border-blue-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] mb-1">
            <span className="uppercase font-semibold">Unused Symbols</span>
            <Sparkles className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            {totalUnusedExports}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-1">
            Unreferenced exports detected
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl neu-surface hairline-b">
        {/* Category Segmented Tabs */}
        <div className="segmented-tabs font-mono text-xs">
          <button
            onClick={() => setFilterCategory('all')}
            className={`segmented-tab ${filterCategory === 'all' ? 'active' : ''}`}
          >
            ALL ({tableItems.length})
          </button>
          <button
            onClick={() => setFilterCategory('gaps')}
            className={`segmented-tab ${filterCategory === 'gaps' ? 'active' : ''}`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>GAPS ({totalGaps})</span>
          </button>
          <button
            onClick={() => setFilterCategory('prune')}
            className={`segmented-tab ${filterCategory === 'prune' ? 'active' : ''}`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            <span>PRUNE ({totalPruneComps})</span>
          </button>
          <button
            onClick={() => setFilterCategory('duplicates')}
            className={`segmented-tab ${filterCategory === 'duplicates' ? 'active' : ''}`}
          >
            <Copy className="w-3.5 h-3.5 text-purple-500" />
            <span>DUPLICATES ({totalDuplicateFunctions})</span>
          </button>
          <button
            onClick={() => setFilterCategory('clean')}
            className={`segmented-tab ${filterCategory === 'clean' ? 'active' : ''}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>CLEAN</span>
          </button>
        </div>

        {/* Right: Search & Layer Filter */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Layer Select */}
          <select
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value)}
            className="px-2.5 py-1 rounded neu-well text-[11px] bg-transparent text-[var(--text-primary)] border-none focus:outline-none"
          >
            <option value="all">ALL LAYERS</option>
            {project.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name.replace(/^Layer \d+:\s*/, '')}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search gaps, waste, functions..."
              className="pl-8 pr-3 py-1 text-xs rounded neu-well bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="rounded-xl neu-surface overflow-hidden border border-[var(--border-subtle)] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="hairline-b bg-[var(--surface-sunken)]/60 text-[11px] text-[var(--text-tertiary)] uppercase font-semibold">
                <th className="py-3 px-4 w-52">Component</th>
                <th className="py-3 px-3 w-40">Category</th>
                <th className="py-3 px-4">Issue Description & Contract</th>
                <th className="py-3 px-3 w-32">Health / Waste</th>
                <th className="py-3 px-3 w-36">Tests & Code</th>
                <th className="py-3 px-3 text-right w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[var(--text-tertiary)]">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 opacity-80" />
                    <p className="font-bold text-[var(--text-primary)]">NO MATCHING ITEMS</p>
                    <p className="text-[11px] mt-0.5">Change search criteria or filters to view other components.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const accent = LAYER_ACCENTS[item.layerId] || LAYER_ACCENTS.default;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[var(--surface-raised)]/80 transition-colors group"
                    >
                      {/* Component & Layer */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center space-x-1.5 mb-0.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: accent.bar }}
                          />
                          <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] truncate">
                            {item.layerName}
                          </span>
                          <span className="pill neutral text-[9px] px-1 py-0 font-bold shrink-0">
                            P{item.priority}
                          </span>
                        </div>
                        <div
                          onClick={() => onSelectComponent(item.componentId)}
                          className="font-bold text-xs text-[var(--text-primary)] hover:text-blue-500 cursor-pointer transition-colors leading-tight line-clamp-1"
                        >
                          {item.componentName}
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-3 align-top">
                        {item.kind === 'gap' ? (
                          <div className="flex flex-col space-y-1">
                            <span className="pill amber font-bold text-[10px] w-fit">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              <span>ARCH GAP</span>
                            </span>
                            {item.severity && <SeverityBadge severity={item.severity} />}
                          </div>
                        ) : item.kind === 'prune' ? (
                          <span className="pill amber text-[10px] font-bold w-fit">
                            <Trash2 className="w-3 h-3 text-red-500" />
                            <span>PRUNE DEAD CODE</span>
                          </span>
                        ) : item.kind === 'duplicate' ? (
                          <span className="pill purple text-[10px] font-bold w-fit">
                            <Copy className="w-3 h-3 text-purple-500" />
                            <span>DUPLICATE AST</span>
                          </span>
                        ) : (
                          <span className="pill green text-[10px] font-bold w-fit">
                            <Sparkles className="w-3 h-3 text-emerald-500" />
                            <span>VERIFIED CLEAN</span>
                          </span>
                        )}
                      </td>

                      {/* Issue Description */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-xs text-[var(--text-primary)] mb-0.5">
                          {item.title}
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
                          {item.description}
                        </p>

                        {/* Duplicates Sub-list */}
                        {item.duplicates && item.duplicates.length > 0 && (
                          <div className="mt-2 space-y-1 text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] p-2 rounded">
                            {item.duplicates.slice(0, 2).map((dup, idx) => (
                              <div key={idx} className="flex items-center justify-between">
                                <span className="font-bold text-purple-600 dark:text-purple-400 truncate">
                                  {dup.name}()
                                </span>
                                <span className="shrink-0 text-emerald-600 dark:text-emerald-400 font-bold ml-2">
                                  {Math.round(dup.similarity * 100)}% Match
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Health / Cleanliness Score */}
                      <td className="py-3 px-3 align-top font-mono">
                        {item.wasteScore !== undefined ? (
                          <div>
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-[var(--text-tertiary)]">SCORE</span>
                              <span className="font-bold text-[var(--text-primary)]">
                                {item.wasteScore}%
                              </span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-[var(--surface-window)] overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  item.wasteScore >= 80
                                    ? 'bg-emerald-500'
                                    : item.wasteScore >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${item.wasteScore}%` }}
                              />
                            </div>
                            {item.unusedCount !== undefined && item.unusedCount > 0 && (
                              <div className="text-[9px] text-[var(--text-tertiary)] mt-1">
                                {item.unusedCount} dead exports
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-[var(--text-tertiary)]">
                            GAP BLOCKED
                          </div>
                        )}
                      </td>

                      {/* Tests & Files */}
                      <td className="py-3 px-3 align-top font-mono text-[11px]">
                        <div className="flex items-center space-x-1.5 text-[var(--text-primary)] font-bold mb-1">
                          <TestTube className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>{item.testCount} tests</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {item.filesCount} files · {item.loc.toLocaleString()} LOC
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-3 align-top text-right">
                        <button
                          onClick={() => {
                            const tab = item.kind === 'gap' ? 'gaps' : item.kind === 'clean' ? 'anatomy' : 'waste';
                            onSelectComponent(item.componentId, tab);
                          }}
                          className="action-btn text-[10px] px-2 py-1 font-mono font-bold hover:border-blue-500 hover:text-blue-500 inline-flex items-center space-x-1"
                        >
                          <span>INSPECT</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
