import { ComponentStatus, TestCoverageSummary, WasteMetrics } from './types.js';

export interface StatusToken {
  key: ComponentStatus;
  label: string;
  pillClass: string;
  barColor: string;
}

export interface SeverityToken {
  level: 'low' | 'medium' | 'high' | 'critical';
  label: string;
  pillClass: string;
}

export interface TestToken {
  status: 'tested' | 'partial' | 'untested';
  label: string;
  pillClass: string;
}

export interface WasteToken {
  recommendation: 'prune' | 'investigate' | 'clean';
  label: string;
  pillClass: string;
}

/**
 * Single Source of Truth for Status Design Tokens
 * Leveraged from user UI/UX design kit (AgentMonitor / ui-ux-pro-max)
 */
export const STATUS_TOKENS: Record<ComponentStatus, StatusToken> = {
  planned: {
    key: 'planned',
    label: 'PLANNED',
    pillClass: 'pill neutral',
    barColor: 'bg-slate-400 dark:bg-slate-600',
  },
  in_progress: {
    key: 'in_progress',
    label: 'BUILDING',
    pillClass: 'pill blue',
    barColor: 'bg-[#32ade6]',
  },
  completed: {
    key: 'completed',
    label: 'VERIFIED',
    pillClass: 'pill green',
    barColor: 'bg-[#30d158]',
  },
  gap_detected: {
    key: 'gap_detected',
    label: 'GAP DETECTED',
    pillClass: 'pill amber',
    barColor: 'bg-[#ff9f0a]',
  },
};

/**
 * Single Source of Truth for Architectural Gap Severity Tokens
 */
export const SEVERITY_TOKENS: Record<'low' | 'medium' | 'high' | 'critical', SeverityToken> = {
  low: {
    level: 'low',
    label: 'LOW',
    pillClass: 'pill blue',
  },
  medium: {
    level: 'medium',
    label: 'MED',
    pillClass: 'pill amber',
  },
  high: {
    level: 'high',
    label: 'HIGH',
    pillClass: 'pill amber font-bold',
  },
  critical: {
    level: 'critical',
    label: 'CRITICAL',
    pillClass: 'pill danger font-bold',
  },
};

/**
 * Single Source of Truth for Component Test Coverage Tokens
 */
export const TEST_TOKENS: Record<'tested' | 'partial' | 'untested', TestToken> = {
  tested: {
    status: 'tested',
    label: 'TESTED',
    pillClass: 'pill green font-bold',
  },
  partial: {
    status: 'partial',
    label: 'PARTIAL',
    pillClass: 'pill amber font-bold',
  },
  untested: {
    status: 'untested',
    label: 'NO TESTS',
    pillClass: 'pill neutral font-bold opacity-75',
  },
};

/**
 * Single Source of Truth for Code Waste & Pruning Tokens
 */
export const WASTE_TOKENS: Record<'prune' | 'investigate' | 'clean', WasteToken> = {
  clean: {
    recommendation: 'clean',
    label: 'CLEAN',
    pillClass: 'pill green',
  },
  investigate: {
    recommendation: 'investigate',
    label: 'TEST ZOMBIE',
    pillClass: 'pill blue',
  },
  prune: {
    recommendation: 'prune',
    label: 'PRUNE CANDIDATE',
    pillClass: 'pill amber font-bold',
  },
};

/**
 * Precision Architectural Layer Accent Palette
 */
export const LAYER_ACCENTS: Record<string, { bar: string; color: string; border: string }> = {
  layer_0: { bar: '#32ade6', color: 'blue', border: '#32ade648' },
  layer_1: { bar: '#06b6d4', color: 'cyan', border: '#06b6d448' },
  layer_2: { bar: '#ffd60a', color: 'amber', border: '#ffd60a48' },
  layer_3: { bar: '#ff453a', color: 'rose', border: '#ff453a48' },
  layer_4: { bar: '#10b981', color: 'emerald', border: '#10b98148' },
  layer_0_native_storage: { bar: '#32ade6', color: 'blue', border: '#32ade648' },
  layer_1_ai_ml: { bar: '#06b6d4', color: 'cyan', border: '#06b6d448' },
  layer_2_ipc_desktop: { bar: '#ffd60a', color: 'amber', border: '#ffd60a48' },
  layer_3_studio_ui: { bar: '#ff453a', color: 'rose', border: '#ff453a48' },
  layer_4_tests: { bar: '#10b981', color: 'emerald', border: '#10b98148' },
  layer_foundation: { bar: '#6366f1', color: 'indigo', border: '#6366f148' },
  layer_domain: { bar: '#06b6d4', color: 'cyan', border: '#06b6d448' },
  layer_state_ipc: { bar: '#ffd60a', color: 'amber', border: '#ffd60a48' },
  layer_presentation: { bar: '#f43f5e', color: 'rose', border: '#f43f5e48' },
  layer_verification: { bar: '#10b981', color: 'emerald', border: '#10b98148' },
  default: { bar: '#636366', color: 'neutral', border: '#3f4047' },
};

/**
 * Design Token Engine & Architectural Validation
 * Reusable component for resolving and validating design tokens across the system.
 */
export class TokenEngine {
  /**
   * Resolves a validated status token, factoring in active gaps.
   */
  public static resolveStatusToken(status: ComponentStatus, gapCount: number = 0): StatusToken {
    const effectiveStatus: ComponentStatus = gapCount > 0 ? 'gap_detected' : status;
    const token = STATUS_TOKENS[effectiveStatus];
    if (!token) {
      console.warn(`[TokenEngine] Unknown status: "${status}", falling back to planned.`);
      return STATUS_TOKENS.planned;
    }
    return token;
  }

  /**
   * Resolves a validated gap severity token.
   */
  public static resolveSeverityToken(severity: 'low' | 'medium' | 'high' | 'critical'): SeverityToken {
    const token = SEVERITY_TOKENS[severity];
    if (!token) {
      console.warn(`[TokenEngine] Unknown severity: "${severity}", falling back to medium.`);
      return SEVERITY_TOKENS.medium;
    }
    return token;
  }

  /**
   * Resolves a validated test coverage token.
   */
  public static resolveTestToken(testSummary?: TestCoverageSummary): TestToken {
    if (!testSummary || testSummary.totalTests === 0) {
      return TEST_TOKENS.untested;
    }
    if (testSummary.status === 'partial') {
      return TEST_TOKENS.partial;
    }
    return TEST_TOKENS.tested;
  }

  /**
   * Resolves a validated waste / prune status token.
   */
  public static resolveWasteToken(wasteMetrics?: WasteMetrics): WasteToken {
    if (!wasteMetrics || wasteMetrics.cleanlinessScore === 100) {
      return WASTE_TOKENS.clean;
    }
    return WASTE_TOKENS[wasteMetrics.recommendation] || WASTE_TOKENS.clean;
  }

  /**
   * Validates whether a component satisfies architectural design token compliance.
   * Ensures status is recognized and severity values are legitimate.
   */
  public static validateCompliance(component: {
    id: string;
    status: string;
    gaps?: Array<{ severity: string }>;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!(component.status in STATUS_TOKENS)) {
      errors.push(`Invalid component status "${component.status}" on ${component.id}`);
    }

    if (component.gaps) {
      for (const gap of component.gaps) {
        if (!(gap.severity in SEVERITY_TOKENS)) {
          errors.push(`Invalid gap severity "${gap.severity}" in component ${component.id}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
