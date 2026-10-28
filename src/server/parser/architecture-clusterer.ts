import path from 'path';
import {
  ArchitectureLayer,
  ArchitectureComponent,
  FileChange,
  ComponentStatus,
} from '../../shared/types.js';
import { ParsedFileResult, RepoParser } from './repo-parser.js';
import { WasteDetector, WasteAnalysisResult } from './waste-detector.js';

export interface ComponentClusterRule {
  id: string;
  name: string;
  layerId: string;
  priority: number;
  description: string;
  color: string;
  filePatterns: RegExp[];
  callers: string[];
  callees: string[];
}

export const SHOTSELECT_CLUSTER_RULES: ComponentClusterRule[] = [
  // --- Layer 0: Native & Storage Core ---
  {
    id: 'comp_ss_sqlite',
    name: 'SQLite Session Store & Migrations',
    layerId: 'layer_0_native_storage',
    priority: 1,
    description: 'Embedded fast persistence for photo culling sessions, ratings, metadata cache, and project workspaces.',
    color: 'blue',
    filePatterns: [/electron\/db\./, /electron\/projectWorkspace\./, /electron\/localActivityLog\./, /electron\/models\//],
    callers: ['comp_ss_ipc', 'comp_ss_zustand'],
    callees: ['better-sqlite3'],
  },
  {
    id: 'comp_ss_raw_decoder',
    name: 'Fast RAW Preview & Embedded Decoder',
    layerId: 'layer_0_native_storage',
    priority: 2,
    description: 'Extracts embedded full-resolution JPEGs and burst thumbnails from CR2, CR3, NEF, ARW, and DNG camera files.',
    color: 'blue',
    filePatterns: [/electron\/embeddedPreview\./, /electron\/tiffPreview\./, /electron\/rawPreviewRevision\./, /electron\/fastRaw/, /native\//],
    callers: ['comp_ss_photo_deck', 'comp_ss_compare_view', 'comp_ss_cull_inspector'],
    callees: ['sharp', 'native/fast-raw-preview'],
  },
  {
    id: 'comp_ss_xmp_engine',
    name: 'XMP Sidecar Sync Engine',
    layerId: 'layer_0_native_storage',
    priority: 3,
    description: 'Generates and reads Adobe XMP sidecar files for Lightroom, Capture One, and Bridge interoperability.',
    color: 'amber',
    filePatterns: [/electron\/exportRunner\./, /electron\/xmp/, /electron\/metadata/],
    callers: ['comp_ss_export_panel'],
    callees: ['Node fs/promises', 'exiftool-vendored'],
  },
  {
    id: 'comp_ss_mount_supervisor',
    name: 'Volume & SD Card Mount Supervisor',
    layerId: 'layer_0_native_storage',
    priority: 4,
    description: 'Monitors macOS/Windows disk drive attachments, camera memory card insertions, and read-only flags.',
    color: 'blue',
    filePatterns: [/electron\/mountWatcher/, /electron\/diskSpace/, /electron\/io\//],
    callers: ['comp_ss_import_panel', 'comp_ss_ipc'],
    callees: ['Node fs', 'diskusage'],
  },
  {
    id: 'comp_ss_ipc',
    name: 'Electron Preload & IPC Bridge',
    layerId: 'layer_0_native_storage',
    priority: 5,
    description: 'Type-safe bridge connecting the React renderer with Node.js main process, FS operations, and mounted devices.',
    color: 'blue',
    filePatterns: [/electron\/preload\./, /electron\/main\./, /electron\/ipc/],
    callers: ['comp_ss_zustand', 'comp_ss_import_panel', 'comp_ss_photo_deck'],
    callees: ['comp_ss_sqlite', 'comp_ss_raw_decoder'],
  },
  {
    id: 'comp_ss_cloud_sync',
    name: 'Cloud Backup & Client Link Engine',
    layerId: 'layer_0_native_storage',
    priority: 6,
    description: 'Cloud backup dispatcher, client delivery links, and remote sync services.',
    color: 'blue',
    filePatterns: [/electron\/cloudSync\//, /electron\/clientLinks\//, /electron\/collab\//, /src\/components\/BackupToCloud/],
    callers: ['comp_ss_export_panel', 'comp_ss_delivery_board'],
    callees: ['comp_ss_sqlite', 'comp_ss_ipc'],
  },

  // --- Layer 1: AI Perception & ML Inference ---
  {
    id: 'comp_ss_onnx_pool',
    name: 'ONNX Multi-Worker Pipeline',
    layerId: 'layer_1_ai_ml',
    priority: 7,
    description: 'Zero-Python on-device ML models executing in dedicated Node worker threads for blur, faces, and semantic search.',
    color: 'green',
    filePatterns: [/scripts\/.*worker_node\.mjs/, /electron\/analysisPriorityQueue\./, /electron\/onnx/],
    callers: ['comp_ss_zustand', 'comp_ss_cull_inspector'],
    callees: ['onnxruntime-node'],
  },
  {
    id: 'comp_ss_face_grouping',
    name: 'Face Grouping & Biometric Cluster Engine',
    layerId: 'layer_1_ai_ml',
    priority: 8,
    description: 'Face detection, eye closure analysis, identity embeddings, and subject clustering across burst sets.',
    color: 'green',
    filePatterns: [/face-grouping-system\//, /electron\/faceGrouping\//, /scripts\/face/, /run-facegroup/],
    callers: ['comp_ss_cull_inspector', 'comp_ss_zustand'],
    callees: ['comp_ss_onnx_pool'],
  },
  {
    id: 'comp_ss_semantic_search',
    name: 'SigLIP Semantic Vision Search',
    layerId: 'layer_1_ai_ml',
    priority: 9,
    description: '512-dimension SigLIP image and text embeddings enabling natural language search ("bride laughing", "kiss").',
    color: 'green',
    filePatterns: [/scripts\/clip/, /electron\/search\//, /scripts\/burst_metadata_worker/],
    callers: ['comp_ss_spotlight', 'comp_ss_filters'],
    callees: ['comp_ss_onnx_pool'],
  },
  {
    id: 'comp_ss_duplicate_detector',
    name: 'Burst & Duplicate Detection Engine',
    layerId: 'layer_1_ai_ml',
    priority: 10,
    description: 'Temporal burst clustering, duplicate image hash comparison, and automatic best-shot recommendations.',
    color: 'green',
    filePatterns: [/src\/components\/duplicates\//, /src\/utils\/duplicate/],
    callers: ['comp_ss_photo_deck', 'comp_ss_filters'],
    callees: ['comp_ss_zustand'],
  },
  {
    id: 'comp_ss_zustand',
    name: 'Zustand Global Photo Store & State',
    layerId: 'layer_1_ai_ml',
    priority: 11,
    description: 'High-speed reactive store orchestrating photo selections, rating maps, culling triage states, and keyboard indices.',
    color: 'green',
    filePatterns: [/src\/store\/usePhotoStore\./, /src\/store\/keyBindings\./, /src\/store\//],
    callers: ['comp_ss_photo_deck', 'comp_ss_keyboard', 'comp_ss_import_panel'],
    callees: ['comp_ss_sqlite', 'comp_ss_ipc'],
  },

  // --- Layer 2: Desktop IPC & Workspace Shell ---
  {
    id: 'comp_ss_shell',
    name: 'Workspace Shell & Navigation Router',
    layerId: 'layer_2_ipc_desktop',
    priority: 12,
    description: 'Top-level desktop workspace layout, titlebar controls, inspector routers, and multi-view orchestrator.',
    color: 'amber',
    filePatterns: [/src\/components\/shell\//, /src\/navigation\//, /src\/components\/LeftSidebar\//, /src\/components\/Navigator\//],
    callers: ['src/App.tsx'],
    callees: ['comp_ss_zustand', 'comp_ss_photo_deck', 'comp_ss_import_panel'],
  },
  {
    id: 'comp_ss_keyboard',
    name: 'High-Speed Keyboard Supervisor',
    layerId: 'layer_2_ipc_desktop',
    priority: 13,
    description: 'Zero-latency keyboard culling engine processing 100+ keystrokes/sec with rapid-fire debounce prevention.',
    color: 'amber',
    filePatterns: [/src\/hooks\/useKeyboard\./, /src\/hooks\//],
    callers: ['window.addEventListener(keydown)'],
    callees: ['comp_ss_zustand'],
  },
  {
    id: 'comp_ss_cull_coordinator',
    name: 'Cull Triage & Filter Coordinator',
    layerId: 'layer_2_ipc_desktop',
    priority: 14,
    description: 'Coordinates active filter chips, star ratings, reject states, AI checks filter groups, and triage statistics.',
    color: 'amber',
    filePatterns: [/src\/components\/ProjectCullCoordinator\./, /src\/components\/filters\//],
    callers: ['comp_ss_photo_deck', 'comp_ss_shell'],
    callees: ['comp_ss_zustand'],
  },
  {
    id: 'comp_ss_design_tokens',
    name: 'Color & Motion Tokens Engine',
    layerId: 'layer_2_ipc_desktop',
    priority: 15,
    description: 'Dark-only color palette, Framer Motion spring presets, typography scale, and accessible UI primitives.',
    color: 'amber',
    filePatterns: [/src\/design\//, /src\/config\//, /src\/context\//, /src\/components\/primitives\//],
    callers: ['comp_ss_photo_deck', 'comp_ss_shell', 'comp_ss_import_panel'],
    callees: ['Tailwind CSS v3', 'framer-motion'],
  },
  {
    id: 'comp_ss_collab_policy',
    name: 'Shared Workspace & Team Policy',
    layerId: 'layer_2_ipc_desktop',
    priority: 16,
    description: 'Multi-seat team culling rules, share policy enforcement, and client review access tokens.',
    color: 'amber',
    filePatterns: [/src\/components\/share\//, /src\/components\/shared\//, /src\/sharePolicy\//, /src\/sharedWorkspace\//, /src\/teamJoin\//],
    callers: ['comp_ss_shell'],
    callees: ['comp_ss_ipc', 'comp_ss_zustand'],
  },

  // --- Layer 3: Studio UI & Deck Interaction ---
  {
    id: 'comp_ss_photo_deck',
    name: 'PhotoDeck Culling Canvas & PhotoCard',
    layerId: 'layer_3_studio_ui',
    priority: 17,
    description: 'The core culling workspace with hardware-accelerated pan/zoom, swipe triage cards, and focus-point toggles.',
    color: 'rose',
    filePatterns: [/src\/components\/PhotoDeck\./, /src\/components\/PhotoCard\./, /src\/components\/cull\//, /src\/components\/grid\//],
    callers: ['User Gestures', 'comp_ss_keyboard'],
    callees: ['comp_ss_zustand', 'comp_ss_raw_decoder'],
  },
  {
    id: 'comp_ss_import_panel',
    name: 'Import Panel & Drive Inspector',
    layerId: 'layer_3_studio_ui',
    priority: 18,
    description: 'Studio home surface detecting camera memory cards, recent shoots, and folder hierarchies.',
    color: 'rose',
    filePatterns: [/src\/components\/ImportPanel\./, /src\/components\/import\//, /src\/components\/DriveDetailsDrawer\./],
    callers: ['User Click', 'OS Mount Event'],
    callees: ['comp_ss_ipc', 'comp_ss_zustand'],
  },
  {
    id: 'comp_ss_compare_view',
    name: 'Synchronized Compare Mode & Loupe',
    layerId: 'layer_3_studio_ui',
    priority: 19,
    description: 'Dual/multi photo side-by-side split view with synchronized 400% zoom loupe and pixel inspection.',
    color: 'rose',
    filePatterns: [/src\/components\/CompareMode\./, /src\/components\/compare\//, /src\/components\/LoupeCaption\./],
    callers: ['comp_ss_photo_deck'],
    callees: ['comp_ss_raw_decoder', 'comp_ss_zustand'],
  },
  {
    id: 'comp_ss_export_panel',
    name: 'Export & Lightroom Sync Dock',
    layerId: 'layer_3_studio_ui',
    priority: 20,
    description: 'Batch XMP writer dock, rating exporter, and direct-to-Lightroom catalog sync pipeline.',
    color: 'rose',
    filePatterns: [/src\/components\/ExportPanel\./, /src\/components\/export\//],
    callers: ['User Click (Export CTA)'],
    callees: ['comp_ss_xmp_engine', 'comp_ss_sqlite'],
  },
  {
    id: 'comp_ss_cull_inspector',
    name: 'Face & Retouch Inspector Panel',
    layerId: 'layer_3_studio_ui',
    priority: 21,
    description: 'Side inspector displaying detected subject faces, focus sharpness metrics, and EXIF camera data.',
    color: 'rose',
    filePatterns: [/src\/components\/FacesPersonInspector\./, /src\/components\/RetouchInspectorSection\./, /src\/components\/ImageStats\./],
    callers: ['comp_ss_photo_deck'],
    callees: ['comp_ss_face_grouping', 'comp_ss_zustand'],
  },
  {
    id: 'comp_ss_spotlight',
    name: 'Spotlight Search & Omnibar',
    layerId: 'layer_3_studio_ui',
    priority: 22,
    description: 'Quick-open command palette (Cmd+K) supporting filename search, AI semantic queries, and keyboard commands.',
    color: 'rose',
    filePatterns: [/src\/components\/SpotlightSearch\./],
    callers: ['comp_ss_keyboard'],
    callees: ['comp_ss_semantic_search', 'comp_ss_zustand'],
  },
  {
    id: 'comp_ss_modals_help',
    name: 'Studio Modals & Help Center',
    layerId: 'layer_3_studio_ui',
    priority: 23,
    description: 'Interactive shortcuts overlay, feedback reporter, stats modal, and crash recovery prompt.',
    color: 'rose',
    filePatterns: [/src\/components\/ShortcutsModal\./, /src\/components\/HelpCenter\./, /src\/components\/FeedbackModal\./, /src\/components\/StatsModal\./, /src\/components\/EjectConfirmModal\./, /src\/onboarding\//],
    callers: ['comp_ss_shell', 'comp_ss_keyboard'],
    callees: ['comp_ss_zustand'],
  },
  {
    id: 'comp_ss_delivery_board',
    name: 'Delivery Status & Gallery Board',
    layerId: 'layer_3_studio_ui',
    priority: 24,
    description: 'Photographer delivery board showing export status, client gallery links, and archive packages.',
    color: 'rose',
    filePatterns: [/src\/components\/DeliveryStatusBoard\./, /src\/components\/DeliveryGalleryPanel\./, /src\/components\/ArchivePreparationPanel\./],
    callers: ['comp_ss_shell'],
    callees: ['comp_ss_cloud_sync', 'comp_ss_export_panel'],
  },
];

export class ArchitectureClusterer {
  /**
   * Automatically groups all scanned repository files into cohesive architectural components.
   */
  public static clusterRepository(
    sourceFiles: ParsedFileResult[],
    testFiles: ParsedFileResult[],
    layers: ArchitectureLayer[],
    rules: ComponentClusterRule[] = SHOTSELECT_CLUSTER_RULES,
    wasteResult?: WasteAnalysisResult
  ): ArchitectureComponent[] {
    const components: ArchitectureComponent[] = [];
    const matchedSourceFiles = new Set<string>();

    for (const rule of rules) {
      // Find all source files matching this rule's patterns
      const matchingSources = sourceFiles.filter((sf) =>
        rule.filePatterns.some((pattern) => pattern.test(sf.filePath))
      );

      for (const sf of matchingSources) {
        matchedSourceFiles.add(sf.filePath);
      }

      // Convert matching sources into FileChange records
      const files: FileChange[] = matchingSources.map((sf) => ({
        path: sf.filePath,
        status: 'created',
        linesChanged: sf.astMetrics.linesOfCode,
        description: `${sf.astMetrics.totalFunctions} fns, ${sf.astMetrics.totalExports} exports`,
      }));

      // Correlate test files:
      // 1. Basename matches
      // 2. Directory proximity
      // 3. Tests importing this component's files
      const componentPaths = matchingSources.map((sf) => sf.filePath);
      const testMatch = RepoParser.correlateTests(componentPaths, testFiles);

      // Collect all functions, members, state from parsed AST
      const functions = matchingSources.flatMap((sf) => sf.functions);
      const members = matchingSources.flatMap((sf) => sf.members);

      // Waste Metrics
      const compWaste = wasteResult
        ? WasteDetector.getComponentWaste(componentPaths, wasteResult.fileWaste)
        : undefined;

      // Status
      let status: ComponentStatus = 'completed';
      let progress = 100;
      const gaps = [];

      // Critical gap on XMP sync
      if (rule.id === 'comp_ss_xmp_engine') {
        status = 'gap_detected';
        progress = 85;
        gaps.push({
          id: 'gap_xmp_readonly_refusal',
          title: 'XMP Sidecar Write Failure on Read-Only Mounted SD Cards',
          description: 'When photographers cull directly from SD cards or read-only mounted external drives, XMP writes fail with EACCES permissions error without automatic fallback to local app data cache.',
          severity: 'critical' as const,
          resolved: false,
        });
      }

      components.push({
        id: rule.id,
        name: rule.name,
        layerId: rule.layerId,
        priority: rule.priority,
        description: rule.description,
        color: rule.color,
        status,
        progress,
        anatomy: {
          members: members.slice(0, 8), // top 8 prominent fields
          functions: functions.slice(0, 12), // top 12 functions
          state: [],
          callers: rule.callers,
          callees: rule.callees,
        },
        files,
        testFiles: testMatch.matchedTestFiles,
        testSummary: testMatch.testSummary,
        astMetrics: {
          totalFunctions: functions.length,
          totalClasses: matchingSources.reduce((sum, sf) => sum + sf.astMetrics.totalClasses, 0),
          totalInterfaces: matchingSources.reduce((sum, sf) => sum + sf.astMetrics.totalInterfaces, 0),
          totalExports: matchingSources.reduce((sum, sf) => sum + sf.astMetrics.totalExports, 0),
          linesOfCode: matchingSources.reduce((sum, sf) => sum + sf.astMetrics.linesOfCode, 0),
        },
        wasteMetrics: compWaste,
        gaps,
        updatedAt: new Date().toISOString(),
      });
    }

    // Catch-all: Any unmatched source files grouped into shared utility module
    const unmatchedSources = sourceFiles.filter((sf) => !matchedSourceFiles.has(sf.filePath));
    if (unmatchedSources.length > 0) {
      const unmatchedPaths = unmatchedSources.map((sf) => sf.filePath);
      const testMatch = RepoParser.correlateTests(unmatchedPaths, testFiles);
      const compWaste = wasteResult
        ? WasteDetector.getComponentWaste(unmatchedPaths, wasteResult.fileWaste)
        : undefined;

      components.push({
        id: 'comp_ss_shared_utils',
        name: 'Shared System Libraries & Helpers',
        layerId: 'layer_1_ai_ml',
        priority: 25,
        description: 'Cross-cutting utility libraries, date/time formatters, math routines, and shared helper functions.',
        color: 'green',
        status: 'completed',
        progress: 100,
        anatomy: {
          members: [],
          functions: unmatchedSources.flatMap((sf) => sf.functions).slice(0, 10),
          state: [],
          callers: ['*'],
          callees: ['*'],
        },
        files: unmatchedSources.map((sf) => ({
          path: sf.filePath,
          status: 'created',
          linesChanged: sf.astMetrics.linesOfCode,
        })),
        testFiles: testMatch.matchedTestFiles,
        testSummary: testMatch.testSummary,
        astMetrics: {
          totalFunctions: unmatchedSources.reduce((sum, sf) => sum + sf.astMetrics.totalFunctions, 0),
          totalClasses: unmatchedSources.reduce((sum, sf) => sum + sf.astMetrics.totalClasses, 0),
          totalInterfaces: unmatchedSources.reduce((sum, sf) => sum + sf.astMetrics.totalInterfaces, 0),
          totalExports: unmatchedSources.reduce((sum, sf) => sum + sf.astMetrics.totalExports, 0),
          linesOfCode: unmatchedSources.reduce((sum, sf) => sum + sf.astMetrics.linesOfCode, 0),
        },
        wasteMetrics: compWaste,
        gaps: [],
        updatedAt: new Date().toISOString(),
      });
    }

    return components;
  }

  /**
   * Universal 4-Layer Taxonomy for any software codebase
   */
  public static readonly DEFAULT_UNIVERSAL_LAYERS: ArchitectureLayer[] = [
    {
      id: 'layer_foundation',
      name: 'Storage, Native & Foundation',
      order: 0,
      description: 'Persistence, database models, schemas, native bindings, utilities, and core configuration.',
      color: '#6366f1',
    },
    {
      id: 'layer_domain',
      name: 'Domain Engines & Services',
      order: 1,
      description: 'Core processing pipelines, algorithms, domain services, AI/ML models, and background workers.',
      color: '#06b6d4',
    },
    {
      id: 'layer_state_ipc',
      name: 'State, Router & IPC Bridge',
      order: 2,
      description: 'State management stores, IPC/RPC channels, API routers, controllers, and policy coordinators.',
      color: '#10b981',
    },
    {
      id: 'layer_presentation',
      name: 'Studio UI & Interface Panels',
      order: 3,
      description: 'User interface components, dashboards, tools, dialogs, CLI command routers, and presentation views.',
      color: '#f43f5e',
    },
  ];

  /**
   * Automatically groups ANY arbitrary repository into cohesive architectural components
   * based on directory structures, module boundaries, AST imports, and caller/callee graphs.
   */
  public static autoClusterRepository(
    sourceFiles: ParsedFileResult[],
    testFiles: ParsedFileResult[],
    layers: ArchitectureLayer[] = ArchitectureClusterer.DEFAULT_UNIVERSAL_LAYERS,
    wasteResult?: WasteAnalysisResult
  ): ArchitectureComponent[] {
    // Check if repository matches predefined ShotSelect rules
    const matchesShotSelect = sourceFiles.some((sf) =>
      /electron\/embeddedPreview|electron\/xmp|electron\/faceGrouping/.test(sf.filePath)
    );

    if (matchesShotSelect) {
      return this.clusterRepository(sourceFiles, testFiles, layers, SHOTSELECT_CLUSTER_RULES, wasteResult);
    }

    // Generic Clustering Engine for ANY repository
    const moduleMap = new Map<string, ParsedFileResult[]>();

    for (const sf of sourceFiles) {
      const normalized = sf.filePath.replace(/\\/g, '/');
      const parts = normalized.split('/').filter(Boolean);

      let moduleKey = 'root';
      if (parts.length > 2) {
        // e.g. src/components/button.tsx -> src/components
        // e.g. packages/core/src/index.ts -> packages/core
        if (parts[0] === 'packages' || parts[0] === 'apps') {
          moduleKey = `${parts[0]}/${parts[1]}`;
        } else {
          moduleKey = `${parts[0]}/${parts[1]}`;
        }
      } else if (parts.length === 2) {
        moduleKey = parts[0];
      }

      const existing = moduleMap.get(moduleKey) || [];
      existing.push(sf);
      moduleMap.set(moduleKey, existing);
    }

    const components: ArchitectureComponent[] = [];
    let priorityCounter = 1;

    for (const [moduleKey, files] of moduleMap.entries()) {
      const componentPaths = files.map((f) => f.filePath);
      const testMatch = RepoParser.correlateTests(componentPaths, testFiles);
      const compWaste = wasteResult
        ? WasteDetector.getComponentWaste(componentPaths, wasteResult.fileWaste)
        : undefined;

      // Classify layer from directory keywords
      let layerId = 'layer_domain';
      let color = 'blue';

      const keyLower = moduleKey.toLowerCase();
      if (/db|database|sqlite|sql|store|storage|models?|schemas?|native|fs|io|mount|config|foundation/.test(keyLower)) {
        layerId = layers[0]?.id || 'layer_foundation';
        color = 'blue';
      } else if (/ai|ml|onnx|perception|vision|search|engine|service|pipeline|worker|algo|detector|analysis/.test(keyLower)) {
        layerId = layers[1]?.id || 'layer_domain';
        color = 'cyan';
      } else if (/ipc|bridge|preload|router|controller|state|zustand|redux|middleware|hook|events?/.test(keyLower)) {
        layerId = layers[2]?.id || 'layer_state_ipc';
        color = 'emerald';
      } else if (/component|ui|view|page|panel|dock|dialog|modal|screen|card|cli|command|presentation/.test(keyLower)) {
        layerId = layers[3]?.id || 'layer_presentation';
        color = 'rose';
      }

      // Format clean component name
      const cleanName = moduleKey
        .split('/')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');

      const compId = `comp_${moduleKey.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

      // Deduce caller/callee links from imports across components
      const callees = new Set<string>();
      for (const f of files) {
        for (const imp of f.imports || []) {
          for (const [otherKey] of moduleMap.entries()) {
            if (otherKey !== moduleKey && imp.includes(otherKey)) {
              callees.add(`comp_${otherKey.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`);
            }
          }
        }
      }

      components.push({
        id: compId,
        name: cleanName,
        layerId,
        priority: priorityCounter++,
        description: `Architectural module covering ${files.length} file(s) in ${moduleKey}.`,
        color,
        status: 'completed',
        progress: 100,
        anatomy: {
          members: files.flatMap((f) => f.members).slice(0, 8),
          functions: files.flatMap((f) => f.functions).slice(0, 12),
          state: [],
          callers: [],
          callees: Array.from(callees),
        },
        files: files.map((f) => ({
          path: f.filePath,
          status: 'created',
          linesChanged: f.astMetrics.linesOfCode,
          description: `${f.astMetrics.totalFunctions} fns, ${f.astMetrics.totalExports} exports`,
        })),
        testFiles: testMatch.matchedTestFiles,
        testSummary: testMatch.testSummary,
        astMetrics: {
          totalFunctions: files.reduce((sum, f) => sum + f.astMetrics.totalFunctions, 0),
          totalClasses: files.reduce((sum, f) => sum + f.astMetrics.totalClasses, 0),
          totalInterfaces: files.reduce((sum, f) => sum + f.astMetrics.totalInterfaces, 0),
          totalExports: files.reduce((sum, f) => sum + f.astMetrics.totalExports, 0),
          linesOfCode: files.reduce((sum, f) => sum + f.astMetrics.linesOfCode, 0),
        },
        wasteMetrics: compWaste,
        gaps: [],
        updatedAt: new Date().toISOString(),
      });
    }

    return components;
  }
}
