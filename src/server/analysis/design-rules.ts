import fs from 'fs';
import path from 'path';
import type { GapItem, ArchitectureComponent } from '../../shared/types.js';

export interface DesignTokenMetrics {
  totalColorLiterals: number;
  totalOffScaleHeights: number;
  totalOffScaleTypeSizes: number;
  totalIconLiterals: number;
  totalArbitraryClasses: number;
  totalUnmergedDynamicClasses: number;
  totalMissingTestIds: number;
  totalFigmaMappedComponents: number;
  filesWithViolations: string[];
}

export interface DesignRuleViolation {
  file: string;
  line?: number;
  kind:
    | 'hardcoded_color_literal'
    | 'off_scale_control_height'
    | 'off_scale_type_size'
    | 'off_scale_icon_size'
    | 'arbitrary_classname'
    | 'unmerged_classname'
    | 'missing_testid'
    | 'unmapped_figma_component';
  severity: 'low' | 'medium' | 'high';
  message: string;
  evidence: string;
}

const PALETTE = 'neutral|gray|slate|zinc|stone|emerald|rose|red|green|blue|amber|yellow|indigo|purple|pink|teal|cyan|orange|lime|violet|fuchsia|sky';
const COLOR_LITERAL_REGEX = new RegExp(
  `\\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:${PALETTE})-\\d{2,3}\\b|\\bbg-black\\b|\\bbg-white\\b|\\btext-white\\b|\\btext-black\\b`,
  'g'
);

const OFF_SCALE_HEIGHT_REGEX = /\b(?:h|min-h)-\[(?:\d+px|\d+rem)\]|\b(?:h-7|h-11|h-12|min-h-10)\b/g;
const OFF_SCALE_TYPE_REGEX = /\btext-\[\d+(?:\.\d+)?px\]/g;
const OFF_SCALE_ICON_REGEX = /\b(?:h-\[(?:9|10|11|13|15|17|18|19|21|22|23)px\]|w-\[(?:9|10|11|13|15|17|18|19|21|22|23)px\])/g;
const ARBITRARY_CLASS_REGEX = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|min-w|max-w|gap)-\[\d+(?:\.\d+)?px\]|\bbg-\[#[0-9a-fA-F]{3,8}\]/g;
const UNMERGED_DYNAMIC_CLASS_REGEX = /className=\{`[^`]*\$\{[^}]+\}[^`]*`\}/g;
const TESTID_REGEX = /data-testid=["'{]/;

export class DesignRulesEngine {
  /**
   * Scans repository component files for design system, design token, and testability invariants.
   */
  public static analyzeDesignRules(
    repoPath: string,
    components: ArchitectureComponent[],
    options: { enforceTokens?: boolean; enforceControls?: boolean; enforceTestIds?: boolean } = {}
  ): {
    metrics: DesignTokenMetrics;
    violations: DesignRuleViolation[];
    gaps: GapItem[];
  } {
    const violations: DesignRuleViolation[] = [];
    const filesWithViolations = new Set<string>();
    let totalColorLiterals = 0;
    let totalOffScaleHeights = 0;
    let totalOffScaleTypeSizes = 0;
    let totalIconLiterals = 0;
    let totalArbitraryClasses = 0;
    let totalUnmergedDynamicClasses = 0;
    let totalMissingTestIds = 0;

    // 1. Check for design-rules.json authority if present
    const designRulesPath = path.join(repoPath, 'docs', 'design', 'desktop-v2', 'design-rules.json');
    let hasDesignRules = fs.existsSync(designRulesPath);

    // 2. Scan UI / Presentation components for token and control compliance
    for (const comp of components) {
      // Focus on presentation/UI layer components
      const isUi = comp.layerId === 'layer_presentation' || comp.id.includes('component') || comp.id.includes('share') || comp.id.includes('cull');
      if (!isUi) continue;

      for (const fileObj of comp.files) {
        const filePath = fileObj.path;
        if (!filePath.endsWith('.tsx') || filePath.includes('.test.') || filePath.includes('__tests__')) {
          continue;
        }

        const absPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath);
        if (!fs.existsSync(absPath)) continue;

        let content = '';
        try {
          content = fs.readFileSync(absPath, 'utf-8');
        } catch {
          continue;
        }

        // Check Color Literals
        const colorMatches = content.match(COLOR_LITERAL_REGEX);
        if (colorMatches && colorMatches.length > 0) {
          totalColorLiterals += colorMatches.length;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'hardcoded_color_literal',
            severity: 'low',
            message: `Hardcoded color literal "${colorMatches[0]}" found (${colorMatches.length} occurrence(s)). Prefer semantic CSS variables var(--surface-*), var(--text-*).`,
            evidence: `${filePath}: ${colorMatches.slice(0, 3).join(', ')}`,
          });
        }

        // Check Control Standard Heights
        const heightMatches = content.match(OFF_SCALE_HEIGHT_REGEX);
        if (heightMatches && heightMatches.length > 0) {
          totalOffScaleHeights += heightMatches.length;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'off_scale_control_height',
            severity: 'low',
            message: `Off-scale control height "${heightMatches[0]}" found. Standard control sizes are S (24px), M (28px), L (36px).`,
            evidence: `${filePath}: ${heightMatches.slice(0, 3).join(', ')}`,
          });
        }

        // Check Type Scale
        const typeMatches = content.match(OFF_SCALE_TYPE_REGEX);
        if (typeMatches && typeMatches.length > 0) {
          totalOffScaleTypeSizes += typeMatches.length;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'off_scale_type_size',
            severity: 'low',
            message: `Off-scale type size "${typeMatches[0]}" found. Standard type scale has 6 steps (10, 11, 12, 13, 15, 17px).`,
            evidence: `${filePath}: ${typeMatches.slice(0, 3).join(', ')}`,
          });
        }

        // Check Icon Scale
        const iconMatches = content.match(OFF_SCALE_ICON_REGEX);
        if (iconMatches && iconMatches.length > 0) {
          totalIconLiterals += iconMatches.length;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'off_scale_icon_size',
            severity: 'low',
            message: `Off-scale icon literal "${iconMatches[0]}" found. Standard icon sizes are 12, 14, 16, 20, 24px (size-icon-*).`,
            evidence: `${filePath}: ${iconMatches.slice(0, 3).join(', ')}`,
          });
        }

        // Check Arbitrary Classname Escapes
        const arbitraryMatches = content.match(ARBITRARY_CLASS_REGEX);
        if (arbitraryMatches && arbitraryMatches.length > 0) {
          totalArbitraryClasses += arbitraryMatches.length;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'arbitrary_classname',
            severity: 'low',
            message: `Arbitrary utility escape "${arbitraryMatches[0]}" found. Prefer standardized spacing scale or design tokens.`,
            evidence: `${filePath}: ${arbitraryMatches.slice(0, 3).join(', ')}`,
          });
        }

        // Check Unmerged Dynamic Class Concatenation (Template Strings in className)
        const unmergedMatches = content.match(UNMERGED_DYNAMIC_CLASS_REGEX);
        if (unmergedMatches && unmergedMatches.length > 0) {
          totalUnmergedDynamicClasses += unmergedMatches.length;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'unmerged_classname',
            severity: 'low',
            message: `Unmerged template literal in className found. Wrap with cn(...) to ensure predictable Tailwind specificity overrides.`,
            evidence: `${filePath}: ${unmergedMatches.slice(0, 2).join(', ')}`,
          });
        }

        // Check data-testid reachability (excluding main/index/entrypoint files and non-JSX files)
        const base = path.basename(filePath);
        const isEntrypoint = base.startsWith('index.') || base.startsWith('main.') || base === 'App.tsx';
        const hasDomJsx = /<(?:div|span|button|section|header|footer|main|nav|aside|form|input|textarea|select|option|p|h[1-6]|ul|ol|li|a|img|svg|table|tr|td|th)\b/.test(content);
        if (hasDomJsx && !TESTID_REGEX.test(content) && !isEntrypoint) {
          totalMissingTestIds++;
          filesWithViolations.add(filePath);
          violations.push({
            file: filePath,
            kind: 'missing_testid',
            severity: 'low',
            message: `Component file "${base}" lacks data-testid attribute, reducing test reachability for E2E and agents.`,
            evidence: `${filePath} has 0 data-testid attributes`,
          });
        }
      }
    }

    // 3. Count Figma Mappings
    let totalFigmaMappedComponents = 0;
    for (const comp of components) {
      if (comp.figmaComponents && comp.figmaComponents.length > 0) {
        totalFigmaMappedComponents += comp.figmaComponents.length;
      }
    }

    // 4. Convert significant design violations to architectural gaps
    const gaps: GapItem[] = [];
    if (totalMissingTestIds > 0 && (options.enforceTestIds || hasDesignRules)) {
      gaps.push({
        id: 'gap_design_missing_testids',
        title: `Design Standard: ${totalMissingTestIds} component(s) lack data-testid reachability`,
        description: 'Every UI presentation component must carry at least one data-testid attribute so E2E test suites and AI coding agents can reliably interact with it.',
        severity: totalMissingTestIds > 10 ? 'medium' : 'low',
        resolved: false,
        evidence: violations.filter((v) => v.kind === 'missing_testid').slice(0, 5).map((v) => v.file),
        kind: 'design_standard_missing_testid',
        resolutionNote: 'Add stable data-testid attributes to root component elements.',
      });
    }

    return {
      metrics: {
        totalColorLiterals,
        totalOffScaleHeights,
        totalOffScaleTypeSizes,
        totalIconLiterals,
        totalArbitraryClasses,
        totalUnmergedDynamicClasses,
        totalMissingTestIds,
        totalFigmaMappedComponents,
        filesWithViolations: Array.from(filesWithViolations),
      },
      violations,
      gaps,
    };
  }
}
