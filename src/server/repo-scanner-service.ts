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

    // 5. Dynamic FigBridge / Design System Integration (if figbridge.connect.json exists)
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

    // 6. Write out architecture map JSON artifact in target repository for agent consumption
    try {
      const outputArtifactPath = path.join(resolvedPath, 'buildview-architecture.json');
      fs.writeFileSync(outputArtifactPath, JSON.stringify(project, null, 2), 'utf-8');
    } catch (err) {
      // Non-fatal if target directory is read-only
    }

    // 7. Reset project in store and broadcast to live visualizers
    store.resetProject(project);

    return project;
  }
}
