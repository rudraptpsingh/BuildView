import { BuildViewStore } from '../server/store.js';
import { getCliDemoProject, getCliDemoSteps } from '../server/demo-data.js';

const store = new BuildViewStore();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSimulation() {
  console.log('\n🎬 ====================================================');
  console.log('🚀 Starting BuildView Live Simulation: DevPulse CLI');
  console.log('👀 Open your browser at http://localhost:5173 to watch live!');
  console.log('====================================================\n');

  // Step 0: Reset to planned state
  console.log('[Step 0] Initializing architecture plan with 3 layers & 6 planned components...');
  store.resetProject(getCliDemoProject());
  await sleep(2500);

  const steps = getCliDemoSteps();

  for (const step of steps) {
    console.log(`\n⏳ [Step ${step.stepIndex}/${steps.length}] ${step.title}`);
    console.log(`   📝 ${step.description}`);

    const act = step.action;
    if (act.type === 'progress' && act.componentId) {
      store.updateComponentProgress({
        id: act.componentId,
        progress: act.progress,
        status: act.status,
        files: act.files,
        note: step.description,
      });
    } else if (act.type === 'gap_reported' && act.componentId && act.gap) {
      store.reportGap(act.componentId, act.gap);
    } else if (act.type === 'gap_resolved' && act.componentId) {
      // Find active gap
      const comp = store.getProject().components.find((c) => c.id === act.componentId);
      const activeGap = comp?.gaps.find((g) => !g.resolved);
      if (activeGap) {
        store.resolveGap(act.componentId, activeGap.id, act.resolutionNote);
      }
      if (act.progress !== undefined) {
        store.updateComponentProgress({
          id: act.componentId,
          progress: act.progress,
          status: act.status,
          files: act.files,
          note: act.resolutionNote,
        });
      }
    }

    console.log(`   ✅ Step applied to BuildView visualizer.`);
    await sleep(3500);
  }

  console.log('\n🎉 ====================================================');
  console.log('🏆 Simulation Complete! All layers built, 0 gaps remaining.');
  console.log('====================================================\n');
}

runSimulation().catch((err) => {
  console.error('Simulation error:', err);
});
