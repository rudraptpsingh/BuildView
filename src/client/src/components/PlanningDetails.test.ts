import React from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PlanningDetails} from './PlanningDetails.js';
it('renders structured ports and clearly labels planned acceptance as unexecuted',()=>{
 const markup=renderToStaticMarkup(React.createElement(PlanningDetails,{planning:{goal:'Trusted facts',method:'Typed receipt',outcome:'Exact result',inputs:[{name:'source',schemaRef:'contracts.json#/$defs/Source',description:'Original source',required:true}],outputs:[{name:'receipt',schemaRef:'contracts.json#/$defs/Receipt',description:'Receipt'}],acceptanceTests:[{id:'roundtrip',description:'Exact replay',evidence:'test-report.json'}],integrationContracts:[{boundary:'Parser to import',input:'Source',output:'Receipt',failureBehavior:'Block on hash mismatch',validation:'Check hashes'}]}}));
 expect(markup).toContain('contracts.json#/$defs/Source');expect(markup).toContain('contracts.json#/$defs/Receipt');
 expect(markup).toContain('Planned · not run');expect(markup).toContain('Expected evidence:');
 expect(markup).toContain('Block on hash mismatch');expect(markup).not.toContain('test passed');
});
