import fs from 'fs';
import path from 'path';

/** A layer declared by glob in buildview.config.json. */
export interface BuildViewLayerConfig {
  id: string;
  name: string;
  /** 0 = foundation; higher numbers sit higher in the stack. */
  order: number;
  description?: string;
  color?: string;
  /** Files matching any of these globs belong to this layer. */
  include: string[];
}

/** An edge that is allowed even if it would otherwise be reported. */
export interface AllowedEdgeConfig {
  from: string;
  to: string;
  reason?: string;
}

/**
 * Repository configuration, read from `buildview.config.json` or the
 * `buildview` key of package.json. Every key is optional; auto-detection
 * fills anything that is left out.
 */
export interface BuildViewConfig {
  /** Replaces the default layer taxonomy. Components are assigned by glob. */
  layers?: BuildViewLayerConfig[];
  /** Extra globs that mark files as tests (added to the built-in list). */
  testGlobs?: string[];
  /** Extra globs that mark files as build tooling / scripts. */
  toolingGlobs?: string[];
  /** Files or folders that are not scanned at all. */
  ignoreGlobs?: string[];
  /** Files that are roots (never orphans, exports always kept). */
  entryPoints?: string[];
  /** Imports that are allowed even when they cross a layer or runtime boundary. */
  allowedEdges?: AllowedEdgeConfig[];
  /** Named runtimes (deployable units) declared by glob, e.g. { "main": ["electron/**"] }. */
  runtimes?: Record<string, string[]>;
  /** Globs for shared code that any runtime may import, and that must not import app code. */
  shared?: string[];
}

export interface LoadedConfig {
  config: BuildViewConfig;
  /** File the config came from, or null when auto-detecting. */
  source: string | null;
}

export const CONFIG_FILE_NAME = 'buildview.config.json';

function asStringArray(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`buildview config: "${key}" must be an array of glob strings`);
  }
  return value as string[];
}

export function validateConfig(raw: unknown): BuildViewConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('buildview config must be a JSON object');
  }
  const r = raw as Record<string, unknown>;
  const config: BuildViewConfig = {
    testGlobs: asStringArray(r.testGlobs, 'testGlobs'),
    toolingGlobs: asStringArray(r.toolingGlobs, 'toolingGlobs'),
    ignoreGlobs: asStringArray(r.ignoreGlobs, 'ignoreGlobs'),
    entryPoints: asStringArray(r.entryPoints, 'entryPoints'),
    shared: asStringArray(r.shared, 'shared'),
  };

  if (r.layers !== undefined) {
    if (!Array.isArray(r.layers)) throw new Error('buildview config: "layers" must be an array');
    config.layers = r.layers.map((l: any, i: number) => {
      if (!l || typeof l.id !== 'string' || typeof l.name !== 'string') {
        throw new Error(`buildview config: layers[${i}] needs string "id" and "name"`);
      }
      return {
        id: l.id,
        name: l.name,
        order: typeof l.order === 'number' ? l.order : i,
        description: typeof l.description === 'string' ? l.description : undefined,
        color: typeof l.color === 'string' ? l.color : undefined,
        include: asStringArray(l.include, `layers[${i}].include`) || [],
      };
    });
  }

  if (r.allowedEdges !== undefined) {
    if (!Array.isArray(r.allowedEdges)) throw new Error('buildview config: "allowedEdges" must be an array');
    config.allowedEdges = r.allowedEdges.map((e: any, i: number) => {
      if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') {
        throw new Error(`buildview config: allowedEdges[${i}] needs string "from" and "to" globs`);
      }
      return { from: e.from, to: e.to, reason: typeof e.reason === 'string' ? e.reason : undefined };
    });
  }

  if (r.runtimes !== undefined) {
    if (!r.runtimes || typeof r.runtimes !== 'object' || Array.isArray(r.runtimes)) {
      throw new Error('buildview config: "runtimes" must be an object of { name: [globs] }');
    }
    config.runtimes = {};
    for (const [name, globs] of Object.entries(r.runtimes as Record<string, unknown>)) {
      config.runtimes[name] = asStringArray(globs, `runtimes.${name}`) || [];
    }
  }

  return config;
}

/**
 * Loads `buildview.config.json` (or a given path), falling back to the
 * `buildview` key in package.json. Returns an empty config when neither exists.
 */
export function loadBuildViewConfig(rootDir: string, explicitPath?: string): LoadedConfig {
  const candidates = explicitPath
    ? [path.resolve(rootDir, explicitPath)]
    : [path.join(rootDir, CONFIG_FILE_NAME)];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return { config: validateConfig(raw), source: file };
    }
    if (explicitPath) throw new Error(`buildview config not found: ${file}`);
  }

  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg && pkg.buildview) {
        return { config: validateConfig(pkg.buildview), source: `${pkgPath}#buildview` };
      }
    } catch (err: any) {
      if (String(err?.message || '').startsWith('buildview config')) throw err;
    }
  }

  return { config: {}, source: null };
}
