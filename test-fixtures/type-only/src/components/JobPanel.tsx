import React from 'react';
import type { JobStatus } from '../../electron/jobs';
import { type JobStatus as Inline } from '../../electron/jobs';
export function JobPanel(props: { limit: number; jobs?: JobStatus[]; inline?: Inline }) {
  return React.createElement('div', null, props.limit);
}
