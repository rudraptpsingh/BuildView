import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import {
  BuildViewProject,
  ArchitectureComponent,
  ArchitectureLayer,
  GapItem,
  FileChange,
  TimelineEvent,
  ComponentStatus,
  ArchitecturePlan,
  RepositoryFileDelta,
} from '../shared/types.js';
import { ArchitecturePlanner } from './parser/architecture-planner.js';

export class BuildViewStore extends EventEmitter {
  private project: BuildViewProject;
  private timeline: TimelineEvent[] = [];
  private stateFilePath: string;

  constructor(storageDir = path.resolve(process.cwd(), '.buildview')) {
    super();
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.stateFilePath = path.join(storageDir, 'state.json');
    this.project = this.loadOrInit();
    // Reconstruct observed-file activity from durable delta state after restart.
    this.timeline = (this.project.workingTreeChanges || []).slice(-100).reverse().map(change=>({
      id:`observed_${change.observedAt}_${change.path}`,timestamp:change.observedAt,type:'file_changed' as const,
      componentId:change.componentIds[0],title:`${change.status}: ${change.path}`,
      description:change.componentIds.length ? `Restored observed delta for ${change.componentIds.join(', ')}; validation is not inferred.` : 'Restored unmapped repository change.',
    }));
  }

  private loadOrInit(): BuildViewProject {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.warn('Could not read state.json, initializing fresh store', err);
      }
    }
    return this.createDefaultProject();
  }

  private save(): void {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.project, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist state:', err);
    }
    this.emit('update', { project: this.project, timeline: this.timeline });
  }

  public createDefaultProject(): BuildViewProject {
    return {
      id: 'proj_default',
      name: 'BuildView Architecture',
      description: 'AI-assisted architecture and execution visualizer',
      version: '1.0.0',
      layers: [
        { id: 'layer_foundation', name: 'Foundation & Storage', order: 0, description: 'Core data layer, schema & configs', color: '#6366f1' },
        { id: 'layer_core', name: 'Core Engine & Logic', order: 1, description: 'State machine, processing pipelines', color: '#06b6d4' },
        { id: 'layer_interface', name: 'CLI & User Interface', order: 2, description: 'Command routers, presentation layer', color: '#10b981' },
      ],
      components: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  public getProject(): BuildViewProject {
    return this.project;
  }

  public getTimeline(): TimelineEvent[] {
    return this.timeline;
  }

  public initProject(name: string, description: string, layers?: ArchitectureLayer[]): BuildViewProject {
    this.project = {
      id: `proj_${Date.now()}`,
      name,
      description,
      version: '1.0.0',
      layers: layers && layers.length > 0 ? layers : this.createDefaultProject().layers,
      components: [],
      lastUpdated: new Date().toISOString(),
    };
    this.addTimelineEvent({
      type: 'init',
      title: 'Project Initialized',
      description: `Project "${name}" initialized with ${this.project.layers.length} architectural layers.`,
    });
    this.save();
    return this.project;
  }

  public setLayers(layers: ArchitectureLayer[]): ArchitectureLayer[] {
    this.project.layers = layers.sort((a, b) => a.order - b.order);
    this.project.lastUpdated = new Date().toISOString();
    this.save();
    return this.project.layers;
  }

  public defineComponent(comp: Omit<ArchitectureComponent, 'updatedAt'>): ArchitectureComponent {
    const existingIndex = this.project.components.findIndex((c) => c.id === comp.id);
    const fullComp: ArchitectureComponent = {
      ...comp,
      anatomy: {
        members: comp.anatomy?.members || [],
        functions: comp.anatomy?.functions || [],
        state: comp.anatomy?.state || [],
        callers: comp.anatomy?.callers || [],
        callees: comp.anatomy?.callees || [],
      },
      files: comp.files || [],
      gaps: comp.gaps || [],
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.project.components[existingIndex] = fullComp;
      this.addTimelineEvent({
        type: 'component_added',
        componentId: comp.id,
        title: `Component Updated: ${comp.name}`,
        description: `Updated architecture schema for ${comp.name}.`,
      });
    } else {
      this.project.components.push(fullComp);
      this.addTimelineEvent({
        type: 'component_added',
        componentId: comp.id,
        title: `Component Planned: ${comp.name}`,
        description: `Added ${comp.name} to Layer "${comp.layerId}" (Priority P${comp.priority}).`,
      });
    }

    this.project.lastUpdated = new Date().toISOString();
    this.save();
    return fullComp;
  }

  public updateComponentProgress(params: {
    id: string;
    progress?: number;
    status?: ComponentStatus;
    files?: FileChange[];
    note?: string;
  }): ArchitectureComponent | null {
    const comp = this.project.components.find((c) => c.id === params.id);
    if (!comp) return null;

    if (params.progress !== undefined) comp.progress = Math.min(100, Math.max(0, params.progress));
    if (params.status !== undefined) comp.status = params.status;
    if (params.files) {
      for (const f of params.files) {
        const fileIdx = comp.files.findIndex((cf) => cf.path === f.path);
        if (fileIdx >= 0) {
          comp.files[fileIdx] = f;
        } else {
          comp.files.push(f);
        }
      }
    }
    comp.updatedAt = new Date().toISOString();
    this.project.lastUpdated = new Date().toISOString();

    this.addTimelineEvent({
      type: 'progress_update',
      componentId: comp.id,
      title: `${comp.name}: ${comp.progress}% (${comp.status})`,
      description: params.note || `Progress updated to ${comp.progress}%. Files modified: ${comp.files.length}`,
    });

    this.save();
    return comp;
  }

  public reportGap(componentId: string, gap: Omit<GapItem, 'id' | 'resolved'>): GapItem | null {
    const comp = this.project.components.find((c) => c.id === componentId);
    if (!comp) return null;

    const gapItem: GapItem = {
      ...gap,
      id: `gap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      resolved: false,
    };

    comp.gaps.push(gapItem);
    if (comp.status !== 'in_progress') {
      comp.status = 'gap_detected';
    }
    comp.updatedAt = new Date().toISOString();
    this.project.lastUpdated = new Date().toISOString();

    this.addTimelineEvent({
      type: 'gap_reported',
      componentId,
      title: `Gap Identified: ${gap.title}`,
      description: `[${gap.severity.toUpperCase()}] ${gap.description}`,
    });

    this.save();
    return gapItem;
  }

  public resolveGap(componentId: string, gapId: string, note?: string): boolean {
    const comp = this.project.components.find((c) => c.id === componentId);
    if (!comp) return false;

    const gap = comp.gaps.find((g) => g.id === gapId);
    if (!gap) return false;

    gap.resolved = true;
    if (note) gap.resolutionNote = note;

    const hasActiveGaps = comp.gaps.some((g) => !g.resolved);
    if (!hasActiveGaps && comp.status === 'gap_detected') {
      comp.status = comp.progress === 100 ? 'completed' : 'in_progress';
    }

    comp.updatedAt = new Date().toISOString();
    this.project.lastUpdated = new Date().toISOString();

    this.addTimelineEvent({
      type: 'gap_resolved',
      componentId,
      title: `Gap Resolved: ${gap.title}`,
      description: note || 'Gap was marked as resolved.',
    });

    this.save();
    return true;
  }

  public getRoadmap() {
    // Sort layers by order
    const sortedLayers = [...this.project.layers].sort((a, b) => a.order - b.order);

    const layerMap = sortedLayers.map((layer) => {
      const components = this.project.components
        .filter((c) => c.layerId === layer.id)
        .sort((a, b) => a.priority - b.priority);

      const totalProgress = components.length > 0
        ? Math.round(components.reduce((sum, c) => sum + c.progress, 0) / components.length)
        : 0;

      return {
        layer,
        totalProgress,
        components,
      };
    });

    // Architectural layer order is a display/tie-break hint, not a global build barrier.
    const layerOrder=new Map(sortedLayers.map(layer=>[layer.id,layer.order]));
    const byId=new Map(this.project.components.map(component=>[component.id,component]));
    const candidates=this.project.components.filter(c=>c.status!=='completed'||c.gaps.some(g=>!g.resolved)||c.progress<100)
      .sort((a,b)=>a.priority-b.priority||(layerOrder.get(a.layerId)||0)-(layerOrder.get(b.layerId)||0)||a.id.localeCompare(b.id));
    const dependencyReady=candidates.filter(component=>component.anatomy.callees.filter(id=>byId.has(id)).every(id=>{
      const prerequisite=byId.get(id);
      return prerequisite?.status==='completed'&&!prerequisite.gaps.some(g=>!g.resolved);
    }));
    const readyComponents=dependencyReady.filter(c=>!c.gaps.some(g=>!g.resolved));
    // When no implementation is ready, surface dependency-ready planning/gap work.
    const nextComponent=readyComponents[0] || dependencyReady[0] || null;
    const nextLayer=nextComponent ? sortedLayers.find(layer=>layer.id===nextComponent.layerId) : null;

    const allGaps = this.project.components.flatMap((c) =>
      c.gaps
        .filter((g) => !g.resolved)
        .map((g) => ({
          componentId: c.id,
          componentName: c.name,
          ...g,
        }))
    );

    return {
      projectName: this.project.name,
      readyComponentIds: readyComponents.map(component=>component.id),
      layerMap,
      nextFocus: nextComponent
        ? {
            componentId: nextComponent.id,
            componentName: nextComponent.name,
            layerName: nextLayer?.name,
            priority: nextComponent.priority,
            status: nextComponent.status,
            progress: nextComponent.progress,
            anatomy: nextComponent.anatomy,
            gaps: nextComponent.gaps.filter((g) => !g.resolved),
          }
        : null,
      activeGapsCount: allGaps.length,
      unresolvedGaps: allGaps,
    };
  }

  private addTimelineEvent(event: Omit<TimelineEvent, 'id' | 'timestamp'>) {
    const fullEvent: TimelineEvent = {
      ...event,
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.timeline.unshift(fullEvent);
    if (this.timeline.length > 100) this.timeline.pop();
  }

  public resetProject(sampleData?: BuildViewProject) {
    if (sampleData) {
      this.project = sampleData;
    } else {
      this.project = this.createDefaultProject();
    }
    this.timeline = [];
    this.addTimelineEvent({
      type: 'init',
      title: 'Project Reset',
      description: 'Reset project to clean baseline.',
    });
    this.save();
    return this.project;
  }

  public recordRepositoryWatchError(root:string,error:string) {
    if(this.project.repositoryWatch?.root===root&&this.project.repositoryWatch.error===error)return;
    this.project.repositoryWatch={root,snapshot:this.project.repositoryWatch?.snapshot||{},lastScanAt:new Date().toISOString(),...this.project.repositoryWatch,error};
    this.addTimelineEvent({type:'file_changed',title:'Repository observation warning',description:error});
    this.save();
  }

  public recordRepositoryObservation(root:string,snapshot:Record<string,string>,changes:RepositoryFileDelta[]) {
    const prior=this.project.repositoryWatch;
    const planSources=new Set(this.project.components.map(c=>c.planSource).filter(Boolean));
    const drift=changes.some(change=>planSources.has(change.path));
    this.project.repositoryWatch={root,snapshot,lastScanAt:new Date().toISOString(),planDrift:prior?.planDrift||drift};
    const byPath=new Map((this.project.workingTreeChanges||[]).map(change=>[change.path,change]));
    for(const change of changes) {
      byPath.set(change.path,change);
      this.addTimelineEvent({type:'file_changed',title:`${change.status}: ${change.path}`,
        componentId:change.componentIds[0],description:change.componentIds.length ? `Observed file delta for ${change.componentIds.join(', ')}. Validation is not inferred.` : 'Observed unmapped repository change. Assign ownership if relevant.'});
      for(const id of change.componentIds) {
        const component=this.project.components.find(c=>c.id===id);
        if(!component)continue;
        const file=component.files.find(f=>f.path===change.path);
        if(file)file.status=change.status;
        else component.files.push({path:change.path,status:change.status,description:'Automatically observed file delta; not test evidence'});
        if(component.status==='completed') {
          component.status='gap_detected';
          if(!component.gaps.some(g=>!g.resolved&&g.kind==='validation_stale'))component.gaps.push({id:`stale_${id}_${Date.now()}`,kind:'validation_stale',title:'Validation stale after file change',description:`${change.path} changed after completion. Rerun acceptance checks and record new evidence.`,severity:'high',resolved:false});
        }
        component.updatedAt=change.observedAt;
      }
    }
    if(drift) {
      const owner=this.project.components.find(c=>changes.some(change=>change.componentIds.includes(c.id)&&planSources.has(change.path)))||this.project.components[0];
      if(owner&&!owner.gaps.some(g=>!g.resolved&&g.kind==='plan_drift'))owner.gaps.push({id:`plan_drift_${Date.now()}`,kind:'plan_drift',title:'Plan source changed — explicit refresh required',description:'The plan source changed on disk. Review changes and explicitly refresh the plan; the watcher never replaces the graph.',severity:'high',resolved:false});
      this.addTimelineEvent({type:'file_changed',title:'Plan source changed',description:'Review and refresh the plan explicitly. Architecture was not replaced.'});
    }
    this.project.workingTreeChanges=[...byPath.values()].sort((a,b)=>a.observedAt.localeCompare(b.observedAt)).slice(-500);
    if(changes.length)this.project.lastUpdated=new Date().toISOString();
    // Initial baseline is durable. No-op reconciliations do not create event/save loops.
    if(changes.length||!prior||JSON.stringify(prior.snapshot)!==JSON.stringify(snapshot)||prior.error)this.save();
  }

  public createArchitecturePlan(title?: string, summary?: string): ArchitecturePlan {
    const plan = ArchitecturePlanner.generatePlan(this.project, title, summary);
    this.project.activePlan = plan;
    this.addTimelineEvent({
      type: 'progress_update',
      title: 'Architecture Plan Created',
      description: `Plan "${plan.title}" created with ${plan.steps.length} sequential execution steps.`,
    });
    this.save();
    return plan;
  }

  public getActivePlan(): ArchitecturePlan | undefined {
    return this.project.activePlan;
  }

  public advancePlanStep(stepId?: string): ArchitecturePlan | undefined {
    const plan = this.project.activePlan;
    if (!plan) return undefined;

    const currentStep = plan.steps[plan.activeStepIndex];
    if (currentStep) {
      currentStep.status = 'completed';
    }

    if (plan.activeStepIndex + 1 < plan.steps.length) {
      plan.activeStepIndex += 1;
      plan.steps[plan.activeStepIndex].status = 'in_progress';
      this.addTimelineEvent({
        type: 'progress_update',
        title: `Plan Advanced to Step ${plan.activeStepIndex + 1}`,
        description: `Now executing: "${plan.steps[plan.activeStepIndex].title}"`,
      });
    } else {
      plan.status = 'completed';
      this.addTimelineEvent({
        type: 'progress_update',
        title: 'Architecture Plan Completed',
        description: `All ${plan.steps.length} steps of "${plan.title}" have been successfully executed.`,
      });
    }

    this.save();
    return plan;
  }

  public getBlastRadius(componentId: string) {
    return ArchitecturePlanner.calculateBlastRadius(this.project.components, componentId);
  }
}
