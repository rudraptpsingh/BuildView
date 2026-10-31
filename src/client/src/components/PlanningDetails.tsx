import React from 'react';
import type { ComponentPlanning, PlanningDataPort } from '@shared/types.js';

function Ports({label,ports}:{label:string;ports:PlanningDataPort[]}) {
  return <section aria-label={label} className="space-y-2">
    <h4 className="text-xs font-semibold text-[var(--text-primary)]">{label}</h4>
    {ports.length ? <div className="overflow-x-auto rounded-lg hairline-border"><table className="w-full text-xs text-left">
      <thead className="bg-[var(--surface-titlebar)] text-[var(--text-secondary)]"><tr><th className="p-2 font-medium">Data</th><th className="p-2 font-medium">Schema</th></tr></thead>
      <tbody>{ports.map(port=><tr key={port.name} className="hairline-t align-top">
        <td className="p-2"><div className="font-medium text-[var(--text-primary)]">{port.name} <span className="text-[10px] font-normal text-[var(--text-tertiary)]">{port.required===true?'required':port.required===false?'optional':'unspecified'}</span></div><div className="mt-1 text-[var(--text-secondary)]">{port.description}</div></td>
        <td className="p-2 max-w-[240px]"><code className="break-all text-[11px] text-[var(--text-secondary)]">{port.schemaRef}</code></td>
      </tr>)}</tbody>
    </table></div> : <p className="text-xs text-[var(--text-tertiary)]">Not specified — planning gap.</p>}
  </section>;
}

/** Requirements are shown separately from discovered source tests and run results. */
export function PlanningDetails({planning}:{planning:ComponentPlanning}) {
  return <section aria-label="Component plan" className="space-y-5">
    <h3 className="text-sm font-bold text-[var(--text-primary)]">Plan</h3>
    <dl className="space-y-3">{(['goal','method','outcome'] as const).map(field=><div key={field}>
      <dt className="text-xs font-semibold capitalize text-[var(--text-primary)]">{field}</dt>
      <dd className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{planning[field]||'Not specified — planning gap.'}</dd>
    </div>)}</dl>
    <Ports label="Inputs" ports={planning.inputs||[]}/>
    <Ports label="Outputs" ports={planning.outputs||[]}/>
    <section aria-label="Planned acceptance checks" className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">Acceptance checks</h4><span className="pill neutral text-[10px]">Planned · not run</span></div>
      {planning.acceptanceTests?.length ? <ol className="space-y-3">{planning.acceptanceTests.map(test=><li key={test.id} className="rounded-lg neu-well p-3">
        <div className="text-xs font-medium">{test.id}</div><p className="text-xs text-[var(--text-secondary)] mt-1">{test.description}</p>
        <p className="mt-2 text-[11px] text-[var(--text-tertiary)]"><span className="font-medium">Expected evidence:</span> {test.evidence}</p>
      </li>)}</ol> : <p className="text-xs text-[var(--text-tertiary)]">No acceptance checks specified.</p>}
    </section>
    {!!planning.integrationContracts?.length&&<section aria-label="Integration and failure behavior" className="space-y-2">
      <h4 className="text-xs font-semibold">Integration contracts</h4>
      {planning.integrationContracts.map((contract,index)=><details key={index} className="rounded-lg neu-well p-3">
        <summary className="text-xs font-medium cursor-pointer">{contract.boundary}</summary>
        <dl className="mt-3 space-y-2 text-xs">{[['Input',contract.input],['Output',contract.output],['On failure',contract.failureBehavior],['Validation',contract.validation]].map(([label,value])=><div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 text-[var(--text-secondary)]">{value}</dd></div>)}</dl>
      </details>)}
    </section>}
    {!!planning.reuseBoundaries?.length&&<section aria-label="Reuse boundaries" className="space-y-2">
      <h4 className="text-xs font-semibold">Reuse and ownership</h4>
      {planning.reuseBoundaries.map((reuse,index)=><div key={index} className="text-xs leading-relaxed"><div className="font-medium">{reuse.tool}</div><p className="text-[var(--text-secondary)]">Reuse: {reuse.responsibility}</p><p className="text-[var(--text-secondary)]">Build: {reuse.ownedWork}</p></div>)}
    </section>}
    {!!planning.evidenceRequired?.length&&<section aria-label="Completion evidence" className="space-y-2"><h4 className="text-xs font-semibold">Required before completion</h4><ul className="list-disc pl-4 space-y-1 text-xs text-[var(--text-secondary)]">{planning.evidenceRequired.map((evidence,index)=><li key={index}>{evidence}</li>)}</ul></section>}
  </section>;
}
