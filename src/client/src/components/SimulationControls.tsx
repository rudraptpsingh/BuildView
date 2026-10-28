import React from 'react';
import { Play, Pause, SkipForward, RotateCcw, Cpu, Layers } from 'lucide-react';
import { SimulationStep } from '@server/demo-data.js';

interface SimulationControlsProps {
  currentStepIndex: number;
  totalSteps: number;
  currentStep: SimulationStep | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextStep: () => void;
  onReset: () => void;
  activeProjectMode: 'demo' | 'dogfood';
  onSwitchMode: (mode: 'demo' | 'dogfood') => void;
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
  onSwitchMode,
}) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-4xl">
      <div className="p-2.5 rounded-xl neu-surface hairline-t shadow-2xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Segmented Tabs (from AgentMonitor kit) */}
          <div className="flex items-center space-x-2 font-mono">
            <div className="segmented-tabs">
              <button
                onClick={() => onSwitchMode('dogfood')}
                className={`segmented-tab ${activeProjectMode === 'dogfood' ? 'active' : ''}`}
              >
                <Cpu className="w-3 h-3" />
                <span>BUILDVIEW DOGFOOD</span>
              </button>
              <button
                onClick={() => onSwitchMode('demo')}
                className={`segmented-tab ${activeProjectMode === 'demo' ? 'active' : ''}`}
              >
                <Layers className="w-3 h-3" />
                <span>CLI PILOT DEMO</span>
              </button>
            </div>

            {activeProjectMode === 'demo' && (
              <span className="pill neutral font-bold">
                PHASE {currentStepIndex}/{totalSteps}
              </span>
            )}
          </div>

          {/* Center: Phase description */}
          {activeProjectMode === 'demo' && currentStep && (
            <div className="flex-1 min-w-0 px-2 font-mono">
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="pill blue text-[9px] py-0">
                  EXEC
                </span>
                <span className="font-bold text-[var(--text-primary)] truncate text-[11px]">
                  {currentStep.title}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] truncate font-sans mt-0.5">
                {currentStep.description}
              </p>
            </div>
          )}

          {/* Right: Action Group */}
          {activeProjectMode === 'demo' ? (
            <div className="action-group font-mono">
              <button
                onClick={onTogglePlay}
                className={`action-btn ${isPlaying ? 'active text-amber-500' : 'text-blue-500'}`}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>

              <button
                onClick={onNextStep}
                disabled={currentStepIndex >= totalSteps}
                className="action-btn"
                title="Next phase"
              >
                <span>STEP</span>
                <SkipForward className="w-3 h-3" />
              </button>

              <button
                onClick={onReset}
                className="action-btn"
                title="Reset simulation"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs font-mono pill green">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>DOGFOOD ARCHITECTURE ACTIVE</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
