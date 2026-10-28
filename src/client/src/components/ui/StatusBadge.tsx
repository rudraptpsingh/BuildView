import React from 'react';
import { Clock, Radio, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ComponentStatus } from '@shared/types.js';
import { STATUS_TOKENS } from '@shared/tokens.js';

interface StatusBadgeProps {
  status: ComponentStatus;
  gapCount?: number;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, gapCount = 0, className = '' }) => {
  const token = STATUS_TOKENS[status] || STATUS_TOKENS.planned;

  const renderIcon = () => {
    switch (status) {
      case 'gap_detected':
        return <AlertTriangle className="w-2.5 h-2.5" />;
      case 'completed':
        return <CheckCircle2 className="w-2.5 h-2.5" />;
      case 'in_progress':
        return <Radio className="w-2.5 h-2.5 animate-pulse" />;
      default:
        return <Clock className="w-2.5 h-2.5" />;
    }
  };

  const label = status === 'gap_detected' && gapCount > 0
    ? `GAP (${gapCount})`
    : token.label;

  return (
    <span className={`${token.pillClass} ${className}`}>
      {renderIcon()}
      <span>{label}</span>
    </span>
  );
};
