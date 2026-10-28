import React from 'react';
import { Target, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface RoadmapBannerProps {
  nextFocus: {
    componentId: string;
    componentName: string;
    layerName?: string;
    priority: number;
    status: string;
    progress: number;
    gaps: any[];
  } | null;
  onSelectComponent: (componentId: string) => void;
}

export const RoadmapBanner: React.FC<RoadmapBannerProps> = ({ nextFocus, onSelectComponent }) => {
  if (!nextFocus) {
    return (
      <div className="mt-5 p-3.5 rounded-xl neu-surface border-l-4 border-l-emerald-600 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              ARCHITECTURE VERIFIED COMPLETE
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              All architectural layers and component contracts are 100% verified with zero unresolved gaps.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasGap = nextFocus.gaps && nextFocus.gaps.length > 0;

  return (
    <div className={`mt-5 p-3.5 rounded-xl neu-surface flex flex-col md:flex-row md:items-center justify-between gap-3 border-l-4 ${
      hasGap ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-blue-500'
    }`}>
      <div className="flex items-start md:items-center space-x-3">
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
          hasGap
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
        }`}>
          {hasGap ? <AlertTriangle className="w-4 h-4" /> : <Target className="w-4 h-4" />}
        </div>
        <div>
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="font-bold text-[var(--text-tertiary)]">NEXT AGENT FOCUS:</span>
            <span className="text-[var(--border-strong)]">•</span>
            <span className="text-[var(--text-primary)] font-semibold">{nextFocus.layerName || 'Current Layer'}</span>
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5 flex items-center gap-2">
            {hasGap ? (
              <span className="text-amber-600 dark:text-amber-400">
                Action Required: Resolve Architectural Gap on {nextFocus.componentName}
              </span>
            ) : (
              <span>
                Build Component: <span className="text-[var(--signal-active)] font-mono">{nextFocus.componentName}</span>
                <span className="ml-2 pill neutral font-mono">
                  P{nextFocus.priority}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3 shrink-0">
        <div className="text-right hidden sm:block font-mono text-xs">
          <div className="font-bold text-[var(--text-primary)]">
            {nextFocus.progress}%
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase">{nextFocus.status.replace('_', ' ')}</div>
        </div>
        <button
          onClick={() => onSelectComponent(nextFocus.componentId)}
          className="action-btn border border-[var(--border-default)] font-mono text-xs font-bold"
        >
          <span>INSPECT</span>
          <ArrowRight className="w-3 h-3 ml-0.5" />
        </button>
      </div>
    </div>
  );
};
