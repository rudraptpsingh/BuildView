import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { matchesGlob } from './glob.js';
import { loadBuildViewConfig, validateConfig } from './config.js';
import { ImportResolver, parseJsonc } from './import-resolver.js';

describe('glob matching', () => {
  it('follows gitignore-style semantics', () => {
    expect(matchesGlob('src/a/b.test.ts', '*.test.ts')).toBe(true);
    expect(matchesGlob('legacy/x/y.ts', 'legacy')).toBe(true);
    expect(matchesGlob('src/legacy/y.ts', 'legacy')).toBe(true);
    expect(matchesGlob('src/legacy/y.ts', '/legacy')).toBe(false);
    expect(matchesGlob('e2e/specs/a.spec.ts', 'e2e/**')).toBe(true);
    expect(matchesGlob('src/e2e.ts', 'e2e/**')).toBe(false);
    expect(matchesGlob('vite.config.mts', '*.config.{js,ts,mts}')).toBe(true);
    expect(matchesGlob('src/components/a/b.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchesGlob('src/b.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchesGlob('src/b.ts', 'src/**/*.tsx')).toBe(false);
  });
});

describe('config loading', () => {
  it('reads the buildview key from package.json when there is no config file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-config-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', buildview: { testGlobs: ['qa/**'] } }));
    const loaded = loadBuildViewConfig(dir);
    expect(loaded.config.testGlobs).toEqual(['qa/**']);
    expect(loaded.source).toMatch(/package\.json#buildview$/);
  });

  it('returns an empty config (auto-detect) when nothing is declared', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-config-'));
    expect(loadBuildViewConfig(dir)).toEqual({ config: {}, source: null });
  });

  it('rejects malformed config with a clear message', () => {
    expect(() => validateConfig({ testGlobs: 'e2e/**' })).toThrow(/testGlobs.*array/);
    expect(() => validateConfig({ layers: [{ name: 'x' }] })).toThrow(/layers\[0\]/);
    expect(() => validateConfig({ allowedEdges: [{ from: 'a' }] })).toThrow(/allowedEdges\[0\]/);
  });
});

describe('import resolution', () => {
  it('parses JSONC with comments, trailing commas and // inside strings', () => {
    expect(parseJsonc('{ "a": "http://x", // c\n /* b */ "b": [1,], }')).toEqual({ a: 'http://x', b: [1] });
  });

  it('resolves relative, .js->.ts, index and alias specifiers; packages resolve to null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-resolve-'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }');
    const r = new ImportResolver(dir, ['src/a.ts', 'src/lib/index.ts', 'src/ui/Button.tsx'], ['.']);
    expect(r.resolve('src/ui/Button.tsx', '../a.js')).toBe('src/a.ts');
    expect(r.resolve('src/a.ts', './lib')).toBe('src/lib/index.ts');
    expect(r.resolve('src/a.ts', '@/ui/Button')).toBe('src/ui/Button.tsx');
    expect(r.resolve('src/a.ts', 'react')).toBeNull();
    expect(r.resolve('src/a.ts', './missing')).toBeNull();
  });
});
