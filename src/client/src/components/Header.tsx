import React from 'react';
import { Moon, Sun, AlertTriangle, RotateCcw, CheckCircle2, Columns3, Network } from 'lucide-react';
import { BuildViewProject } from '@shared/types.js';

interface HeaderProps {
  project: BuildViewProject;
  isConnected: boolean;
  isDark: boolean;
  viewMode: 'lanes' | 'graph';
  onToggleViewMode: (mode: 'lanes' | 'graph') => void;
  onToggleTheme: () => void;
  onReset: (mode: 'demo' | 'clean') => void;
  onOpenGaps: () => void;
  activeGapsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  isConnected,
  isDark,
  viewMode,
  onToggleViewMode,
  onToggleTheme,
  onReset,
  onOpenGaps,
  activeGapsCount,
}) => {
  const totalComponents = project.components.length;
  const completedComponents = project.components.filter((c) => c.status === 'completed' && c.progress === 100).length;
  const overallProgress = totalComponents > 0
    ? Math.round(project.components.reduce((sum, c) => sum + c.progress, 0) / totalComponents)
    : 0;

  return (
    <header className="sticky top-0 z-30 px-5 py-2.5 neu-surface hairline-b backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Branding & Appmark */}
        <div className="flex items-center space-x-3">
          <div className="appmark font-mono">
            BV
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] font-mono">
                BUILDVIEW
              </span>
              <span className="pill blue">
                MCP://PROTOCOL
              </span>
              <span className="text-[var(--border-strong)]">/</span>
              <h1 className="text-xs font-semibold text-[var(--text-primary)]">
                {project.name}
              </h1>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] font-mono mt-0.5">
              {project.description}
            </p>
          </div>
        </div>

        {/* Center: View Switcher (Lanes vs Minimal Graph) */}
        <div className="segmented-tabs font-mono text-xs">
          <button
            onClick={() => onToggleViewMode('lanes')}
            className={`segmented-tab ${viewMode === 'lanes' ? 'active' : ''}`}
            title="Layer Swimlanes View"
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>LANES</span>
          </button>
          <button
            onClick={() => onToggleViewMode('graph')}
            className={`segmented-tab ${viewMode === 'graph' ? 'active' : ''}`}
            title="Minimal DAG Graph View"
          >
            <Network className="w-3.5 h-3.5" />
            <span>DAG GRAPH</span>
          </button>
        </div>

        {/* Right: Technical Telemetry & Reusable Action Groups */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Connection Status Pill */}
          <span className={`pill ${isConnected ? 'green' : 'amber'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span>{isConnected ? 'LIVE SSE' : 'LOCAL CACHE'}</span>
          </span>

          {/* System Progress Telemetry */}
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded neu-well text-[11px] font-mono">
            <span className="text-[var(--text-tertiary)]">EXEC</span>
            <span className="font-bold text-[var(--text-primary)]">{overallProgress}%</span>
            <span className="text-[var(--text-tertiary)]">({completedComponents}/{totalComponents})</span>
            <div className="w-12 h-1 rounded-full bg-[var(--surface-window)] overflow-hidden">
              <div
                className="h-full bg-[var(--signal-active)] rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Gaps Indicator Pill */}
          {activeGapsCount > 0 ? (
            <button
              onClick={onOpenGaps}
              className="pill danger font-bold hover:opacity-85 transition-opacity cursor-pointer"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{activeGapsCount} GAP{activeGapsCount > 1 ? 'S' : ''}</span>
            </button>
          ) : (
            <span className="pill green hidden sm:inline-flex">
              <CheckCircle2 className="w-3 h-3" />
              <span>0 GAPS</span>
            </span>
          )}

          {/* Action Group (AgentMonitor style) */}
          <div className="action-group">
            <button
              onClick={() => onReset('demo')}
              className="action-btn"
              title="Reset to CLI demo baseline"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">RESET</span>
            </button>

            <button
              onClick={onToggleTheme}
              className="action-btn"
              title={isDark ? 'Switch to Light' : 'Switch to Dark'}
            >
              {isDark ? <Sun className="w-3 h-3 text-amber-400" /> : <Moon className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
