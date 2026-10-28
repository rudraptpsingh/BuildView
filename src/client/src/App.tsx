import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { BuildViewProject, ArchitectureComponent } from '@shared/types.js';
import { getCliDemoProject, getCliDemoSteps, SimulationStep } from '@server/demo-data.js';
import { getDogfoodProject } from '@server/dogfood-data.js';
import { Header } from './components/Header.js';
import { RoadmapBanner } from './components/RoadmapBanner.js';
import { LayerLane } from './components/LayerLane.js';
import { ComponentDrawer } from './components/ComponentDrawer.js';
import { SimulationControls } from './components/SimulationControls.js';
import { GapsModal } from './components/GapsModal.js';

export const App: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<'dogfood' | 'demo'>('dogfood');
  const [project, setProject] = useState<BuildViewProject>(() => getDogfoodProject());
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [isGapsModalOpen, setIsGapsModalOpen] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Simulation state for CLI Demo
  const [simStepIndex, setSimStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const demoSteps = useRef<SimulationStep[]>(getCliDemoSteps()).current;

  // Sync dark class on document element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Connect to SSE stream for real-time updates from MCP / API
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      es.onopen = () => {
        setIsConnected(true);
      };
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.project) {
            setProject(data.project);
          }
        } catch (e) {
          console.warn('SSE parse error', e);
        }
      };
      es.onerror = () => {
        setIsConnected(false);
      };
    } catch (e) {
      setIsConnected(false);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Switch between Dogfood and Demo projects
  const handleSwitchMode = (mode: 'dogfood' | 'demo') => {
    setActiveMode(mode);
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);

    if (mode === 'dogfood') {
      setProject(getDogfoodProject());
      setSimStepIndex(0);
    } else {
      setProject(getCliDemoProject());
      setSimStepIndex(0);
    }
  };

  // Advance single simulation step in Demo mode
  const handleNextStep = useCallback(() => {
    if (simStepIndex >= demoSteps.length) return;

    const nextIdx = simStepIndex + 1;
    const step = demoSteps[nextIdx - 1];

    setProject((prev) => {
      const nextComponents = prev.components.map((c) => ({ ...c }));
      const target = nextComponents.find((c) => c.id === step.action.componentId);

      if (target) {
        if (step.action.type === 'progress') {
          if (step.action.progress !== undefined) target.progress = step.action.progress;
          if (step.action.status) target.status = step.action.status;
          if (step.action.files) {
            target.files = [...step.action.files];
          }
        } else if (step.action.type === 'gap_reported' && step.action.gap) {
          target.status = 'gap_detected';
          target.gaps.push({
            id: `gap_${Date.now()}`,
            title: step.action.gap.title,
            description: step.action.gap.description,
            severity: step.action.gap.severity,
            resolved: false,
          });
        } else if (step.action.type === 'gap_resolved') {
          for (const g of target.gaps) {
            g.resolved = true;
            if (step.action.resolutionNote) g.resolutionNote = step.action.resolutionNote;
          }
          if (step.action.progress !== undefined) target.progress = step.action.progress;
          target.status = target.progress === 100 ? 'completed' : 'in_progress';
          if (step.action.files) {
            for (const f of step.action.files) {
              const exIdx = target.files.findIndex((tf) => tf.path === f.path);
              if (exIdx >= 0) target.files[exIdx] = f;
              else target.files.push(f);
            }
          }
        }
      }

      return {
        ...prev,
        components: nextComponents,
        activeStep: nextIdx,
        lastUpdated: new Date().toISOString(),
      };
    });

    setSimStepIndex(nextIdx);

    // If final step, throw confetti!
    if (nextIdx === demoSteps.length) {
      setIsPlaying(false);
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch (err) {
        // ignore
      }
    }
  }, [simStepIndex, demoSteps]);

  // Autoplay simulation runner
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setSimStepIndex((curr) => {
          if (curr >= demoSteps.length) {
            setIsPlaying(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return curr;
          }
          handleNextStep();
          return curr;
        });
      }, 2500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, demoSteps.length, handleNextStep]);

  const handleTogglePlay = () => {
    if (simStepIndex >= demoSteps.length) {
      // If already at end, restart
      handleReset('demo');
      setTimeout(() => setIsPlaying(true), 200);
      return;
    }
    setIsPlaying((prev) => !prev);
  };

  const handleReset = (mode: 'demo' | 'clean') => {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setSimStepIndex(0);
    if (mode === 'demo') {
      setActiveMode('demo');
      setProject(getCliDemoProject());
    } else {
      setActiveMode('dogfood');
      setProject(getDogfoodProject());
    }
  };

  // Derive active gaps and next recommended focus
  const activeGapsCount = project.components.reduce(
    (count, c) => count + c.gaps.filter((g) => !g.resolved).length,
    0
  );

  // Compute next focus: lowest layer with incomplete component, sorted by priority
  const sortedLayers = [...project.layers].sort((a, b) => a.order - b.order);
  let nextFocus: any = null;
  for (const layer of sortedLayers) {
    const layerComps = project.components
      .filter((c) => c.layerId === layer.id)
      .sort((a, b) => a.priority - b.priority);

    const incomplete = layerComps.find(
      (c) => c.progress < 100 || c.gaps.some((g) => !g.resolved)
    );
    if (incomplete) {
      nextFocus = {
        componentId: incomplete.id,
        componentName: incomplete.name,
        layerName: layer.name,
        priority: incomplete.priority,
        status: incomplete.status,
        progress: incomplete.progress,
        gaps: incomplete.gaps.filter((g) => !g.resolved),
      };
      break;
    }
  }

  const selectedComponent = project.components.find((c) => c.id === selectedComponentId) || null;

  return (
    <div className="min-h-screen pb-32 flex flex-col transition-colors">
      {/* Top Navigation */}
      <Header
        project={project}
        isConnected={isConnected}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onReset={handleReset}
        onOpenGaps={() => setIsGapsModalOpen(true)}
        activeGapsCount={activeGapsCount}
      />

      {/* Main Visualizer Container */}
      <main className="max-w-7xl w-full mx-auto px-6 flex-1 space-y-8">
        {/* AI Agent Roadmap Banner */}
        <RoadmapBanner
          nextFocus={nextFocus}
          onSelectComponent={(id) => setSelectedComponentId(id)}
        />

        {/* Layer Swimlanes */}
        <div className="space-y-8">
          {sortedLayers.map((layer) => {
            const compsInLayer = project.components.filter((c) => c.layerId === layer.id);
            return (
              <LayerLane
                key={layer.id}
                layer={layer}
                components={compsInLayer}
                selectedComponentId={selectedComponentId || undefined}
                onSelectComponent={(c) => setSelectedComponentId(c.id)}
              />
            );
          })}
        </div>
      </main>

      {/* Slide-over Component Inspector */}
      <ComponentDrawer
        component={selectedComponent}
        allComponents={project.components}
        onClose={() => setSelectedComponentId(null)}
        onNavigateToComponent={(id) => setSelectedComponentId(id)}
      />

      {/* Global Gaps Audit Modal */}
      <GapsModal
        isOpen={isGapsModalOpen}
        onClose={() => setIsGapsModalOpen(false)}
        components={project.components}
        onSelectComponent={(id) => setSelectedComponentId(id)}
      />

      {/* Interactive Bottom Simulation & Dogfood Controls */}
      <SimulationControls
        currentStepIndex={simStepIndex}
        totalSteps={demoSteps.length}
        currentStep={simStepIndex > 0 ? demoSteps[simStepIndex - 1] : null}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onNextStep={handleNextStep}
        onReset={() => handleReset('demo')}
        activeProjectMode={activeMode}
        onSwitchMode={handleSwitchMode}
      />
    </div>
  );
};

export default App;
