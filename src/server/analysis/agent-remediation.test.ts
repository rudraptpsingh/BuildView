import { describe, it, expect } from 'vitest';
import { AgentRemediationEngine } from './agent-remediation.js';
import type { GapItem } from '../../shared/types.js';

describe('AgentRemediationEngine', () => {
  it('generates a compact, token-budgeted prompt card for circular dependencies', () => {
    const gap: GapItem = {
      id: 'gap_cycle_1',
      title: 'Circular dependency: usePhotoStore <-> useNotifications',
      description: 'usePhotoStore imports useNotifications which imports usePhotoStore',
      severity: 'critical',
      resolved: false,
      kind: 'circular_dependency',
      evidence: ['src/stores/usePhotoStore.ts:15', 'src/hooks/useNotifications.ts:32'],
    };

    const card = AgentRemediationEngine.generateCard(gap, {
      verificationCmd: 'npx buildview check',
    });

    expect(card.gapId).toBe('gap_cycle_1');
    expect(card.severity).toBe('critical');
    expect(card.category).toBe('architecture');
    expect(card.targetFiles).toContain('src/stores/usePhotoStore.ts');
    expect(card.targetFiles).toContain('src/hooks/useNotifications.ts');
    expect(card.extractionPlan).toBeDefined();
    expect(card.extractionPlan?.newFile).toBeDefined();
    expect(card.verificationCommand).toBe('npx buildview check');
    // Prompt text should be concise (~200-400 tokens)
    expect(card.tokenCostEstimate).toBeLessThan(450);
    expect(card.tokenSavingsVsRawDump).toBeGreaterThan(25000);
    expect(card.agentPromptText).toContain('## Architectural Remediation Task');
    expect(card.agentPromptText).toContain('**Verification Gate:**');
  });

  it('generates cards for design rule gaps', () => {
    const gap: GapItem = {
      id: 'gap_design_missing_testids',
      title: 'Design Standard: 16 component(s) lack data-testid reachability',
      description: 'UI components need data-testid',
      severity: 'medium',
      resolved: false,
      kind: 'design_standard_missing_testid',
      evidence: ['src/components/Button.tsx', 'src/components/Modal.tsx'],
    };

    const card = AgentRemediationEngine.generateCard(gap);
    expect(card.category).toBe('design_tokens');
    expect(card.targetFiles.length).toBe(2);
    expect(card.agentPromptText).toContain('data-testid');
  });
});
