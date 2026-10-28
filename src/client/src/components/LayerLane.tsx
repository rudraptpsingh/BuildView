import React from 'react';
import { CheckCircle2 } from 'lucide-react';
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
  // Sort components strictly by priority (P1 first, then P2, P3...)
  const sortedComponents = [...components].sort((a, b) => a.priority - b.priority);

  // Compute aggregate progress of layer
  const layerProgress = sortedComponents.length > 0
    ? Math.round(sortedComponents.reduce((sum, c) => sum + c.progress, 0) / sortedComponents.length)
    : 0;

  const isComplete = sortedComponents.length > 0 && sortedComponents.every((c) => c.status === 'completed' && c.progress === 100);

  return (
    <div className="rounded-xl p-4 neu-surface relative transition-all">
      {/* Layer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 hairline-b">
        <div className="flex items-center space-x-3">
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
              {isComplete && (
                <span className="pill green">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>LAYER VERIFIED</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">
              {layer.description}
            </p>
          </div>
        </div>

        {/* Aggregate Layer Progress with Shared ProgressBar */}
        <div className="flex items-center space-x-3 self-end sm:self-center font-mono">
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

      {/* Grid of Components in this Layer */}
      {sortedComponents.length === 0 ? (
        <div className="p-5 text-center rounded neu-well text-[var(--text-disabled)] text-xs font-mono">
          NO COMPONENTS ASSIGNED TO THIS LAYER
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
    </div>
  );
};
