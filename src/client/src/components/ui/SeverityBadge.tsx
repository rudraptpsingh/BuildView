import React from 'react';
import { SEVERITY_TOKENS } from '@shared/tokens.js';

interface SeverityBadgeProps {
  severity: 'low' | 'medium' | 'high' | 'critical';
  className?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, className = '' }) => {
  const token = SEVERITY_TOKENS[severity] || SEVERITY_TOKENS.medium;

  return (
    <span className={`${token.pillClass} ${className}`}>
      {token.label}
    </span>
  );
};
