import fs from 'fs';
import path from 'path';
import { BuildViewStore } from './store.js';
import { BuildViewProject, ArchitectureLayer } from '../shared/types.js';
import { RepoParser, ParsedFileResult } from './parser/repo-parser.js';
import { WasteDetector, WasteAnalysisResult } from './parser/waste-detector.js';
import { ArchitectureClusterer } from './parser/architecture-clusterer.js';
import { ArchitectureRulesEngine, ArchitectureRuleAnalysisResult } from './parser/architecture-rules.js';
import { DesignRulesEngine } from './analysis/design-rules.js';
import { PerformanceLinter } from './analysis/performance-lint.js';
import { ElectronAnalyzer } from './analysis/electron-analyzer.js';
import { ReachabilityAnalyzer, ReachabilityResult } from './analysis/reachability-analyzer.js';
import { RatchetManager } from './analysis/ratchet-manager.js';
import { BuildViewConfig, loadBuildViewConfig, validateConfig } from './analysis/config.js';
import { classifyFileRole, collectEntryPoints, detectRuntimes } from './analysis/file-roles.js';
import { ImportResolver } from './analysis/import-resolver.js';
import { buildFileEdges, FileClassification, FileEdge } from './analysis/dependency-graph.js';
import { normalizePath } from './analysis/glob.js';
import { ArchitectureScorer } from './analysis/scorer.js';

export interface ScanOptions {
  projectName?: string;
  projectDescription?: string;
  customLayers?: ArchitectureLayer[];
  /** Use this config instead of reading buildview.config.json / package.json#buildview. */
  config?: BuildViewConfig;
  /** Path (relative to the repo) of a config file to read instead of buildview.config.json. */
  configPath?: string;
  /**
   * Where to write the architecture artifact. Defaults to
   * `<repo>/buildview-architecture.json`; `false` skips writing.
   */
  outputPath?: string | false;
}

export interface DetailedScanResult {
  project: BuildViewProject;
  waste: WasteAnalysisResult;
  rules: ArchitectureRuleAnalysisResult;
  reachability: ReachabilityResult;
  parsedFiles: ParsedFileResult[];
  fileEdges: FileEdge[];
  fileInfo: Map<string, FileClassification>;
  config: BuildViewConfig;
  /** File the config came from, or null when auto-detected. */
  configSource: string | null;
  /** Absolute path of the written artifact, or null when not written. */
  artifactPath: string | null;
}

export class RepoScannerService {
  /**
   * Scans ANY arbitrary repository on disk, analyzes AST, detects waste,
   * clusters files into cohesive architectural components, and updates the BuildView store.
   */
  public static async scanRepository(
    store: BuildViewStore,
    repoPath: string,
    options: ScanOptions = {}
  ): Promise<BuildViewProject> {
    return (await this.scanRepositoryDetailed(store, repoPath, options)).project;
  }

  /** Same as scanRepository, but also returns the waste, rule and file-graph analysis. */
  public static async scanRepositoryDetailed(
    store: BuildViewStore,
    repoPath: string,
    options: ScanOptions = {}
  ): Promise<DetailedScanResult> {
    const resolvedPath = path.resolve(process.cwd(), repoPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Target repository not found at path: ${resolvedPath}`);
    }

    // Auto-detect project name and description from package.json if available
    let projectName = options.projectName;
    let projectDescription = options.projectDescription;

    const pkgPath = path.join(resolvedPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (!projectName && pkg.name) {
          projectName = pkg.name;
        }
        if (!projectDescription && pkg.description) {
          projectDescription = pkg.description;
        }
      } catch (err) {
        // Fall back to folder name
      }
    }

    if (!projectName) {
      projectName = path.basename(resolvedPath);
    }
    if (!projectDescription) {
      projectDescription = `Architecture map dynamically scanned from ${resolvedPath}`;
    }

    const loaded = options.config
      ? { config: validateConfig(options.config), source: null }
      : loadBuildViewConfig(resolvedPath, options.configPath);
    const config = loaded.config;

    // 1. AST scan of source files and test files (with persistent disk cache)
    const cacheDir = path.join(resolvedPath, 'node_modules', '.cache', 'buildview');
    const cacheFile = path.join(cacheDir, 'ast-cache.json');
    RepoParser.loadDiskCache(cacheFile);

    const repoScan = RepoParser.scanRepository(resolvedPath, {
      testGlobs: config.testGlobs,
      ignoreGlobs: config.ignoreGlobs,
    });

    RepoParser.saveDiskCache(cacheFile);

    // 2. Classify files (product / test / tooling) and their runtimes, then resolve every import
    const fileInfo = new Map<string, FileClassification>();
    for (const f of repoScan.testFiles) fileInfo.set(normalizePath(f.filePath), { role: 'test' });
    const productFiles = [];
    for (const f of repoScan.sourceFiles) {
      const role = classifyFileRole(f.filePath, config, resolvedPath);
      fileInfo.set(normalizePath(f.filePath), { role: role === 'test' ? 'product' : role });
      if (role !== 'tooling') productFiles.push(f);
    }
    const runtimes = detectRuntimes(resolvedPath, productFiles, config);
    for (const [p, runtime] of runtimes) {
      const info = fileInfo.get(p);
      if (info) info.runtime = runtime;
    }

    const allParsed = [...repoScan.sourceFiles, ...repoScan.testFiles];
    const resolver = new ImportResolver(resolvedPath, allParsed.map((f) => f.filePath), repoScan.tsconfigDirs);
    const fileEdges = buildFileEdges(allParsed, resolver);

    // 3. Dead code & waste analysis (entry points and tooling files are roots, not orphans)
    const entryPoints = collectEntryPoints(resolvedPath, repoScan.sourceFiles.map((f) => f.filePath), config);
    for (const [p, info] of fileInfo) if (info.role === 'tooling') entryPoints.add(p);
    const wasteAnalysis = WasteDetector.analyzeRepository(repoScan.sourceFiles, repoScan.testFiles, Array.from(entryPoints), {
      fileEdges,
    });

    // 4. Cluster into architecture components
    const layers: ArchitectureLayer[] =
      options.customLayers ||
      (config.layers
        ? config.layers.map(({ include: _include, ...layer }) => ({
            ...layer,
            description: layer.description || `Files matching ${_include.join(', ')}`,
          }))
        : ArchitectureClusterer.DEFAULT_UNIVERSAL_LAYERS);
    const components = ArchitectureClusterer.autoClusterRepository(
      repoScan.sourceFiles,
      repoScan.testFiles,
      layers,
      wasteAnalysis,
      { fileEdges, fileInfo, layerConfig: options.customLayers ? undefined : config.layers }
    );

    // 5. Validate Architecture Invariants & Circular Dependencies (product code only)
    const fileToComponent = new Map<string, string>();
    for (const comp of components) {
      for (const f of comp.files) fileToComponent.set(normalizePath(f.path), comp.id);
    }
    const ruleAnalysis = ArchitectureRulesEngine.analyzeArchitecture(components, layers, {
      fileEdges,
      fileInfo,
      fileToComponent,
      allowedEdges: config.allowedEdges,
    });
    ArchitectureRulesEngine.attachRuleGapsToComponents(components, ruleAnalysis);

    // 6. Dynamic FigBridge / Design System Integration (if figbridge.connect.json exists)
    let figmaBridgeSummary: { fileKey?: string; totalMappedComponents: number } | undefined;
    const figbridgePath = path.join(resolvedPath, 'figbridge.connect.json');
    if (fs.existsSync(figbridgePath)) {
      try {
        const figData = JSON.parse(fs.readFileSync(figbridgePath, 'utf-8'));
        const figmaItems = Array.isArray(figData.components) ? figData.components : [];
        figmaBridgeSummary = {
          fileKey: figData.fileKey,
          totalMappedComponents: figmaItems.length,
        };

        // Correlate Figma mapped elements to actual codebase components
        for (const item of figmaItems) {
          const codeSource = item.code?.source;
          if (!codeSource) continue;
          const normSource = codeSource.replace(/\\/g, '/');

          for (const comp of components) {
            const match = comp.files.some((f) => {
              const fNorm = f.path.replace(/\\/g, '/');
              return fNorm === normSource || fNorm.endsWith(normSource) || normSource.endsWith(fNorm);
            });

            if (match) {
              if (!comp.figmaComponents) comp.figmaComponents = [];
              comp.figmaComponents.push({
                name: item.figma?.name || 'Figma Component',
                nodeId: item.figma?.nodeId || '',
                source: codeSource,
                exportName: item.code?.export,
              });
            }
          }
        }
      } catch (err) {
        // Ignore invalid json
      }
    }

    // 6b. Design Rules, Token Compliance & Testid Reachability
    const designAnalysis = DesignRulesEngine.analyzeDesignRules(resolvedPath, components);
    if (designAnalysis.gaps.length > 0) {
      for (const gap of designAnalysis.gaps) {
        const targetComp = components.find((c) => c.layerId === 'layer_presentation') || components[0];
        if (targetComp) targetComp.gaps.push(gap);
      }
    }

    // 6c. Performance Hotpath Linter (Blocking synchronous I/O and event loop stalls)
    const perfAnalysis = PerformanceLinter.analyzePerformance(resolvedPath, components);
    if (perfAnalysis.gaps.length > 0) {
      for (const gap of perfAnalysis.gaps) {
        const targetComp = components.find((c) => c.layerId === 'layer_presentation') || components[0];
        if (targetComp) targetComp.gaps.push(gap);
      }
    }

    // 6d. Electron Process Topology, Preload Surface & Security Invariants
    const electronAnalysis = ElectronAnalyzer.analyzeElectronApp(resolvedPath, components);
    if (electronAnalysis.gaps.length > 0) {
      for (const gap of electronAnalysis.gaps) {
        const targetComp = components.find((c) => c.layerId === 'layer_presentation' || c.id.includes('electron')) || components[0];
        if (targetComp) targetComp.gaps.push(gap);
      }
    }

    // 6e. Whole-Repo Reachability (Unmounted UI components, orphan preload bridge APIs, phantom testids)
    const allParsedFiles = repoScan.sourceFiles.concat(repoScan.testFiles);
    const reachabilityAnalysis = ReachabilityAnalyzer.analyzeReachability(resolvedPath, allParsedFiles, fileEdges);
    if (reachabilityAnalysis.gaps.length > 0) {
      for (const gap of reachabilityAnalysis.gaps) {
        const targetComp = components.find((c) => c.layerId === 'layer_presentation') || components[0];
        if (targetComp) targetComp.gaps.push(gap);
      }
    }

    const project: BuildViewProject = {
      id: `proj_${projectName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
      name: projectName,
      description: projectDescription,
      version: '1.0.0',
      layers,
      components,
      figmaBridge: figmaBridgeSummary,
      lastUpdated: new Date().toISOString(),
    };

    project.healthScore = ArchitectureScorer.calculateHealthScore(project, wasteAnalysis, ruleAnalysis);

    // 7. Write out architecture map JSON artifact (in the target repository unless redirected)
    let artifactPath: string | null = null;
    if (options.outputPath !== false) {
      const outputArtifactPath = options.outputPath
        ? path.resolve(process.cwd(), options.outputPath)
        : path.join(resolvedPath, 'buildview-architecture.json');
      try {
        fs.mkdirSync(path.dirname(outputArtifactPath), { recursive: true });
        fs.writeFileSync(outputArtifactPath, JSON.stringify(project, null, 2), 'utf-8');
        artifactPath = outputArtifactPath;
      } catch (err) {
        // Non-fatal if target directory is read-only
      }
    }

    // 8. Reset project in store and broadcast to live visualizers
    store.resetProject(project);

    return {
      project,
      waste: wasteAnalysis,
      rules: ruleAnalysis,
      reachability: reachabilityAnalysis,
      parsedFiles: allParsed,
      fileEdges,
      fileInfo,
      config,
      configSource: loaded.source,
      artifactPath,
    };
  }
}
