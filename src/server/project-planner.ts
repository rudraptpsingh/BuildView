import fs from 'node:fs';
import path from 'node:path';
import { BuildViewStore } from './store.js';
import { roadmapSchema, planningMissingFields } from './planning-contract.js';

/** Turn a declarative roadmap into a checked DAG. Does not infer requirements from prose. */
export function planProject(store: BuildViewStore, repoPath: string, planPath: string, replaceExisting = false) {
  const root = fs.realpathSync(path.resolve(repoPath));
  const input = fs.realpathSync(path.resolve(root,planPath));
  const relative = path.relative(root,input);
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || relative === '..') {
    throw new Error('Plan must be inside the target repository');
  }
  const plan = roadmapSchema.parse(JSON.parse(fs.readFileSync(input,'utf8')));
  const entries = [...plan.tracks.map(x=>({...x,kind:'track'})),...plan.gates.map(x=>({...x,kind:'gate'}))];
  if (!entries.length) throw new Error('Plan has no tracks or gates');
  const byId = new Map(entries.map(x=>[x.id,x]));
  if (byId.size !== entries.length) throw new Error('Duplicate roadmap IDs');
  const depth = new Map<string,number>();
  const visiting = new Set<string>();
  const rank = (id:string):number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`);
    const entry=byId.get(id);
    if (!entry) throw new Error(`Unknown prerequisite ${id}`);
    visiting.add(id);
    const level=entry.depends_on.length ? 1+Math.max(...entry.depends_on.map(rank)) : 0;
    visiting.delete(id);depth.set(id,level);return level;
  };
  for(const entry of entries) rank(entry.id);
  if (plan.layers) {
    const layersById=new Set(plan.layers.map(layer=>layer.id));
    if(layersById.size!==plan.layers.length)throw new Error('Duplicate layer IDs');
    for(const entry of entries)if(!entry.layerId||!layersById.has(entry.layerId)) {
      throw new Error(`Unknown or missing explicit layer for ${entry.id}: ${entry.layerId || '(none)'}`);
    }
  } else if(entries.some(entry=>entry.layerId)) {
    throw new Error('Explicit item layerId requires top-level layers');
  }
  if (store.getProject().components.length && !replaceExisting) {
    throw new Error('Active project is not empty; explicitly set replaceExisting to replace it');
  }
  const levels=[...new Set(depth.values())].sort((a,b)=>a-b);
  const source=relative.split(path.sep).join('/');
  store.initProject(path.basename(root)+' · Delivery plan',`Automatically mapped from ${source}. Planned intent, not code completion.`,plan.layers || levels.map(order=>({
    id:`phase_${order}`,name:order===0?'Foundation':`Dependency phase ${order}`,order,
    description:'Same-phase components may proceed in parallel after their declared prerequisites.',color:'#6366f1',
  })));
  for(const entry of [...entries].sort((a,b)=>depth.get(a.id)!-depth.get(b.id)!)) {
    const desc=entry.description || entry.goal || entry.outcome || entry.label;
    const missing = planningMissingFields(entry);
    const gaps = missing.map(field=>({id:`planning_${entry.id}_${field}`,title:`Planning detail missing: ${field}`,
      description:`Define ${field} in ${source} for ${entry.label}. Call buildview_get_planning_contract for the required shape.`,
      severity:'high' as const,resolved:false,kind:'planning_completeness'}));
    store.defineComponent({id:entry.id,name:entry.label,layerId:entry.layerId || `phase_${depth.get(entry.id)}`,description:desc||entry.label,
      color:entry.kind==='gate'?'amber':'cyan',priority:entry.priority,status:'planned',progress:0,
      fileGlobs:entry.fileGlobs,planSource:source,module:entry.module,
      planning:{goal:entry.goal,method:entry.method,outcome:entry.outcome,inputs:entry.inputs,outputs:entry.outputs,
        acceptanceTests:entry.acceptanceTests,integrationContracts:entry.integrationContracts,reuseBoundaries:entry.reuseBoundaries,evidenceRequired:entry.evidenceRequired},
      anatomy:{members:[],functions:[],state:[{name:'acceptance',type:'planned | passed | failed | blocked',initialValue:'planned',description:'Advance only with recorded validation evidence'}],
        callers:entries.filter(x=>x.depends_on.includes(entry.id)).map(x=>x.id),callees:entry.depends_on},
      files:[{path:source,status:'created',description:'Existing plan source; not implementation completion'}],gaps,
    });
  }
  return store.getProject();
}
