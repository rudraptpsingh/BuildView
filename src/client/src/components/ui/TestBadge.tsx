import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { TestCoverageSummary } from '@shared/types.js';
import { TokenEngine } from '@shared/tokens.js';

interface TestBadgeProps {
  testSummary?: TestCoverageSummary;
  className?: string;
}

export const TestBadge: React.FC<TestBadgeProps> = ({ testSummary, className = '' }) => {
  const token = TokenEngine.resolveTestToken(testSummary);

  const renderIcon = () => {
    switch (token.status) {
      case 'tested':
        return <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />;
      case 'partial':
        return <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />;
      default:
        return <HelpCircle className="w-2.5 h-2.5 text-slate-400" />;
    }
  };

  const label = testSummary && testSummary.totalTests > 0
    ? `${testSummary.totalTests} TESTS`
    : token.label;

  return (
    <span className={`${token.pillClass} ${className}`} title={testSummary ? `${testSummary.totalTests} tests across ${testSummary.testFilesCount} test file(s)` : 'No tests detected'}>
      {renderIcon()}
      <span>{label}</span>
    </span>
  );
};
