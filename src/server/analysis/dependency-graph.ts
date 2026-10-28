import { normalizePath } from './glob.js';
import { ImportResolver } from './import-resolver.js';
import type { FileRole, RuntimeInfo } from './file-roles.js';
import type { ParsedFileResult } from '../parser/repo-parser.js';

/** One resolved import between two files in the repository. */
export interface FileEdge {
  from: string;
  to: string;
  /** 1-based line of the import in `from`. */
  line: number;
  specifier: string;
  /** Erased at build time (`import type`). */
  typeOnly: boolean;
  kind: 'import' | 'reexport' | 'dynamic' | 'require';
}

/** Everything the rules engine knows about one file. */
export interface FileClassification {
  role: FileRole;
  /** Runtime unit (product files only). */
  runtime?: RuntimeInfo;
}

/** Resolves every import of every parsed file to a repo file (package imports are dropped). */
export function buildFileEdges(files: ParsedFileResult[], resolver: ImportResolver): FileEdge[] {
  const edges: FileEdge[] = [];
  for (const file of files) {
    const from = normalizePath(file.filePath);
    for (const imp of file.importDetails || []) {
      const to = resolver.resolve(from, imp.specifier);
      if (!to || to === from) continue;
      edges.push({
        from,
        to,
        line: imp.line ?? 0,
        specifier: imp.specifier,
        typeOnly: !!imp.isTypeOnly,
        kind: imp.kind ?? 'import',
      });
    }
  }
  return edges;
}

/** `file:line` label used in reports. */
export function formatEdgeLocation(edge: Pick<FileEdge, 'from' | 'line'>): string {
  return edge.line > 0 ? `${edge.from}:${edge.line}` : edge.from;
}
