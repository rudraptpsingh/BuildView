import React from 'react';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import { SimulationStep } from '@server/demo-data.js';

interface SimulationControlsProps {
  currentStepIndex: number;
  totalSteps: number;
  currentStep: SimulationStep | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextStep: () => void;
  onReset: () => void;
  activeProjectMode: 'demo' | 'dogfood' | 'shotselect';
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  currentStepIndex,
  totalSteps,
  currentStep,
  isPlaying,
  onTogglePlay,
  onNextStep,
  onReset,
  activeProjectMode,
}) => {
  // Only render simulation playback controls when in CLI Pilot demo mode
  if (activeProjectMode !== 'demo') {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-6 z-40 max-w-md w-full animate-in fade-in slide-in-from-bottom-3">
      <div className="p-3 rounded-xl neu-surface hairline-t shadow-2xl backdrop-blur-md bg-[var(--surface-window)]/95 border border-[var(--border-strong)]">
        <div className="flex items-center justify-between gap-3 font-mono">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="pill blue font-bold text-[9px] py-0">
                CLI SIMULATION
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                STEP {currentStepIndex}/{totalSteps}
              </span>
            </div>
            <div className="text-xs font-bold text-[var(--text-primary)] truncate mt-1">
              {currentStep ? currentStep.title : 'Ready to begin simulation'}
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={onTogglePlay}
              className={`action-btn text-xs px-2.5 py-1 ${
                isPlaying ? 'text-amber-500 font-bold' : 'text-blue-500 font-bold'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
            </button>

            <button
              onClick={onNextStep}
              disabled={isPlaying || currentStepIndex >= totalSteps}
              className="action-btn p-1.5"
              title="Next simulation step"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onReset}
              className="action-btn p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              title="Reset simulation to beginning"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
