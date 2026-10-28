import React, { useState } from 'react';
import { Target, ArrowRight, AlertTriangle, CheckCircle2, X } from 'lucide-react';

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
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  if (isDismissed || !nextFocus) return null;

  const hasGap = nextFocus.gaps && nextFocus.gaps.length > 0;

  return (
    <div className={`py-2 px-3.5 rounded-lg neu-surface flex items-center justify-between gap-3 text-xs font-mono border-l-4 transition-all ${
      hasGap ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-blue-500 bg-blue-500/5'
    }`}>
      <div className="flex items-center space-x-2.5 min-w-0">
        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
          hasGap
            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
        }`}>
          {hasGap ? <AlertTriangle className="w-3 h-3" /> : <Target className="w-3 h-3" />}
        </div>

        <div className="flex items-center space-x-2 truncate">
          <span className="font-bold text-[10px] text-[var(--text-tertiary)] uppercase shrink-0">
            NEXT FOCUS:
          </span>
          <span className="font-bold text-[var(--text-primary)] truncate">
            {nextFocus.componentName}
          </span>
          <span className="pill neutral text-[9px] py-0 shrink-0">
            P{nextFocus.priority}
          </span>
          {hasGap && (
            <span className="pill amber text-[9px] py-0 font-bold shrink-0">
              GAP BLOCKED
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        <button
          onClick={() => onSelectComponent(nextFocus.componentId)}
          className="action-btn text-[10px] py-0.5 px-2 hover:text-blue-500 flex items-center space-x-1"
        >
          <span>INSPECT</span>
          <ArrowRight className="w-2.5 h-2.5" />
        </button>

        <button
          onClick={() => setIsDismissed(true)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded"
          title="Dismiss notification"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
