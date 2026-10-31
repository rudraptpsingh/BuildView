import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {BuildViewStore} from './store.js';
import {createBuildViewMcpServer} from './mcp.js';
import {getPlanningContract,getPlanningReadiness} from './planning-contract.js';
import {planProject} from './project-planner.js';

it('flags legacy shallow plans and distinguishes dependency readiness from declared evidence',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildview-concrete-'));
 try {
 const store=new BuildViewStore(path.join(root,'.state'));
 const {layerId:_layerId,...full}=getPlanningContract().template.tracks[0];
 fs.writeFileSync(path.join(root,'buildview.plan.json'),JSON.stringify({version:1,tracks:[{...full,id:'a',label:'A'},{id:'b',label:'B',depends_on:['a'],build:'Build B',validate:'Check B'}],gates:[]}));
 const project=planProject(store,root,'buildview.plan.json');
 const a=project.components.find(c=>c.id==='a')!, b=project.components.find(c=>c.id==='b')!;
 expect(a.gaps).toHaveLength(0);expect(b.gaps).toHaveLength(9);
 expect(b.gaps.every(g=>g.kind==='planning_completeness')).toBe(true);
 expect(project.components.every(c=>c.status==='planned'&&c.progress===0)).toBe(true);
 const readiness=getPlanningReadiness(project);
 expect(readiness.find(r=>r.componentId==='a')?.executionReady).toBe(true);
 expect(readiness.find(r=>r.componentId==='b')).toMatchObject({planningReady:false,executionReady:false,unmetPrerequisites:['a'],evidenceVerification:'not_automatically_verified'});
 expect(a.description).toBe(full.goal);
 expect(a.planning?.acceptanceTests?.[0].evidence).toBe(full.acceptanceTests[0].evidence);
 expect(a.planning?.integrationContracts?.[0].failureBehavior).toBe(full.integrationContracts[0].failureBehavior);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

it('MCP onboarding and completion guards reject unsupported updates without mutating state',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildview-mcp-plan-'));
 const store=new BuildViewStore(path.join(root,'.state'));
 const server=createBuildViewMcpServer(store);
 const client=new Client({name:'planning-contract-test',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 try {
 await server.connect(b);await client.connect(a);
 expect(client.getInstructions()).toContain('buildview_get_planning_contract');
 const contract=await client.callTool({name:'buildview_get_planning_contract',arguments:{}});
 const parsed=JSON.parse((contract.content as {text:string}[])[0].text);
 expect(parsed.concreteFieldsRequiredForPlanningReadiness).toContain('integrationContracts');
 const {layerId:_layerId,...full}=getPlanningContract().template.tracks[0];
 fs.writeFileSync(path.join(root,'buildview.plan.json'),JSON.stringify({version:1,tracks:[{...full,id:'a',label:'A'},{...full,id:'b',label:'B',depends_on:['a']},{id:'shallow',label:'Shallow',depends_on:[]}],gates:[]}));
 const mapped=await client.callTool({name:'buildview_plan_project',arguments:{repoPath:root}});
 expect(mapped.isError).not.toBe(true);
 const before=JSON.stringify(store.getProject());
 for(const args of [{id:'a',status:'completed'},{id:'a',progress:100,note:' '},{id:'b',status:'completed',note:'tests/actual-receipt.json'},{id:'shallow',status:'completed',note:'tests/actual-receipt.json'}]) {
  const rejected=await client.callTool({name:'buildview_update_progress',arguments:args});
  expect(rejected.isError).toBe(true);expect(JSON.stringify(store.getProject())).toBe(before);
 }
 const first=await client.callTool({name:'buildview_update_progress',arguments:{id:'a',status:'completed',progress:100,note:'tests/actual-receipt.json (test fixture only)'}});
 expect(first.isError).not.toBe(true);
 const second=await client.callTool({name:'buildview_update_progress',arguments:{id:'b',status:'completed',progress:100,note:'tests/actual-receipt-b.json (test fixture only)'}});
 expect(second.isError).not.toBe(true);
 const definition=await client.callTool({name:'buildview_define_component',arguments:{id:'shortcut',name:'Shortcut',layerId:'phase_0',description:'No evidence',status:'completed',progress:100}});
 expect(definition.isError).toBe(true);expect(store.getProject().components.find(c=>c.id==='shortcut')).toBeUndefined();
 } finally {await client.close();await server.close();fs.rmSync(root,{recursive:true,force:true});}
});
