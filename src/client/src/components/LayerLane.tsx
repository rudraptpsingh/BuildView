import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileCode, TestTube, AlertTriangle } from 'lucide-react';
import { ArchitectureLayer, ArchitectureComponent } from '@shared/types.js';
import { ComponentCard } from './ComponentCard.js';
import { ProgressBar } from './ui/ProgressBar.js';

interface LayerLaneProps {
  layer: ArchitectureLayer;
  components: ArchitectureComponent[];
  selectedComponentId?: string;
  onSelectComponent: (component: ArchitectureComponent) => void;
}

export const LayerLane: React.FC<LayerLaneProps> = ({
  layer,
  components,
  selectedComponentId,
  onSelectComponent,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Sort components strictly by priority (P1 first, then P2, P3...)
  const sortedComponents = [...components].sort((a, b) => a.priority - b.priority);

  // Compute aggregate progress of layer
  const layerProgress = sortedComponents.length > 0
    ? Math.round(sortedComponents.reduce((sum, c) => sum + c.progress, 0) / sortedComponents.length)
    : 0;

  const isComplete = sortedComponents.length > 0 && sortedComponents.every((c) => c.status === 'completed' && c.progress === 100);
  const totalFiles = sortedComponents.reduce((sum, c) => sum + c.files.length, 0);
  const totalTests = sortedComponents.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0);
  const activeGapsCount = sortedComponents.reduce((sum, c) => sum + c.gaps.filter((g) => !g.resolved).length, 0);

  return (
    <div className="rounded-xl p-4 neu-surface relative transition-all">
      {/* Layer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 hairline-b">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="action-btn p-1"
            title={isExpanded ? 'Collapse layer' : 'Expand layer'}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <div
            className="w-7 h-7 rounded flex items-center justify-center font-bold text-white shadow-xs font-mono text-xs"
            style={{ backgroundColor: layer.color || 'var(--signal-active)' }}
          >
            L{layer.order}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-[var(--text-primary)] font-mono">
                {layer.name}
              </h2>
              {isComplete ? (
                <span className="pill green">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>LAYER VERIFIED</span>
                </span>
              ) : activeGapsCount > 0 ? (
                <span className="pill amber font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{activeGapsCount} GAP{activeGapsCount > 1 ? 'S' : ''}</span>
                </span>
              ) : null}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">
              {layer.description}
            </p>
          </div>
        </div>

        {/* Telemetry Chips & Aggregate Layer Progress */}
        <div className="flex flex-wrap items-center gap-3 self-end sm:self-center font-mono text-xs">
          <div className="hidden md:flex items-center space-x-2 text-[11px] text-[var(--text-secondary)]">
            <span className="px-2 py-0.5 rounded neu-well font-bold">
              {sortedComponents.length} COMPS
            </span>
            <span className="px-2 py-0.5 rounded neu-well flex items-center space-x-1">
              <FileCode className="w-3 h-3" />
              <span>{totalFiles} FILES</span>
            </span>
            <span className="px-2 py-0.5 rounded neu-well flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
              <TestTube className="w-3 h-3" />
              <span>{totalTests} TESTS</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">
                LAYER
              </span>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {layerProgress}%
              </div>
            </div>
            <div className="w-24">
              <ProgressBar progress={layerProgress} status={isComplete ? 'completed' : 'in_progress'} size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Components in this Layer */}
      {isExpanded && (
        <>
          {sortedComponents.length === 0 ? (
            <div className="p-5 text-center rounded neu-well text-[var(--text-disabled)] text-xs font-mono">
              NO COMPONENTS ASSIGNED TO THIS LAYER
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {sortedComponents.map((component) => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  isSelected={component.id === selectedComponentId}
                  onSelect={onSelectComponent}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
