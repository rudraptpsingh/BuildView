/**
 * Minimal glob matcher (no dependencies) for repo-relative POSIX paths.
 *
 * Supported syntax: `**` (any number of path segments), `*` (anything but `/`),
 * `?` (one char but `/`) and `{a,b}` alternation.
 *
 * Semantics follow .gitignore conventions:
 * - a pattern without a `/` matches at any depth (`*.test.ts`, `fixtures`);
 * - a pattern matches a file or any file below a matching directory
 *   (`legacy` and `legacy/**` both match `legacy/old.ts`).
 */
const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;

  let pattern = glob.replace(/\\/g, '/').trim();
  if (pattern.startsWith('./')) pattern = pattern.slice(2);
  const anchored = pattern.startsWith('/') || pattern.replace(/\/+$/, '').includes('/');
  pattern = pattern.replace(/^\/+/, '').replace(/\/+$/, '');

  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        const atSegmentStart = i === 0 || pattern[i - 1] === '/';
        const followedBySlash = pattern[i + 2] === '/';
        if (atSegmentStart && followedBySlash) {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '{') {
      const end = pattern.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
      } else {
        const alts = pattern.slice(i + 1, end).split(',').map((a) => a.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'));
        re += `(?:${alts.join('|')})`;
        i = end;
      }
    } else if ('.+^$()|[]\\'.includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }

  const prefix = anchored ? '^' : '^(?:.*/)?';
  const compiled = new RegExp(`${prefix}${re}(?:/.*)?$`);
  cache.set(glob, compiled);
  return compiled;
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function matchesGlob(filePath: string, glob: string): boolean {
  return globToRegExp(glob).test(normalizePath(filePath));
}

export function matchesAnyGlob(filePath: string, globs: readonly string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  const p = normalizePath(filePath);
  return globs.some((g) => globToRegExp(g).test(p));
}
