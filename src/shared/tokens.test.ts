import { describe, it, expect } from 'vitest';
import { TokenEngine, STATUS_TOKENS, SEVERITY_TOKENS } from './tokens.js';

describe('TokenEngine Design Token Validation Suite', () => {
  it('should resolve standard status tokens cleanly', () => {
    const planned = TokenEngine.resolveStatusToken('planned');
    expect(planned.label).toBe('PLANNED');
    expect(planned.pillClass).toContain('neutral');

    const inProgress = TokenEngine.resolveStatusToken('in_progress');
    expect(inProgress.label).toBe('BUILDING');
    expect(inProgress.pillClass).toContain('blue');

    const completed = TokenEngine.resolveStatusToken('completed');
    expect(completed.label).toBe('VERIFIED');
    expect(completed.pillClass).toContain('green');
  });

  it('should escalate status to gap_detected when gapCount > 0', () => {
    // Component says "completed", but has 1 unresolved gap -> must escalate to gap_detected
    const token = TokenEngine.resolveStatusToken('completed', 1);
    expect(token.key).toBe('gap_detected');
    expect(token.label).toBe('GAP DETECTED');
    expect(token.pillClass).toContain('amber');
  });

  it('should resolve all severity levels with valid classes', () => {
    expect(TokenEngine.resolveSeverityToken('low').label).toBe('LOW');
    expect(TokenEngine.resolveSeverityToken('medium').label).toBe('MED');
    expect(TokenEngine.resolveSeverityToken('high').label).toBe('HIGH');
    expect(TokenEngine.resolveSeverityToken('critical').label).toBe('CRITICAL');
    expect(TokenEngine.resolveSeverityToken('critical').pillClass).toContain('danger');
  });

  it('should validate architectural component compliance', () => {
    // Compliant component
    const validComp = {
      id: 'comp_store',
      status: 'in_progress',
      gaps: [{ severity: 'high' }],
    };
    const validResult = TokenEngine.validateCompliance(validComp);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    // Non-compliant component with invalid status & severity
    const invalidComp = {
      id: 'comp_broken',
      status: 'unknown_status_xyz',
      gaps: [{ severity: 'ultra_critical_invalid' }],
    };
    const invalidResult = TokenEngine.validateCompliance(invalidComp);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toHaveLength(2);
    expect(invalidResult.errors[0]).toContain('Invalid component status');
    expect(invalidResult.errors[1]).toContain('Invalid gap severity');
  });
});
