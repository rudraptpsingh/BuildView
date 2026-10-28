import React from 'react';
import { JobPanel } from './components/JobPanel';
import { useLimit } from './hooks/useLimit';
export const Root = () => React.createElement(JobPanel, { limit: useLimit() });
