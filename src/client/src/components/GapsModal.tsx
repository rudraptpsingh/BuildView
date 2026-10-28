import React from 'react';
import { X, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { ArchitectureComponent } from '../../shared/types.js';
import { SeverityBadge } from './ui/SeverityBadge.js';

interface GapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  components: ArchitectureComponent[];
  onSelectComponent: (componentId: string) => void;
}

export const GapsModal: React.FC<GapsModalProps> = ({
  isOpen,
  onClose,
  components,
  onSelectComponent,
}) => {
  if (!isOpen) return null;

  const allGaps = components.flatMap((c) =>
    c.gaps.map((g) => ({
      ...g,
      componentId: c.id,
      componentName: c.name,
    }))
  );

  const activeGaps = allGaps.filter((g) => !g.resolved);
  const resolvedGaps = allGaps.filter((g) => g.resolved);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-2xl neu-surface bg-[#eaeff4] dark:bg-[#14171f] p-6 shadow-2xl z-10 hairline-b animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3.5 hairline-b">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-mono">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                ARCHITECTURAL GAPS AUDIT ({activeGaps.length} UNRESOLVED)
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Active discrepancies between intended architecture contracts and code
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg neu-button text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 max-h-[60vh] overflow-y-auto space-y-5 pr-1">
          {/* Active Gaps */}
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
              UNRESOLVED GAPS ({activeGaps.length})
            </div>

            {activeGaps.length === 0 ? (
              <div className="p-5 rounded-lg neu-well text-center font-mono">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  ZERO UNRESOLVED GAPS
                </div>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  All component interfaces and edge cases are implemented cleanly.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeGaps.map((gap) => (
                  <div
                    key={gap.id}
                    className="p-3.5 rounded-lg neu-surface border-l-4 border-l-amber-600"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 font-mono">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          {gap.title}
                        </span>
                        <SeverityBadge severity={gap.severity} />
                      </div>

                      <button
                        onClick={() => {
                          onClose();
                          onSelectComponent(gap.componentId);
                        }}
                        className="flex items-center space-x-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        <span>{gap.componentName}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                      {gap.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resolved Gaps */}
          {resolvedGaps.length > 0 && (
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
                RESOLVED GAPS HISTORY ({resolvedGaps.length})
              </div>
              <div className="space-y-2">
                {resolvedGaps.map((gap) => (
                  <div
                    key={gap.id}
                    className="p-3 rounded-lg neu-well text-xs font-mono"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{gap.title}</span>
                      </div>
                      <span className="text-slate-400 text-[10px]">
                        {gap.componentName}
                      </span>
                    </div>
                    {gap.resolutionNote && (
                      <p className="text-slate-500 font-sans text-[11px] pl-4.5">
                        Fixed: {gap.resolutionNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
