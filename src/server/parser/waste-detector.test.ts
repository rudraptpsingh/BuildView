import { describe, it, expect } from 'vitest';
import { RepoParser } from './repo-parser.js';
import { WasteDetector } from './waste-detector.js';

describe('WasteDetector Engine', () => {
  it('detects unused exports not imported in prod or tests', () => {
    const fileA = RepoParser.parseFile(
      'src/utils/math.ts',
      `
      export function add(a: number, b: number): number {
        return a + b;
      }

      export function deadHelper(x: string): string {
        return x.toUpperCase();
      }
      `
    );

    const fileB = RepoParser.parseFile(
      'src/services/calculator.ts',
      `
      import { add } from '../utils/math';

      export function calculateTotal(prices: number[]): number {
        return prices.reduce((acc, p) => add(acc, p), 0);
      }
      `
    );

    const result = WasteDetector.analyzeRepository([fileA, fileB], []);
    
    // deadHelper was never imported
    const unusedNames = result.allUnusedExports.map((e) => e.name);
    expect(unusedNames).toContain('deadHelper');
    expect(unusedNames).not.toContain('add');
    expect(result.repoWaste.recommendation).toBe('prune');
  });

  it('detects test zombies (symbols only imported in test files, dead in prod)', () => {
    const fileA = RepoParser.parseFile(
      'src/legacy/parser.ts',
      `
      export function legacyXmlParse(raw: string): any {
        return JSON.parse(raw);
      }
      `
    );

    const testFile = RepoParser.parseFile(
      'tests/legacy-parser.test.ts',
      `
      import { legacyXmlParse } from '../src/legacy/parser';

      describe('legacy parser', () => {
        it('parses legacy format', () => {
          legacyXmlParse("{}");
        });
      });
      `
    );

    const result = WasteDetector.analyzeRepository([fileA], [testFile]);
    const zombieNames = result.allTestZombies.map((z) => z.name);
    expect(zombieNames).toContain('legacyXmlParse');
    expect(result.allUnusedExports.length).toBe(0);
  });

  it('detects duplicate function implementations across files', () => {
    const fileA = RepoParser.parseFile(
      'src/utils/format.ts',
      `
      export function formatBytes(bytes: number, decimals: number = 2): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      }
      `
    );

    const fileB = RepoParser.parseFile(
      'src/components/helpers.ts',
      `
      export function formatBytesDuplicate(bytes: number, decimals: number = 2): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      }
      `
    );

    const result = WasteDetector.analyzeRepository([fileA, fileB], []);
    expect(result.allDuplicates.length).toBeGreaterThan(0);
    expect(result.allDuplicates[0].reason).toContain('Identical logic body matching');
  });

  it('aggregates component-level waste metrics accurately', () => {
    const fileA = RepoParser.parseFile(
      'src/store/state.ts',
      `
      export function activeState(): string { return 'ok'; }
      export function deadState(): string { return 'dead'; }
      `
    );

    const fileWasteMap = new Map();
    fileWasteMap.set('src/store/state.ts', {
      unusedExports: ['deadState'],
      deadCodeLines: 4,
      duplicateFunctions: [],
      orphanFiles: [],
      testZombies: [],
      cleanlinessScore: 85,
      recommendation: 'prune',
    });

    const compWaste = WasteDetector.getComponentWaste(['src/store/state.ts'], fileWasteMap);
    expect(compWaste.unusedExports).toContain('state.ts:deadState');
    expect(compWaste.deadCodeLines).toBe(4);
    expect(compWaste.cleanlinessScore).toBe(90);
    expect(compWaste.recommendation).toBe('prune');
  });

  it('tells exports used only in their own file apart from dead symbols', () => {
    const lib = RepoParser.parseFile(
      'src/lib.ts',
      `export function helper(): number {\n  return 1;\n}\nexport function caller(): number {\n  return helper();\n}\nexport const DEAD = 1;\n`
    );
    const result = WasteDetector.analyzeRepository([lib], []);
    const byName = Object.fromEntries((result.repoWaste.unusedExportDetails || []).map((u) => [u.name, u]));
    expect(byName.helper).toMatchObject({ usage: 'local_only', severity: 'low', line: 1 });
    expect(byName.caller).toMatchObject({ usage: 'dead', severity: 'medium', line: 4 });
    expect(byName.DEAD.message).toBe('symbol never referenced anywhere (dead): DEAD at src/lib.ts:7');
  });

  it('uses resolved file edges so .js-suffixed and aliased imports are not orphans', () => {
    const a = RepoParser.parseFile('src/a.ts', `export const a = 1;\n`);
    const b = RepoParser.parseFile('src/b.ts', `import { a } from './a.js';\nexport const b = a;\n`);
    const withoutEdges = WasteDetector.analyzeRepository([a, b], []);
    expect(withoutEdges.allOrphanFiles).toContain('src/a.ts');
    const withEdges = WasteDetector.analyzeRepository([a, b], [], ['src/b.ts'], {
      fileEdges: [{ from: 'src/b.ts', to: 'src/a.ts', line: 1, specifier: './a.js', typeOnly: false, kind: 'import' }],
    });
    expect(withEdges.allOrphanFiles).toEqual([]);
  });
});
