import fs from 'fs';
import path from 'path';
import { matchesAnyGlob, normalizePath } from './glob.js';
import type { BuildViewConfig } from './config.js';

/**
 * What a file is for. Only `product` files take part in cycle and
 * layer-inversion checks; tests and tooling may import anything.
 */
export type FileRole = 'product' | 'test' | 'tooling';

/** Built-in globs that mark a file as test code (extended by config.testGlobs). */
export const DEFAULT_TEST_GLOBS: readonly string[] = [
  '*.test.*',
  '*.spec.*',
  '*.stories.*',
  '*.story.*',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'fixtures',
  'test',
  'tests',
  'testing',
  'test-utils',
  'test-helpers',
  'testutils',
  'e2e',
  'cypress',
  'playwright.config.*',
  'playwright.*.config.*',
  'vitest.config.*',
  'vitest.*.config.*',
  'vitest.setup.*',
  'jest.config.*',
  'jest.setup.*',
  'cypress.config.*',
];

/** Built-in globs for build tooling and scripts (extended by config.toolingGlobs). */
export const DEFAULT_TOOLING_GLOBS: readonly string[] = [
  '/scripts',
  '/tools',
  '*.config.{js,cjs,mjs,ts,cts,mts}',
  '*.config.*.{js,cjs,mjs,ts,cts,mts}',
  '.eslintrc.*',
  '.prettierrc.*',
  '/build-*.{js,cjs,mjs,ts}',
  '/build.{js,cjs,mjs,ts}',
  '/Gulpfile.*',
  '/gulpfile.*',
  '/Gruntfile.*',
];

export function isTestPath(filePath: string, extraGlobs?: readonly string[]): boolean {
  return matchesAnyGlob(filePath, DEFAULT_TEST_GLOBS) || matchesAnyGlob(filePath, extraGlobs);
}

export function isToolingPath(filePath: string, extraGlobs?: readonly string[]): boolean {
  return matchesAnyGlob(filePath, DEFAULT_TOOLING_GLOBS) || matchesAnyGlob(filePath, extraGlobs);
}

/**
 * @param rootDir when given, `scripts/` and `tools/` folders at the root of a
 *   nested package (a folder with its own package.json) also count as tooling.
 */
export function classifyFileRole(filePath: string, config: BuildViewConfig = {}, rootDir?: string): FileRole {
  if (isTestPath(filePath, config.testGlobs)) return 'test';
  if (isToolingPath(filePath, config.toolingGlobs)) return 'tooling';
  if (rootDir) {
    const m = normalizePath(filePath).match(/^(.+?)\/(scripts|tools)\//);
    if (m && fs.existsSync(path.join(rootDir, m[1], 'package.json'))) return 'tooling';
  }
  return 'product';
}

/**
 * The deployable unit a product file runs in. Imports between different
 * known runtimes (e.g. a Cloudflare Worker importing renderer code) are
 * boundary violations; `shared` may be imported by anyone.
 */
export type RuntimeKind = 'electron-main' | 'ui' | 'worker' | 'package' | 'shared' | 'generic';

export interface RuntimeInfo {
  /** Unit name: a folder such as `electron`, `workers`, or a configured runtime name. */
  unit: string;
  kind: RuntimeKind;
  /** Folder of the package.json that owns the file ('.' for the repository root package). */
  packageRoot: string;
  /** Declared in buildview.config.json `runtimes` (always an enforced boundary). */
  explicit?: boolean;
}

export interface RuntimeDetectionInput {
  filePath: string;
  imports: string[];
}

const SHARED_DIR_NAMES = new Set(['shared', 'common']);
const UI_PACKAGES = /^(react|react-dom|preact|vue|svelte|solid-js|@angular\/core)(\/|$)/;

/**
 * Groups product files into runtime units and guesses each unit's kind from
 * framework markers: nested package.json / wrangler config, `electron`
 * imports, React/Vue imports, and shared/common folder names. A user-supplied
 * `runtimes` / `shared` mapping always wins.
 */
export function detectRuntimes(
  rootDir: string,
  files: RuntimeDetectionInput[],
  config: BuildViewConfig = {}
): Map<string, RuntimeInfo> {
  const result = new Map<string, RuntimeInfo>();
  const packageRootCache = new Map<string, string | null>();

  // Finds the nearest folder (below the repo root) that owns a package.json.
  const nestedPackageRoot = (relDir: string): string | null => {
    if (!relDir || relDir === '.') return null;
    if (packageRootCache.has(relDir)) return packageRootCache.get(relDir)!;
    let found: string | null = null;
    if (fs.existsSync(path.join(rootDir, relDir, 'package.json'))) {
      found = relDir;
    }
    const parent = path.posix.dirname(relDir);
    const parentRoot = parent === '.' ? null : nestedPackageRoot(parent);
    // The outermost nested package wins so packages/foo/src stays in packages/foo.
    const value = parentRoot || found;
    packageRootCache.set(relDir, value);
    return value;
  };

  const units = new Map<string, RuntimeDetectionInput[]>();
  const configured = config.runtimes ? Object.entries(config.runtimes) : [];

  for (const f of files) {
    const p = normalizePath(f.filePath);
    if (matchesAnyGlob(p, config.shared)) {
      result.set(p, { unit: 'shared', kind: 'shared', packageRoot: nestedPackageRoot(path.posix.dirname(p)) || '.' });
      continue;
    }
    const named = configured.find(([, globs]) => matchesAnyGlob(p, globs));
    if (named) {
      // Configured runtimes are explicit boundaries.
      result.set(p, {
        unit: named[0],
        kind: 'package',
        packageRoot: nestedPackageRoot(path.posix.dirname(p)) || '.',
        explicit: true,
      });
      continue;
    }
    const pkgRoot = nestedPackageRoot(path.posix.dirname(p));
    const unit = pkgRoot || (p.includes('/') ? p.split('/')[0] : '.');
    const list = units.get(unit) || [];
    list.push(f);
    units.set(unit, list);
  }

  for (const [unit, unitFiles] of units) {
    let kind: RuntimeKind = 'generic';
    const base = path.posix.basename(unit);
    const isNestedPackage = unit !== '.' && fs.existsSync(path.join(rootDir, unit, 'package.json'));
    const hasWrangler = unit !== '.' && ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'].some((w) =>
      fs.existsSync(path.join(rootDir, unit, w))
    );

    if (!config.shared && SHARED_DIR_NAMES.has(base) && !isNestedPackage) {
      kind = 'shared';
    } else if (hasWrangler) {
      kind = 'worker';
    } else if (isNestedPackage) {
      kind = 'package';
    } else if (unit !== '.') {
      const uiFiles = unitFiles.filter(
        (f) => /\.(tsx|jsx|vue|svelte)$/.test(f.filePath) || f.imports.some((i) => UI_PACKAGES.test(i))
      ).length;
      const electronFiles = unitFiles.filter((f) => f.imports.some((i) => i === 'electron' || i.startsWith('electron/'))).length;
      if (uiFiles >= Math.max(1, unitFiles.length * 0.3)) {
        kind = 'ui';
      } else if (electronFiles > 0) {
        kind = 'electron-main';
      }
    }

    const packageRoot = isNestedPackage ? unit : nestedPackageRoot(unit) || '.';
    for (const f of unitFiles) {
      result.set(normalizePath(f.filePath), { unit, kind, packageRoot });
    }
  }

  return result;
}

/**
 * Whether an import from one runtime unit into another crosses a boundary:
 * - into another package (nested package.json) via a relative/alias path;
 * - between runtimes declared in buildview.config.json `runtimes`;
 * - from UI/renderer code into Electron main-process code (it cannot run there).
 * Main-process code importing pure renderer helpers inside one package is
 * bundled fine and is not reported. Imports into `shared` are always allowed.
 */
export function crossesRuntimeBoundary(from: RuntimeInfo, to: RuntimeInfo): boolean {
  if (from.unit === to.unit || to.kind === 'shared') return false;
  if (from.explicit && to.explicit) return true;
  if (from.packageRoot !== to.packageRoot) return true;
  return from.kind === 'ui' && to.kind === 'electron-main';
}

/**
 * Files loaded by path or by the compiler rather than imported: ambient type
 * declarations, Electron preload scripts and worker scripts.
 */
export const CONVENTIONAL_ENTRY_GLOBS: readonly string[] = [
  '*.d.ts',
  'preload.{ts,js,mjs,cjs}',
  '*{Worker,-worker,.worker,_worker}.{ts,js,mjs,cjs}',
  // React Native / Expo platform variants, picked by the bundler instead of an import.
  '*.{web,native,ios,android}.{ts,tsx,js,jsx}',
  'examples',
];

function collectScriptPaths(command: string): string[] {
  const out: string[] = [];
  for (const token of command.split(/[\s"'=]+/)) {
    const t = token.replace(/^\.\//, '');
    if (/\.(c|m)?(j|t)sx?$/.test(t) && !t.startsWith('-') && !t.includes('*')) out.push(normalizePath(t));
  }
  return out;
}

function collectExportTargets(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(normalizePath(value));
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectExportTargets(v, out);
  }
}

/**
 * Files that are roots of the module graph: package.json `main` / `module` /
 * `bin` / `exports` targets and files run by npm `scripts`, `<script src>`
 * entries in index.html, and configured `entryPoints`. Build output paths
 * (`dist/...`) are mapped back to sources by basename when possible.
 */
export function collectEntryPoints(rootDir: string, allFiles: string[], config: BuildViewConfig = {}): Set<string> {
  const entries = new Set<string>();
  const files = allFiles.map(normalizePath);
  const fileSet = new Set(files);
  const raw: string[] = [];

  const pkgDirs = new Set<string>(['.']);
  const checkedDirs = new Set<string>();
  const WRANGLER_FILES = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];
  for (const f of files) {
    let dir = path.posix.dirname(f);
    while (dir !== '.' && dir !== '/' && !checkedDirs.has(dir)) {
      checkedDirs.add(dir);
      if (fs.existsSync(path.join(rootDir, dir, 'package.json'))) pkgDirs.add(dir);
      else if (WRANGLER_FILES.some((w) => fs.existsSync(path.join(rootDir, dir, w)))) pkgDirs.add(dir);
      dir = path.posix.dirname(dir);
    }
  }

  // Cloudflare Pages / Netlify / Firebase style file-routed functions.
  const frameworkGlobs: string[] = ['/functions', '/*/functions'];
  for (const dir of pkgDirs) {
    const prefix = dir === '.' ? '/' : `/${dir}/`;

    // Cloudflare Worker entry from wrangler config (`main = "src/index.ts"`).
    for (const w of fs.existsSync(path.join(rootDir, dir)) ? fs.readdirSync(path.join(rootDir, dir)) : []) {
      if (!/^wrangler.*\.(toml|json|jsonc)$/.test(w)) continue;
      const text = fs.readFileSync(path.join(rootDir, dir, w), 'utf-8');
      const m = text.match(/^\s*"?main"?\s*[=:]\s*"([^"]+)"/m);
      if (m) raw.push(dir === '.' ? normalizePath(m[1]) : `${dir}/${normalizePath(m[1])}`);
    }

    const pkgPath = path.join(rootDir, dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    let pkg: any;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      continue;
    }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    // File-based routers: every route file is an entry.
    if (deps['expo-router'] || deps['next'] || deps['@remix-run/react'] || deps['@sveltejs/kit'] || deps['astro'] || deps['nuxt']) {
      frameworkGlobs.push(`${prefix}app`, `${prefix}src/app`, `${prefix}pages`, `${prefix}src/pages`, `${prefix}src/routes`, `${prefix}app/routes`);
    }
    const local: string[] = [];
    for (const key of ['main', 'module', 'browser', 'types']) {
      if (typeof pkg[key] === 'string') local.push(normalizePath(pkg[key]));
    }
    if (typeof pkg.bin === 'string') local.push(normalizePath(pkg.bin));
    else collectExportTargets(pkg.bin, local);
    collectExportTargets(pkg.exports, local);
    for (const cmd of Object.values(pkg.scripts || {})) {
      if (typeof cmd === 'string') local.push(...collectScriptPaths(cmd));
    }
    for (const l of local) raw.push(dir === '.' ? l : `${dir}/${l}`);

    const htmlPath = path.join(rootDir, dir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
        const src = m[1].replace(/^\//, '');
        raw.push(dir === '.' ? src : `${dir}/${src}`);
      }
    }
  }

  const stripExt = (p: string) => p.replace(/\.(d\.ts|c?m?[jt]sx?)$/, '');
  const byNoExt = new Map<string, string>();
  const byBase = new Map<string, string[]>();
  for (const f of files) {
    byNoExt.set(stripExt(f), f);
    const base = path.posix.basename(stripExt(f));
    byBase.set(base, [...(byBase.get(base) || []), f]);
  }

  for (const r of raw) {
    const p = path.posix.normalize(r);
    if (fileSet.has(p)) {
      entries.add(p);
      continue;
    }
    const direct = byNoExt.get(stripExt(p));
    if (direct) {
      entries.add(direct);
      continue;
    }
    // Build output (dist-electron/main.js) -> source with the same basename outside build folders.
    if (/(^|\/)(dist[^/]*|build|out|lib)\//.test(p)) {
      const candidates = byBase.get(path.posix.basename(stripExt(p))) || [];
      if (candidates.length === 1) entries.add(candidates[0]);
      else for (const c of candidates) if (!c.includes('/node_modules/')) entries.add(c);
    }
  }

  for (const f of files) {
    if (
      matchesAnyGlob(f, config.entryPoints) ||
      matchesAnyGlob(f, frameworkGlobs) ||
      matchesAnyGlob(f, CONVENTIONAL_ENTRY_GLOBS)
    ) {
      entries.add(f);
    }
  }

  return entries;
}
