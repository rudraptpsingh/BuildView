import fs from 'fs';
import path from 'path';
import { normalizePath } from './glob.js';

interface PathAliasScope {
  /** Folder (repo-relative, '.' for root) that owns the tsconfig. */
  dir: string;
  /** baseUrl resolved to a repo-relative folder, if set. */
  baseUrl: string | null;
  paths: Array<{ pattern: string; targets: string[] }>;
}

const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs'];

/** Strips comments and trailing commas so tsconfig.json (JSONC) can be parsed. */
export function parseJsonc(text: string): any {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[++i] ?? '';
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Resolves import specifiers to repo-relative files: relative paths (with
 * `.js` -> `.ts` rewriting and `/index` files) and tsconfig `paths` aliases
 * (root and nested tsconfig.json files). Package imports resolve to null.
 */
export class ImportResolver {
  private readonly files: Set<string>;
  private readonly scopes: PathAliasScope[];

  constructor(rootDir: string, files: Iterable<string>, tsconfigDirs: string[] = ['.']) {
    this.files = new Set(Array.from(files, normalizePath));
    this.scopes = [];
    for (const dir of tsconfigDirs) {
      const scope = ImportResolver.readScope(rootDir, dir);
      if (scope) this.scopes.push(scope);
    }
    // Deepest scope first so nested packages use their own aliases.
    this.scopes.sort((a, b) => b.dir.length - a.dir.length);
  }

  private static readScope(rootDir: string, dir: string): PathAliasScope | null {
    const file = path.join(rootDir, dir, 'tsconfig.json');
    if (!fs.existsSync(file)) return null;
    try {
      const json = parseJsonc(fs.readFileSync(file, 'utf-8'));
      const opts = json?.compilerOptions || {};
      const baseUrl = typeof opts.baseUrl === 'string' ? normalizePath(path.posix.join(dir, opts.baseUrl)) : null;
      const paths: PathAliasScope['paths'] = [];
      for (const [pattern, targets] of Object.entries(opts.paths || {})) {
        if (Array.isArray(targets)) paths.push({ pattern, targets: targets.filter((t) => typeof t === 'string') });
      }
      if (!baseUrl && paths.length === 0) return null;
      return { dir: normalizePath(dir), baseUrl, paths };
    } catch {
      return null;
    }
  }

  /** Tries a path with source extensions and index files. */
  private probe(candidate: string): string | null {
    const p = path.posix.normalize(candidate);
    if (this.files.has(p)) return p;
    const jsMatch = p.match(/^(.*)\.(m|c)?jsx?$/);
    if (jsMatch) {
      for (const ext of ['.ts', '.tsx', '.mts', '.cts']) {
        if (this.files.has(jsMatch[1] + ext)) return jsMatch[1] + ext;
      }
    }
    for (const ext of SOURCE_EXTS) {
      if (this.files.has(p + ext)) return p + ext;
    }
    for (const ext of SOURCE_EXTS) {
      if (this.files.has(`${p}/index${ext}`)) return `${p}/index${ext}`;
    }
    return null;
  }

  resolve(fromFile: string, specifier: string): string | null {
    const spec = specifier.split('?')[0];
    if (!spec) return null;
    const from = normalizePath(fromFile);

    if (spec.startsWith('.')) {
      return this.probe(path.posix.join(path.posix.dirname(from), spec));
    }
    if (spec.startsWith('/')) return null;

    for (const scope of this.scopes) {
      if (scope.dir !== '.' && !from.startsWith(`${scope.dir}/`)) continue;
      const base = scope.baseUrl ?? scope.dir;
      for (const { pattern, targets } of scope.paths) {
        const star = pattern.indexOf('*');
        let captured: string | null = null;
        if (star === -1) {
          if (spec === pattern) captured = '';
        } else {
          const prefix = pattern.slice(0, star);
          const suffix = pattern.slice(star + 1);
          if (spec.startsWith(prefix) && spec.endsWith(suffix) && spec.length >= prefix.length + suffix.length) {
            captured = spec.slice(prefix.length, spec.length - suffix.length);
          }
        }
        if (captured === null) continue;
        for (const target of targets) {
          const hit = this.probe(path.posix.join(base, target.replace('*', captured)));
          if (hit) return hit;
        }
      }
      if (scope.baseUrl) {
        const hit = this.probe(path.posix.join(scope.baseUrl, spec));
        if (hit) return hit;
      }
    }
    return null;
  }
}
