import React, { useState } from 'react';
import {
  FileCode,
  ChevronRight,
  Code2,
  Box,
  Layers as LayersIcon,
  FilePlus,
  FileEdit,
} from 'lucide-react';
import { ArchitectureComponent } from '../../shared/types.js';
import { StatusBadge } from './ui/StatusBadge.js';
import { ProgressBar } from './ui/ProgressBar.js';

interface ComponentCardProps {
  component: ArchitectureComponent;
  onSelect: (component: ArchitectureComponent) => void;
  isSelected?: boolean;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({ component, onSelect, isSelected }) => {
  const [showFileTooltip, setShowFileTooltip] = useState(false);

  const activeGaps = component.gaps.filter((g) => !g.resolved);
  const hasGaps = activeGaps.length > 0;
  const effectiveStatus = hasGaps ? 'gap_detected' : component.status;

  return (
    <div
      onClick={() => onSelect(component)}
      className={`relative group cursor-pointer rounded-xl p-4 neu-card transition-all ${
        isSelected
          ? 'ring-2 ring-blue-600 dark:ring-blue-500 -translate-y-1'
          : hasGaps
          ? 'border-l-4 border-l-amber-600'
          : component.status === 'completed'
          ? 'border-l-4 border-l-emerald-600'
          : 'border-l-4 border-l-slate-400'
      }`}
    >
      {/* Top Header: Priority badge & Single Source Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center space-x-2 font-mono">
          <span className="px-1.5 py-0.5 rounded neu-well text-xs font-bold text-slate-800 dark:text-slate-200">
            P{component.priority}
          </span>
          <span className="text-[11px] text-slate-400 font-semibold truncate max-w-[120px]">
            {component.id}
          </span>
        </div>
        <StatusBadge status={effectiveStatus} gapCount={activeGaps.length} />
      </div>

      {/* Component Title & Description */}
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {component.name}
      </h3>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
        {component.description}
      </p>

      {/* Progress Track with Shared Token Bar */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between text-xs mb-1 font-mono">
          <span className="text-slate-500 text-[10px] uppercase font-bold">PROGRESS</span>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {component.progress}%
          </span>
        </div>
        <ProgressBar progress={component.progress} status={effectiveStatus} hasGaps={hasGaps} size="sm" />
      </div>

      {/* Anatomy Summary Chips (Members, Methods, Callers) */}
      <div className="mt-3 pt-2.5 hairline-t flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="px-1.5 py-0.5 rounded neu-well text-slate-600 dark:text-slate-400 flex items-center space-x-1">
          <Box className="w-2.5 h-2.5" />
          <span>{component.anatomy.members?.length || 0} fields</span>
        </span>
        <span className="px-1.5 py-0.5 rounded neu-well text-slate-600 dark:text-slate-400 flex items-center space-x-1">
          <Code2 className="w-2.5 h-2.5" />
          <span>{component.anatomy.functions?.length || 0} fns</span>
        </span>
        <span className="px-1.5 py-0.5 rounded neu-well text-slate-600 dark:text-slate-400 flex items-center space-x-1">
          <LayersIcon className="w-2.5 h-2.5" />
          <span>{component.anatomy.callers?.length || 0} callers</span>
        </span>
      </div>

      {/* Files Modified Hover Tracker */}
      <div
        className="relative mt-2.5 pt-2 hairline-t flex items-center justify-between text-xs text-slate-500 font-mono"
        onMouseEnter={() => setShowFileTooltip(true)}
        onMouseLeave={() => setShowFileTooltip(false)}
      >
        <div className="flex items-center space-x-1 hover:text-blue-600 transition-colors">
          <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="text-[11px] font-bold">
            {component.files.length} FILE{component.files.length === 1 ? '' : 'S'}
          </span>
        </div>

        <span className="flex items-center text-[10px] font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">
          INSPECT <ChevronRight className="w-3 h-3 ml-0.5" />
        </span>

        {/* Hover Tooltip Popup showing files modified */}
        {showFileTooltip && component.files.length > 0 && (
          <div className="absolute left-0 bottom-full mb-2 w-72 z-50 p-2.5 rounded-lg neu-surface bg-white dark:bg-slate-900 shadow-xl hairline-b font-mono text-xs pointer-events-none">
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between text-[11px]">
              <span>MODIFIED FILES</span>
              <span className="text-slate-400">{component.files.length} total</span>
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {component.files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-1 rounded neu-well text-[10px]">
                  <div className="flex items-center space-x-1 truncate">
                    {file.status === 'created' ? (
                      <FilePlus className="w-3 h-3 text-emerald-600 shrink-0" />
                    ) : (
                      <FileEdit className="w-3 h-3 text-blue-600 shrink-0" />
                    )}
                    <span className="truncate text-slate-800 dark:text-slate-200" title={file.path}>
                      {file.path.split('/').pop()}
                    </span>
                  </div>
                  {file.linesChanged !== undefined && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold shrink-0">
                      +{file.linesChanged}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
