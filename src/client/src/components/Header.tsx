import React, { useState, useRef, useEffect } from 'react';
import {
  Moon,
  Sun,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Columns3,
  Network,
  Table2,
  ChevronDown,
  FolderGit2,
  Cpu,
  Layers,
  Camera,
  Search,
} from 'lucide-react';
import { BuildViewProject } from '@shared/types.js';

interface HeaderProps {
  project: BuildViewProject;
  isConnected: boolean;
  isDark: boolean;
  viewMode: 'lanes' | 'graph' | 'table';
  onToggleViewMode: (mode: 'lanes' | 'graph' | 'table') => void;
  onToggleTheme: () => void;
  activeProjectMode: 'demo' | 'dogfood' | 'custom';
  onSwitchProjectMode: (mode: 'demo' | 'dogfood' | 'custom') => void;
  onOpenScanModal: () => void;
  activeGapsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  isConnected,
  isDark,
  viewMode,
  onToggleViewMode,
  onToggleTheme,
  activeProjectMode,
  onSwitchProjectMode,
  onOpenScanModal,
  activeGapsCount,
}) => {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalComponents = project.components.length;
  const totalFiles = project.components.reduce((sum, c) => sum + c.files.length, 0);
  const totalTests = project.components.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0);

  const getProjectName = () => {
    if (activeProjectMode === 'dogfood') return 'BuildView Meta Architecture';
    if (activeProjectMode === 'demo') return 'DevPulse CLI Simulation';
    return project.name || 'Current Repository';
  };

  return (
    <header className="sticky top-0 z-30 px-4 py-2 neu-surface hairline-b backdrop-blur-md bg-[var(--surface-window)]/90">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        {/* Left: App Logo + Project Selector Dropdown */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="appmark font-mono shadow-xs">
            BV
          </div>

          {/* Project Switcher Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
              className="flex items-center space-x-2 px-2.5 py-1 rounded-lg hover:bg-[var(--surface-control)] transition-colors text-left"
              title="Switch repository or scan a new codebase"
            >
              <FolderGit2 className="w-3.5 h-3.5 text-blue-500" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[var(--text-primary)] font-mono flex items-center space-x-1">
                  <span>{getProjectName()}</span>
                  <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
                </span>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isProjectMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-80 rounded-xl neu-surface bg-[var(--surface-window)] p-2 shadow-2xl border border-[var(--border-default)] z-50 animate-in fade-in zoom-in-95">
                <div className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] hairline-b mb-1 flex items-center justify-between">
                  <span>REPOSITORIES & TARGETS</span>
                </div>

                {/* Scan Action */}
                <button
                  onClick={() => {
                    setIsProjectMenuOpen(false);
                    onOpenScanModal();
                  }}
                  className="w-full text-left p-2.5 mb-1 rounded-lg text-xs font-mono flex items-center space-x-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold transition-colors"
                >
                  <FolderGit2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex-1">
                    <div>Scan Local Repository...</div>
                    <div className="text-[10px] font-sans font-normal opacity-80">
                      Map any codebase AST, layers & waste dynamically
                    </div>
                  </div>
                </button>

                {/* Current Active Scanned Project */}
                <button
                  onClick={() => {
                    onSwitchProjectMode('custom');
                    setIsProjectMenuOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs font-mono flex items-start space-x-2.5 transition-colors ${
                    activeProjectMode === 'custom'
                      ? 'bg-[var(--surface-control)] text-blue-500 font-bold'
                      : 'hover:bg-[var(--surface-control)]/60 text-[var(--text-primary)]'
                  }`}
                >
                  <FolderGit2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold flex items-center justify-between">
                      <span className="truncate">{project.name}</span>
                      {activeProjectMode === 'custom' && <span className="text-[9px] text-emerald-500 pill green py-0 font-bold">LOADED</span>}
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-sans truncate">
                      {totalComponents} components · {totalFiles} files · {totalTests} tests
                    </p>
                  </div>
                </button>

                {/* BuildView Dogfood */}
                <button
                  onClick={() => {
                    onSwitchProjectMode('dogfood');
                    setIsProjectMenuOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs font-mono flex items-start space-x-2.5 transition-colors ${
                    activeProjectMode === 'dogfood'
                      ? 'bg-[var(--surface-control)] text-blue-500 font-bold'
                      : 'hover:bg-[var(--surface-control)]/60 text-[var(--text-primary)]'
                  }`}
                >
                  <Cpu className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center justify-between">
                      <span>BuildView Meta Architecture</span>
                      {activeProjectMode === 'dogfood' && <span className="text-[9px] text-blue-500 pill blue py-0 font-bold">ACTIVE</span>}
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-sans">
                      Self-building meta architecture & MCP tools
                    </p>
                  </div>
                </button>

                {/* DevPulse Demo */}
                <button
                  onClick={() => {
                    onSwitchProjectMode('demo');
                    setIsProjectMenuOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs font-mono flex items-start space-x-2.5 transition-colors ${
                    activeProjectMode === 'demo'
                      ? 'bg-[var(--surface-control)] text-blue-500 font-bold'
                      : 'hover:bg-[var(--surface-control)]/60 text-[var(--text-primary)]'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center justify-between">
                      <span>DevPulse CLI Simulation</span>
                      {activeProjectMode === 'demo' && <span className="text-[9px] text-amber-500 pill amber py-0 font-bold">ACTIVE</span>}
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-sans">
                      Interactive step-by-step agent build simulation
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Quick Metrics Chip */}
          <div className="hidden lg:flex items-center space-x-2 text-[11px] font-mono text-[var(--text-secondary)] px-2 py-0.5 rounded neu-well">
            <span>{totalComponents} comps</span>
            <span>•</span>
            <span>{totalFiles} files</span>
            <span>•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{totalTests} tests</span>
          </div>
        </div>

        {/* Center: Dribbble-Grade Segmented Navigation */}
        <div className="segmented-tabs font-mono text-xs">
          <button
            onClick={() => onToggleViewMode('graph')}
            className={`segmented-tab px-3 ${viewMode === 'graph' ? 'active' : ''}`}
            title="Interactive Circle & Edge DAG Architecture Graph"
          >
            <Network className="w-3.5 h-3.5 text-blue-500" />
            <span>DAG GRAPH</span>
          </button>

          <button
            onClick={() => onToggleViewMode('lanes')}
            className={`segmented-tab px-3 ${viewMode === 'lanes' ? 'active' : ''}`}
            title="Layer Swimlanes View"
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>SWIMLANES</span>
          </button>

          <button
            onClick={() => onToggleViewMode('table')}
            className={`segmented-tab px-3 ${viewMode === 'table' ? 'active' : ''}`}
            title="Architectural Gaps & Prune Table"
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>AUDIT & GAPS</span>
            {activeGapsCount > 0 && (
              <span className="pill amber text-[9px] py-0 px-1 font-bold animate-pulse">
                {activeGapsCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Uncluttered Action Icons & Live Connection */}
        <div className="flex items-center space-x-2.5 shrink-0">
          {/* Active Gaps Alert Pill if any */}
          {activeGapsCount > 0 && (
            <button
              onClick={() => onToggleViewMode('table')}
              className="pill amber font-bold text-[10px] cursor-pointer hover:opacity-90 transition-opacity"
              title="View unresolved architectural gaps"
            >
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span>{activeGapsCount} GAP{activeGapsCount > 1 ? 'S' : ''}</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="action-btn p-1.5 rounded-lg"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* SSE Live Connection Dot */}
          <div
            className="flex items-center space-x-1.5 px-2 py-1 rounded neu-well text-[11px] font-mono text-[var(--text-tertiary)]"
            title={isConnected ? 'Connected to live real-time event stream' : 'Operating in local cache mode'}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="hidden sm:inline font-bold text-[10px]">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
