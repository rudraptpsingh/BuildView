import path from 'path';
import { ParsedFileResult } from './repo-parser.js';
import { WasteMetrics, DuplicateCodeItem, UnusedExportDetail } from '../../shared/types.js';
import type { FileEdge } from '../analysis/dependency-graph.js';
import { normalizePath } from '../analysis/glob.js';

export interface ExportedSymbolDetail {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type';
  file: string;
  line: number;
  loc: number;
  /** For unused exports: still referenced inside its own file, or dead everywhere. */
  usage?: 'local_only' | 'dead';
}

export interface WasteAnalysisOptions {
  /** Resolved imports (tsconfig aliases, .js -> .ts, index files) used for orphan detection. */
  fileEdges?: FileEdge[];
}

function toUnusedDetail(e: ExportedSymbolDetail): UnusedExportDetail {
  const usage = e.usage ?? 'dead';
  return {
    name: e.name,
    file: e.file,
    line: e.line,
    kind: e.kind,
    usage,
    severity: usage === 'dead' ? 'medium' : 'low',
    message:
      usage === 'dead'
        ? `symbol never referenced anywhere (dead): ${e.name} at ${e.file}:${e.line}`
        : `export not needed (used only in file): ${e.name} at ${e.file}:${e.line}`,
  };
}

export interface WasteAnalysisResult {
  fileWaste: Map<string, WasteMetrics>;
  repoWaste: WasteMetrics;
  allUnusedExports: ExportedSymbolDetail[];
  allDuplicates: DuplicateCodeItem[];
  allTestZombies: ExportedSymbolDetail[];
  allOrphanFiles: string[];
}

export class WasteDetector {
  private static ENTRY_PATTERNS = [
    /index\.(ts|tsx|js|jsx)$/,
    /main\.(ts|tsx|js|jsx)$/,
    /app\.(ts|tsx|js|jsx)$/,
    /api\.(ts|tsx|js|jsx)$/,
    /cli\.(ts|tsx|js|jsx)$/,
    /server\.(ts|tsx|js|jsx)$/,
    /vite\.config\.(ts|js)$/,
    /vitest\.config\.(ts|js)$/,
  ];

  /**
   * Normalizes a function body for duplication detection:
   * Strips whitespace, comments, and standard variable prefixes.
   */
  public static normalizeBody(bodySnippet: string): string {
    return bodySnippet
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') // remove comments
      .replace(/\s+/g, '') // remove whitespace
      .toLowerCase();
  }

  /**
   * Determines if a relative import path matches a target file.
   */
  public static matchesImport(importerPath: string, specifier: string, targetPath: string): boolean {
    if (specifier.startsWith('.')) {
      const resolvedDir = path.dirname(importerPath);
      const resolved = path.normalize(path.join(resolvedDir, specifier));
      const targetNoExt = targetPath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
      return resolved === targetNoExt || resolved.replace(/\\/g, '/') === targetNoExt.replace(/\\/g, '/');
    }
    // Check alias or package match
    const baseTarget = path.basename(targetPath).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
    const baseSpecifier = path.basename(specifier);
    return baseTarget === baseSpecifier;
  }

  /**
   * Performs full repository waste, duplication, and reachability analysis.
   */
  public static analyzeRepository(
    sourceFiles: ParsedFileResult[],
    testFiles: ParsedFileResult[],
    entryFiles: string[] = [],
    options: WasteAnalysisOptions = {}
  ): WasteAnalysisResult {
    const allFiles = [...sourceFiles, ...testFiles];
    const entrySet = new Set(entryFiles.map(normalizePath));
    const localRefs = new Map<string, Record<string, number>>();
    for (const f of sourceFiles) localRefs.set(f.filePath, f.localReferenceCounts || {});
    const fileWaste = new Map<string, WasteMetrics>();

    // Pre-index source files for O(1) import resolution
    const fileByNormalizedNoExt = new Map<string, string>();
    const fileByBasenameNoExt = new Map<string, string[]>();

    for (const target of sourceFiles) {
      const norm = target.filePath.replace(/\\/g, '/');
      const noExt = norm.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
      fileByNormalizedNoExt.set(noExt, target.filePath);

      const base = path.basename(norm).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
      const existing = fileByBasenameNoExt.get(base) || [];
      existing.push(target.filePath);
      fileByBasenameNoExt.set(base, existing);
    }

    // 1. Collect all exported symbols
    const allExports: ExportedSymbolDetail[] = [];
    for (const file of sourceFiles) {
      if (file.exportedSymbols) {
        for (const exp of file.exportedSymbols) {
          allExports.push({
            ...exp,
            file: file.filePath,
          });
        }
      }
    }

    // 2. Map symbol usages across prod files and test files
    const prodSymbolUsages = new Map<string, Set<string>>(); // symbol -> set of filePaths using it
    const testSymbolUsages = new Map<string, Set<string>>();
    const incomingFileImports = new Map<string, Set<string>>(); // targetFile -> set of importer files

    for (const file of allFiles) {
      const details = file.importDetails || [];
      const isTest = file.isTestFile;
      const fileDir = path.dirname(file.filePath).replace(/\\/g, '/');

      for (const imp of details) {
        for (const sym of imp.importedSymbols) {
          const targetUsageMap = isTest ? testSymbolUsages : prodSymbolUsages;
          if (!targetUsageMap.has(sym)) {
            targetUsageMap.set(sym, new Set());
          }
          targetUsageMap.get(sym)!.add(file.filePath);
        }

        // Fast O(1) resolution:
        if (imp.specifier.startsWith('.')) {
          const resolved = path.normalize(path.join(fileDir, imp.specifier)).replace(/\\/g, '/');
          const targetPath = fileByNormalizedNoExt.get(resolved) || fileByNormalizedNoExt.get(`${resolved}/index`);
          if (targetPath) {
            if (!incomingFileImports.has(targetPath)) {
              incomingFileImports.set(targetPath, new Set());
            }
            incomingFileImports.get(targetPath)!.add(file.filePath);
          }
        } else {
          const base = path.basename(imp.specifier);
          const targets = fileByBasenameNoExt.get(base);
          if (targets) {
            for (const t of targets) {
              if (!incomingFileImports.has(t)) {
                incomingFileImports.set(t, new Set());
              }
              incomingFileImports.get(t)!.add(file.filePath);
            }
          }
        }
      }
    }

    for (const edge of options.fileEdges || []) {
      if (!incomingFileImports.has(edge.to)) incomingFileImports.set(edge.to, new Set());
      incomingFileImports.get(edge.to)!.add(edge.from);
    }

    // 3. Classify Unused Exports & Test Zombies
    const allUnusedExports: ExportedSymbolDetail[] = [];
    const allTestZombies: ExportedSymbolDetail[] = [];

    for (const exp of allExports) {
      const isEntry = entrySet.has(normalizePath(exp.file)) ||
        entryFiles.some((ef) => exp.file.includes(ef)) ||
        this.ENTRY_PATTERNS.some((pat) => pat.test(exp.file));

      if (isEntry) continue; // Entrypoints always keep their exports

      const prodUsers = prodSymbolUsages.get(exp.name);
      const testUsers = testSymbolUsages.get(exp.name);

      const hasProdCaller = prodUsers && Array.from(prodUsers).some((f) => f !== exp.file);
      const hasTestCaller = testUsers && testUsers.size > 0;

      if (!hasProdCaller && !hasTestCaller) {
        const refs = localRefs.get(exp.file)?.[exp.name] || 0;
        allUnusedExports.push({ ...exp, usage: refs > 0 ? 'local_only' : 'dead' });
      } else if (!hasProdCaller && hasTestCaller) {
        allTestZombies.push(exp);
      }
    }

    // 4. Duplicate Functions Detection
    const allDuplicates: DuplicateCodeItem[] = [];
    const normalizedMap = new Map<string, { name: string; file: string; body: string }>();

    for (const file of sourceFiles) {
      if (file.functionDetails) {
        for (const fn of file.functionDetails) {
          if (!fn.bodySnippet || fn.bodySnippet.length < 25) continue; // ignore trivial 1-liners

          const normalized = this.normalizeBody(fn.bodySnippet);
          if (normalized.length < 20) continue;

          if (normalizedMap.has(normalized)) {
            const existing = normalizedMap.get(normalized)!;
            if (existing.file !== file.filePath) {
              allDuplicates.push({
                name: fn.name,
                sourceFile: file.filePath,
                duplicateOfFile: existing.file,
                similarity: 1.0,
                reason: `Identical logic body matching "${existing.name}" in ${path.basename(existing.file)}`,
              });
            }
          } else {
            normalizedMap.set(normalized, {
              name: fn.name,
              file: file.filePath,
              body: fn.bodySnippet,
            });
          }
        }
      }
    }

    // 5. Detect Orphan Files
    const allOrphanFiles: string[] = [];
    for (const file of sourceFiles) {
      const isEntry = entrySet.has(normalizePath(file.filePath)) ||
        entryFiles.some((ef) => file.filePath.includes(ef)) ||
        this.ENTRY_PATTERNS.some((pat) => pat.test(file.filePath));

      if (isEntry) continue;

      const importers = incomingFileImports.get(file.filePath) || incomingFileImports.get(normalizePath(file.filePath));
      if (!importers || importers.size === 0) {
        allOrphanFiles.push(file.filePath);
      }
    }

    // 6. Build File-Level Waste Metrics
    for (const file of sourceFiles) {
      const fileUnusedDetails = allUnusedExports.filter((e) => e.file === file.filePath);
      const fileUnused = fileUnusedDetails.map((e) => e.name);

      const fileZombies = allTestZombies
        .filter((e) => e.file === file.filePath)
        .map((e) => e.name);

      const fileDups = allDuplicates.filter((d) => d.sourceFile === file.filePath);
      const isOrphan = allOrphanFiles.includes(file.filePath);

      const deadCodeLines = fileUnusedDetails
        .filter((e) => e.usage !== 'local_only')
        .reduce((sum, e) => sum + e.loc, 0);

      const penalties = fileUnused.length * 15 + fileDups.length * 20 + (isOrphan ? 30 : 0);
      const cleanlinessScore = Math.max(0, Math.min(100, 100 - penalties));

      let recommendation: 'prune' | 'investigate' | 'clean' = 'clean';
      if (fileUnused.length > 0 || fileDups.length > 0 || isOrphan) {
        recommendation = 'prune';
      } else if (fileZombies.length > 0) {
        recommendation = 'investigate';
      }

      fileWaste.set(file.filePath, {
        unusedExports: fileUnused,
        unusedExportDetails: fileUnusedDetails.map(toUnusedDetail),
        deadCodeLines,
        duplicateFunctions: fileDups,
        orphanFiles: isOrphan ? [file.filePath] : [],
        testZombies: fileZombies,
        cleanlinessScore,
        recommendation,
      });
    }

    // 7. Overall Repo Waste Metrics
    const totalDeadLines = allUnusedExports.filter((e) => e.usage !== 'local_only').reduce((acc, e) => acc + e.loc, 0);
    const repoPenalties = allUnusedExports.length * 5 + allDuplicates.length * 10 + allOrphanFiles.length * 15;
    const repoCleanliness = Math.max(0, Math.min(100, 100 - repoPenalties));

    let repoRec: 'prune' | 'investigate' | 'clean' = 'clean';
    if (allUnusedExports.length > 0 || allDuplicates.length > 0 || allOrphanFiles.length > 0) {
      repoRec = 'prune';
    } else if (allTestZombies.length > 0) {
      repoRec = 'investigate';
    }

    const repoWaste: WasteMetrics = {
      unusedExports: allUnusedExports.map((e) => `${path.basename(e.file)}:${e.name}`),
      unusedExportDetails: allUnusedExports.map(toUnusedDetail),
      deadCodeLines: totalDeadLines,
      duplicateFunctions: allDuplicates,
      orphanFiles: allOrphanFiles,
      testZombies: allTestZombies.map((e) => `${path.basename(e.file)}:${e.name}`),
      cleanlinessScore: repoCleanliness,
      recommendation: repoRec,
    };

    return {
      fileWaste,
      repoWaste,
      allUnusedExports,
      allDuplicates,
      allTestZombies,
      allOrphanFiles,
    };
  }

  /**
   * Computes component waste metrics by aggregating waste across its assigned source files.
   */
  public static getComponentWaste(
    componentFiles: string[],
    fileWasteMap: Map<string, WasteMetrics>
  ): WasteMetrics {
    const unusedExports: string[] = [];
    const unusedExportDetails: UnusedExportDetail[] = [];
    let deadCodeLines = 0;
    const duplicateFunctions: DuplicateCodeItem[] = [];
    const orphanFiles: string[] = [];
    const testZombies: string[] = [];

    for (const filePath of componentFiles) {
      // Find matching entry in fileWasteMap (by exact or partial match)
      for (const [key, metrics] of fileWasteMap.entries()) {
        if (key.includes(filePath) || filePath.includes(key)) {
          unusedExports.push(...metrics.unusedExports.map((u) => `${path.basename(key)}:${u}`));
          unusedExportDetails.push(...(metrics.unusedExportDetails || []));
          deadCodeLines += metrics.deadCodeLines;
          duplicateFunctions.push(...metrics.duplicateFunctions);
          orphanFiles.push(...metrics.orphanFiles);
          testZombies.push(...metrics.testZombies.map((z) => `${path.basename(key)}:${z}`));
        }
      }
    }

    const penalties = unusedExports.length * 10 + duplicateFunctions.length * 15 + orphanFiles.length * 20;
    const cleanlinessScore = Math.max(0, Math.min(100, 100 - penalties));

    let recommendation: 'prune' | 'investigate' | 'clean' = 'clean';
    if (unusedExports.length > 0 || duplicateFunctions.length > 0 || orphanFiles.length > 0) {
      recommendation = 'prune';
    } else if (testZombies.length > 0) {
      recommendation = 'investigate';
    }

    return {
      unusedExports,
      unusedExportDetails,
      deadCodeLines,
      duplicateFunctions,
      orphanFiles,
      testZombies,
      cleanlinessScore,
      recommendation,
    };
  }
}
