import React from 'react';
import { ComponentStatus } from '@shared/types.js';
import { STATUS_TOKENS } from '@shared/tokens.js';

interface ProgressBarProps {
  progress: number;
  status?: ComponentStatus;
  hasGaps?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  status = 'planned',
  hasGaps = false,
  className = '',
  size = 'md',
}) => {
  const clamped = Math.min(100, Math.max(0, progress));
  const effectiveStatus = hasGaps ? 'gap_detected' : status;
  const token = STATUS_TOKENS[effectiveStatus] || STATUS_TOKENS.planned;

  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={`w-full rounded-full neu-well overflow-hidden ${heightClass} ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${token.barColor}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
