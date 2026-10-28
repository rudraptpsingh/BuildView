import React from 'react';
import { Sparkles, Trash2, Search } from 'lucide-react';
import { WasteMetrics } from '@shared/types.js';
import { TokenEngine } from '@shared/tokens.js';

interface WasteBadgeProps {
  wasteMetrics?: WasteMetrics;
  className?: string;
}

export const WasteBadge: React.FC<WasteBadgeProps> = ({ wasteMetrics, className = '' }) => {
  const token = TokenEngine.resolveWasteToken(wasteMetrics);

  if (!wasteMetrics) {
    return (
      <span className={`pill neutral opacity-60 ${className}`}>
        <span>CLEANLINESS: N/A</span>
      </span>
    );
  }

  const renderIcon = () => {
    switch (token.recommendation) {
      case 'clean':
        return <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />;
      case 'prune':
        return <Trash2 className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />;
      case 'investigate':
        return <Search className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />;
      default:
        return null;
    }
  };

  let label = token.label;
  if (wasteMetrics.recommendation === 'prune') {
    const issues = wasteMetrics.unusedExports.length + wasteMetrics.duplicateFunctions.length;
    label = `${issues} PRUNE`;
  } else if (wasteMetrics.recommendation === 'investigate') {
    label = `${wasteMetrics.testZombies.length} ZOMBIE`;
  }

  const title = `Cleanliness Score: ${wasteMetrics.cleanlinessScore}% | Unused: ${wasteMetrics.unusedExports.length} | Duplicates: ${wasteMetrics.duplicateFunctions.length} | Zombies: ${wasteMetrics.testZombies.length}`;

  return (
    <span className={`${token.pillClass} ${className}`} title={title}>
      {renderIcon()}
      <span>{label}</span>
    </span>
  );
};
