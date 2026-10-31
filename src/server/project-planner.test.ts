import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BuildViewStore} from './store.js';
import {planProject} from './project-planner.js';
it('derives parallel phases without turning plan/source presence into completion; rejects invalid replacement atomically',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildview-plan-'));
 try {
 const store=new BuildViewStore(path.join(root,'.state'));
 const write=(x:unknown)=>fs.writeFileSync(path.join(root,'buildview.plan.json'),JSON.stringify(x));
 const plan={version:1,tracks:[{id:'a',label:'Extraction',depends_on:['start'],build:'Parse source',validate:'Check exact cells'},{id:'b',label:'Chat',depends_on:['start']}],gates:[{id:'start',label:'Contracts',depends_on:[]},{id:'join',label:'Integrate',depends_on:['a','b']}]};
 write(plan);const p=planProject(store,root,'buildview.plan.json');
 expect(p.components).toHaveLength(4);expect(p.components.every(c=>c.status==='planned'&&c.progress===0)).toBe(true);
 expect(p.components.find(c=>c.id==='a')?.layerId).toBe(p.components.find(c=>c.id==='b')?.layerId);
 expect(store.getRoadmap().nextFocus?.componentId).toBe('start');
 expect(()=>planProject(store,root,'buildview.plan.json')).toThrow('not empty');
 const before=JSON.stringify(store.getProject());
 write({...plan,gates:[{id:'start',label:'Contracts',depends_on:['join']},{id:'join',label:'Integrate',depends_on:['a']}]});
 expect(()=>planProject(store,root,'buildview.plan.json',true)).toThrow('cycle');
 expect(JSON.stringify(store.getProject())).toBe(before);
 write({...plan,tracks:[{id:'a',label:'Bad',depends_on:['absent']}]});
 expect(()=>planProject(store,root,'buildview.plan.json',true)).toThrow('Unknown prerequisite');
 expect(JSON.stringify(store.getProject())).toBe(before);
 write({...plan,tracks:[...plan.tracks,plan.tracks[0]]});
 expect(()=>planProject(store,root,'buildview.plan.json',true)).toThrow('Duplicate');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

it('preserves structured I/O and explicit architecture layers independently of dependency order',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildview-layers-'));
 try {
 const store=new BuildViewStore(path.join(root,'.state'));
 const io={name:'request',schemaRef:'contracts/types.json#/$defs/Request',description:'Authorised request',required:true};
 const plan={version:1,layers:[{id:'low',name:'Infrastructure',order:0,description:'Infrastructure group'},{id:'high',name:'Cross-cutting checks',order:5,description:'Cross-cutting group'}],tracks:[{id:'blocked',label:'Blocked low layer',layerId:'low',depends_on:['ready'],inputs:[io],outputs:[io]},{id:'ready',label:'Ready high layer',layerId:'high',priority:2,module:'tools/check',depends_on:[],inputs:[io],outputs:[io]}],gates:[]};
 const write=(value:unknown)=>fs.writeFileSync(path.join(root,'buildview.plan.json'),JSON.stringify(value));
 write(plan);const p=planProject(store,root,'buildview.plan.json');
 expect(p.layers.map(l=>l.name)).toEqual(['Infrastructure','Cross-cutting checks']);
 expect(p.components.find(c=>c.id==='ready')).toMatchObject({layerId:'high',priority:2,module:'tools/check',planning:{inputs:[io],outputs:[io]}});
 expect(store.getRoadmap().nextFocus?.componentId).toBe('ready');
 const before=JSON.stringify(store.getProject());
 write({...plan,tracks:[{...plan.tracks[0],layerId:'absent'},plan.tracks[1]]});
 expect(()=>planProject(store,root,'buildview.plan.json',true)).toThrow('Unknown or missing explicit layer');
 expect(JSON.stringify(store.getProject())).toBe(before);
 }finally {fs.rmSync(root,{recursive:true,force:true});}
});
