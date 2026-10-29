import path from 'path';
import type { GapItem, AgentRemediationCard } from '../../shared/types.js';

export interface AgentRemediationOptions {
  tokenBudget?: number;
  verificationCmd?: string;
}

export class AgentRemediationEngine {
  /**
   * Generates a token-budgeted, surgical prompt card for an AI coding agent to fix
   * a specific architectural gap without polluting context with full repo dumps.
   *
   * Inspired by AgentMonitor's token budgeting and loop prevention telemetry.
   */
  public static generateCard(
    gap: GapItem,
    options: AgentRemediationOptions = {}
  ): AgentRemediationCard {
    const budget = options.tokenBudget || 450;
    const defaultVerify = options.verificationCmd || 'npx buildview check';

    let category: AgentRemediationCard['category'] = 'architecture';
    if (gap.kind?.includes('design') || gap.kind?.includes('testid')) {
      category = 'design_tokens';
    } else if (gap.kind?.includes('perf') || gap.kind?.includes('sync')) {
      category = 'performance';
    } else if (gap.kind?.includes('cycle') || gap.kind?.includes('runtime') || gap.kind?.includes('inversion')) {
      category = 'architecture';
    } else if (gap.kind?.includes('unused') || gap.kind?.includes('orphan')) {
      category = 'cleanliness';
    } else if (gap.kind?.includes('test') || gap.kind?.includes('zombie')) {
      category = 'verification';
    }

    // Identify target files from evidence
    const targetFiles: string[] = [];
    if (gap.evidence && Array.isArray(gap.evidence)) {
      for (const ev of gap.evidence) {
        if (typeof ev === 'string' && (ev.includes('/') || ev.includes('.'))) {
          // Parse possible file:line
          const f = ev.split(':')[0].trim();
          if (f && !targetFiles.includes(f)) targetFiles.push(f);
        }
      }
    }

    // Extract diagnosis and recipe
    let diagnosis = gap.description || gap.title;
    let extractionPlan: AgentRemediationCard['extractionPlan'] = undefined;

    // Diagnose circular dependencies
    if (gap.kind === 'circular_dependency' || gap.title.toLowerCase().includes('cycle')) {
      diagnosis = `A cyclic dependency exists between ${targetFiles.map((f) => path.basename(f)).join(' and ')}. Cyclic imports cause runtime undefined errors during module evaluation.`;

      if (targetFiles.length >= 2) {
        const fileA = targetFiles[0];
        const fileB = targetFiles[1];
        const sharedDir = path.dirname(fileA);
        const suggestedExtract = path.join(
          sharedDir,
          `${path.basename(fileA, path.extname(fileA))}Constants${path.extname(fileA)}`
        );

        extractionPlan = {
          newFile: suggestedExtract,
          symbolsToMove: ['Shared constants, interfaces, or event emitters causing the back-reference'],
          importUpdates: [
            {
              file: fileA,
              addImport: `import { ... } from './${path.basename(suggestedExtract, path.extname(suggestedExtract))}';`,
              removeImport: `Import referencing ${path.basename(fileB)}`,
            },
            {
              file: fileB,
              addImport: `import { ... } from './${path.basename(suggestedExtract, path.extname(suggestedExtract))}';`,
              removeImport: `Import referencing ${path.basename(fileA)}`,
            },
          ],
        };
      }
    } else if (gap.kind === 'cross_runtime_import') {
      diagnosis = `A web/worker module imports directly from electron or node runtime code. This leaks OS-specific APIs into sandbox runtimes.`;
      extractionPlan = {
        newFile: 'shared/contracts.ts',
        symbolsToMove: ['Shared interfaces, type definitions, and DTO contracts'],
        importUpdates: targetFiles.map((f) => ({
          file: f,
          addImport: `import type { ... } from 'shared/contracts';`,
        })),
      };
    } else if (gap.kind?.includes('design') || gap.kind?.includes('testid')) {
      diagnosis = `UI Presentation components lack stable data-testid attributes, reducing agent and test suite reachability.`;
      extractionPlan = {
        symbolsToMove: [],
        importUpdates: targetFiles.map((f) => ({
          file: f,
          addImport: `Add data-testid="${path.basename(f, path.extname(f)).toLowerCase()}-root" to root JSX element`,
        })),
      };
    }

    // Build compact prompt text
    const promptLines: string[] = [];
    promptLines.push(`## Architectural Remediation Task: ${gap.title}`);
    promptLines.push(`**Severity:** ${gap.severity.toUpperCase()} | **Category:** ${category.toUpperCase()}`);
    promptLines.push(`**Diagnosis:** ${diagnosis}`);
    promptLines.push(`**Target Files:**`);
    for (const f of targetFiles.slice(0, 4)) {
      promptLines.push(`- \`${f}\``);
    }

    if (extractionPlan?.newFile) {
      promptLines.push(`**Extraction Recommendation:**`);
      promptLines.push(`- Create: \`${extractionPlan.newFile}\``);
      if (extractionPlan.symbolsToMove?.length) {
        promptLines.push(`- Extract: ${extractionPlan.symbolsToMove.join(', ')}`);
      }
      if (extractionPlan.importUpdates?.length) {
        promptLines.push(`- Import Rewrites:`);
        for (const u of extractionPlan.importUpdates.slice(0, 2)) {
          promptLines.push(`  * In \`${path.basename(u.file)}\`: ${u.addImport}`);
        }
      }
    } else if (gap.resolutionNote) {
      promptLines.push(`**Remediation Action:** ${gap.resolutionNote}`);
    }

    promptLines.push(`**Verification Gate:**`);
    promptLines.push(`\`${defaultVerify}\``);
    promptLines.push(`> Must exit with code 0 and eliminate gap \`${gap.id}\`.`);

    const agentPromptText = promptLines.join('\n');

    // Approximate token cost (~4 chars per BPE token)
    const tokenCostEstimate = Math.ceil(agentPromptText.length / 4);
    // Typical full file AST dump is ~25k to 50k tokens
    const rawDumpTokens = 28000;
    const tokenSavingsVsRawDump = Math.max(0, rawDumpTokens - tokenCostEstimate);

    return {
      gapId: gap.id,
      title: gap.title,
      severity: gap.severity,
      category,
      targetFiles,
      diagnosis,
      extractionPlan,
      verificationCommand: defaultVerify,
      tokenCostEstimate,
      tokenSavingsVsRawDump,
      agentPromptText,
    };
  }

  /**
   * Generates a batch of remediation cards for all unresolved gaps, sorted by severity.
   */
  public static generateAllCards(
    gaps: GapItem[],
    options: AgentRemediationOptions = {}
  ): AgentRemediationCard[] {
    const unresolved = gaps.filter((g) => !g.resolved);
    const severityWeight: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    unresolved.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));

    return unresolved.map((g) => this.generateCard(g, options));
  }
}
