import { describe, it, expect } from 'vitest';
import { DesignRulesEngine } from './design-rules.js';
import type { ArchitectureComponent } from '../../shared/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DesignRulesEngine', () => {
  it('detects color literals, off-scale heights, and missing testids', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildview-design-test-'));
    const compFile = path.join(tmpDir, 'BadButton.tsx');
    fs.writeFileSync(
      compFile,
      `
      export function BadButton({ active }: { active: boolean }) {
        return (
          <div className={\`bg-neutral-800 text-white h-[43px] text-[13.5px] p-[7px] \${active ? 'active' : ''}\`}>
            <span className="h-[15px] w-[15px]">Click me</span>
          </div>
        );
      }
      `
    );

    const goodFile = path.join(tmpDir, 'GoodButton.tsx');
    fs.writeFileSync(
      goodFile,
      `
      export function GoodButton() {
        return (
          <button data-testid="good-button" className="bg-surface text-primary text-ui-body">
            <span>Good</span>
          </button>
        );
      }
      `
    );

    const mockComponents: ArchitectureComponent[] = [
      {
        id: 'comp_ui',
        name: 'UI Components',
        layerId: 'layer_presentation',
        files: [{ path: compFile }, { path: goodFile }],
        anatomy: { callers: [], callees: [], externalDependencies: [] },
        gaps: [],
        updatedAt: new Date().toISOString(),
      },
    ];

    const result = DesignRulesEngine.analyzeDesignRules(tmpDir, mockComponents, { enforceTestIds: true });

    expect(result.metrics.totalColorLiterals).toBeGreaterThan(0);
    expect(result.metrics.totalOffScaleHeights).toBeGreaterThan(0);
    expect(result.metrics.totalOffScaleTypeSizes).toBeGreaterThan(0);
    expect(result.metrics.totalIconLiterals).toBe(2);
    expect(result.metrics.totalArbitraryClasses).toBeGreaterThan(0);
    expect(result.metrics.totalUnmergedDynamicClasses).toBe(1);
    expect(result.metrics.totalMissingTestIds).toBe(1); // BadButton lacks testid
    expect(result.violations.length).toBeGreaterThanOrEqual(7);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
