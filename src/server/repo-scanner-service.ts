import fs from 'fs';
import path from 'path';
import { BuildViewStore } from './store.js';
import { BuildViewProject, ArchitectureLayer } from '../shared/types.js';
import { RepoParser } from './parser/repo-parser.js';
import { WasteDetector } from './parser/waste-detector.js';
import { ArchitectureClusterer } from './parser/architecture-clusterer.js';
import { ArchitectureRulesEngine } from './parser/architecture-rules.js';

export interface ScanOptions {
  projectName?: string;
  projectDescription?: string;
  customLayers?: ArchitectureLayer[];
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

    // 1. AST scan of source files and test files
    const repoScan = RepoParser.scanRepository(resolvedPath);

    // 2. Dead code & waste analysis
    const wasteAnalysis = WasteDetector.analyzeRepository(repoScan.sourceFiles, repoScan.testFiles);

    // 3. Cluster into architecture components
    const layers = options.customLayers || ArchitectureClusterer.DEFAULT_UNIVERSAL_LAYERS;
    const components = ArchitectureClusterer.autoClusterRepository(
      repoScan.sourceFiles,
      repoScan.testFiles,
      layers,
      wasteAnalysis
    );

    // 4. Validate Architecture Invariants & Circular Dependencies (inspired by dependency-cruiser)
    const ruleAnalysis = ArchitectureRulesEngine.analyzeArchitecture(components, layers);
    ArchitectureRulesEngine.attachRuleGapsToComponents(components, ruleAnalysis);

    const project: BuildViewProject = {
      id: `proj_${projectName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
      name: projectName,
      description: projectDescription,
      version: '1.0.0',
      layers,
      components,
      lastUpdated: new Date().toISOString(),
    };

    // 4. Reset project in store and broadcast to live visualizers
    store.resetProject(project);

    return project;
  }
}
