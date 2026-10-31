import { z } from 'zod';
import type { BuildViewProject } from '../shared/types.js';

const text = z.string().trim().min(1);
export const planningItemSchema = z.object({
  id: text, label: text, priority:z.number().int().min(1).max(5).default(1), layerId: text.optional(), module: text.optional(), depends_on: z.array(text).default([]),
  description: text.optional(), build: text.optional(), validate: text.optional(),
  goal: text.optional(), method: text.optional(), outcome: text.optional(),
  fileGlobs: z.array(text).optional(),
  inputs: z.array(z.object({name:text,schemaRef:text,description:text,required:z.boolean().optional()})).optional(),
  outputs: z.array(z.object({name:text,schemaRef:text,description:text,required:z.boolean().optional()})).optional(),
  acceptanceTests: z.array(z.object({ id: text, description: text, evidence: text })).optional(),
  integrationContracts: z.array(z.object({
    boundary: text, input: text, output: text, failureBehavior: text, validation: text,
  })).optional(),
  reuseBoundaries: z.array(z.object({ tool: text, responsibility: text, ownedWork: text })).optional(),
  evidenceRequired: z.array(text).optional(),
});
// Concrete fields remain optional to read older version-1 roadmaps, but omission
// creates explicit planning gaps. Syntax validity is not a complete build plan.
export const roadmapSchema = z.object({
  version: z.literal(1),
  layers: z.array(z.object({id:text,name:text,order:z.number().int(),description:text,color:text.optional()})).min(1).optional(),
  tracks: z.array(planningItemSchema), gates: z.array(planningItemSchema),
});
export type PlanningItem = z.infer<typeof planningItemSchema>;

export const planningInstructions = [
  'For future implementation planning, first call buildview_get_planning_contract.',
  'Read the repository requirements and evidence, then author one roadmap matching that contract.',
  'Call buildview_plan_project once to validate and map it automatically; inspect planning gaps and readiness.',
  'buildview_scan_repo maps existing source structure; it does not infer future requirements or prove completion.',
  'Scanning or replacing an active plan can replace its state: keep code scans in a separate project/store.',
  'Before building, get the roadmap and component context. Work only on dependency-ready components; independent dependency-ready items may run in parallel across architecture layers.',
  'Report gaps and update progress with receipt/test evidence. A source file, declared acceptance test, or progress claim is not a verified passing test.',
  'Do not mark a gate complete until its prerequisites and recorded acceptance checks pass. No automatic verification or execution lock is claimed.',
].join(' ');

export function getPlanningContract() {
  const concreteFields = ['goal','method','outcome','inputs','outputs','acceptanceTests','integrationContracts','reuseBoundaries','evidenceRequired'];
  return {
    version: 1,
    purpose: 'Agent-assisted concrete planning with deterministic dependency mapping; not LLM requirement inference.',
    workflow: [
      'Read this contract before creating a delivery plan. Separate existing code facts from future intent.',
      'Read requirements and source references; ask for missing decisions or record explicit planning gaps.',
      'Write buildview.plan.json (or another in-repo path), including tracks/gates and concrete fields below.',
      'Call buildview_plan_project(repoPath, planPath). Existing state is protected unless replaceExisting is explicitly true.',
      'Resolve planning gaps, then get the roadmap and choose a dependency-ready component. Dependency-ready tracks can be built in parallel, regardless of architecture layer order.',
      'Use component context, report gaps and update progress as implementation proceeds. Record actual test/receipt references before completion.',
    ],
    schema: z.toJSONSchema(roadmapSchema),
    concreteFieldsRequiredForPlanningReadiness: concreteFields,
    template: {
      version: 1,
      layers:[{id:'domain',name:'Domain services',order:2,description:'Architectural grouping, independent of prerequisite rank'}],
      tracks: [{
        id: 'example_delivery', label: 'Example integration', layerId:'domain',module:'modules/example',depends_on: [],
        goal: 'Describe the user outcome this work enables.',
        method: 'Describe the implementation approach and constraints.',
        outcome: 'Describe the observable deliverable and next action.',
        inputs:[{name:'request',schemaRef:'contracts/example.schema.json#/$defs/Request',description:'Versioned authorised request',required:true}],
        outputs:[{name:'receipt',schemaRef:'contracts/example.schema.json#/$defs/Receipt',description:'Immutable result and provenance',required:true}],
        acceptanceTests: [{id:'contract_replay',description:'State a falsifiable passing condition.',evidence:'Specify the expected test report or receipt artifact; not a fabricated result.'}],
        integrationContracts: [{boundary:'Producer → consumer',input:'Versioned input/identity/scope',output:'Versioned output/receipt',failureBehavior:'Explicit blocked/retry/deny behavior',validation:'Exact compatibility, failure and recovery checks'}],
        reuseBoundaries: [{tool:'Existing dependency or none',responsibility:'What it supplies, with version/license constraints',ownedWork:'What this project must implement and validate'}],
        evidenceRequired:['Source versions, actual test receipts and reviewer decisions required before completion'],
      }],
      gates: [],
    },
    limits: [
      'Legacy build/validate-only plans load but have planning gaps. When explicit layers are provided, every item must reference one by layerId; layer order does not establish execution prerequisites.',
      'The tool checks structure, missing dependencies and cycles; it does not judge business correctness or infer requirements from Markdown.',
      'Readiness is guidance from declared dependencies/status/gaps, not a distributed lock or proof that tests ran.',
      'Start all mapped items at planned/0. Existing plan files do not constitute completed implementation.',
    ],
  };
}

export function planningMissingFields(item: PlanningItem): string[] {
  const missing: string[] = [];
  for (const field of ['goal','method','outcome'] as const) if (!item[field]) missing.push(field);
  for (const field of ['inputs','outputs','acceptanceTests','integrationContracts','reuseBoundaries','evidenceRequired'] as const) {
    if (!item[field]?.length) missing.push(field);
  }
  return missing;
}

export function getPlanningReadiness(project: BuildViewProject) {
  const byId = new Map(project.components.map(c => [c.id,c]));
  return project.components.map(component => {
    const unmetPrerequisites = component.anatomy.callees.filter(id => byId.has(id) && byId.get(id)?.status !== 'completed');
    const openGaps = component.gaps.filter(g => !g.resolved);
    const planningGaps = openGaps.filter(g => g.kind === 'planning_completeness');
    return {
      componentId: component.id,
      planningReady: planningGaps.length === 0,
      executionReady: unmetPrerequisites.length === 0 && openGaps.length === 0 && component.status !== 'completed',
      unmetPrerequisites,
      planningGapIds: planningGaps.map(g => g.id),
      openGapIds: openGaps.map(g => g.id),
      evidenceVerification: 'not_automatically_verified',
    };
  });
}
