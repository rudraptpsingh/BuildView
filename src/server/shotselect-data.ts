import { BuildViewProject, ArchitectureLayer, ArchitectureComponent } from '../shared/types.js';

export function getShotSelectLayers(): ArchitectureLayer[] {
  return [
    {
      id: 'layer_0_native_storage',
      name: 'Layer 0: Native & Storage Core',
      order: 0,
      description: 'SQLite session persistence, high-speed RAW preview extraction, and XMP metadata sync',
      color: '#32ade6', // Cobalt
    },
    {
      id: 'layer_1_ai_ml',
      name: 'Layer 1: AI Perception & ML Inference',
      order: 1,
      description: 'ONNX multi-worker pipeline (blur, face grouping, closed-eye, CLIP search) and Zustand state',
      color: '#30d158', // Emerald
    },
    {
      id: 'layer_2_ipc_desktop',
      name: 'Layer 2: IPC Bridge & Hardware Supervision',
      order: 2,
      description: 'Typed Electron main/preload bridge, SD card mount listener, and 120 FPS keyboard supervisor',
      color: '#ffd60a', // Amber
    },
    {
      id: 'layer_3_studio_ui',
      name: 'Layer 3: Studio UI & Deck Interaction',
      order: 3,
      description: 'Import panel, PhotoDeck swipe-triage canvas, compare mode, and Lightroom export dock',
      color: '#ff453a', // Rose
    },
  ];
}

export function getShotSelectComponents(): ArchitectureComponent[] {
  return [
    {
      id: 'comp_ss_sqlite',
      name: 'SQLite Session Store',
      layerId: 'layer_0_native_storage',
      description: 'Embedded fast persistence for photo culling sessions, flags, ratings, and project workspaces.',
      color: 'blue',
      priority: 1,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'dbHandle', type: 'Database.Database', access: 'private', description: 'better-sqlite3 connection instance' },
          { name: 'activeWorkspacePath', type: 'string', access: 'public', description: 'Filesystem location of active session' },
          { name: 'schemaVersion', type: 'number', access: 'public', description: 'DDL migration version' },
        ],
        functions: [
          { name: 'initSchema', signature: '(): void', returnType: 'void', description: 'Initializes DDL tables and indexes' },
          { name: 'savePhotoVerdict', signature: '(id: string, rating: number, flag: string): void', returnType: 'void', description: 'Atomic rating update' },
          { name: 'queryPhotos', signature: '(filter: QueryFilter): PhotoRow[]', returnType: 'PhotoRow[]', description: 'Indexed session photo retrieval' },
        ],
        state: [
          { name: 'connectionState', type: "'connected' | 'idle'", initialValue: "'connected'", description: 'SQLite pool status' },
          { name: 'writeBufferCount', type: 'number', initialValue: '0', description: 'Unflushed SQLite transactions' },
        ],
        callers: ['comp_ss_ipc', 'comp_ss_zustand'],
        callees: ['better-sqlite3'],
      },
      files: [
        { path: 'electron/db.ts', status: 'created', linesChanged: 280, description: 'Core SQLite connection & migrations' },
        { path: 'electron/projectWorkspace.ts', status: 'created', linesChanged: 145, description: 'Project workspace directory tracker' },
        { path: 'electron/localActivityLog.ts', status: 'created', linesChanged: 95, description: 'Structured culling activity log' },
      ],
      testSummary: {
        testFilesCount: 2,
        totalTests: 8,
        status: 'tested',
        coverageEstimatePercent: 95,
      },
      testFiles: [
        {
          path: 'electron/db.test.ts',
          testCount: 5,
          suites: ['SQLite Persistence Layer'],
          testCases: [
            { name: 'migrates schema to latest DDL version', suite: 'SQLite Persistence Layer' },
            { name: 'inserts and updates photo rating verdict atomically', suite: 'SQLite Persistence Layer' },
            { name: 'queries indexed session photos with filter predicates', suite: 'SQLite Persistence Layer' },
          ],
        },
      ],
      wasteMetrics: {
        unusedExports: [],
        deadCodeLines: 0,
        duplicateFunctions: [],
        orphanFiles: [],
        testZombies: [],
        cleanlinessScore: 100,
        recommendation: 'clean',
      },
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_raw_decoder',
      name: 'Fast RAW Preview Decoder',
      layerId: 'layer_0_native_storage',
      description: 'Extracts embedded full-resolution JPEGs and burst thumbnails from CR2, CR3, NEF, ARW, and DNG camera files.',
      color: 'blue',
      priority: 2,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'previewCache', type: 'LRUCache<string, Buffer>', access: 'private', description: 'In-memory decoded JPEG buffer cache' },
          { name: 'workerQueue', type: 'PriorityQueue<DecodeJob>', access: 'private', description: 'Prioritized decode tasks' },
        ],
        functions: [
          { name: 'extractEmbeddedJpeg', signature: '(rawPath: string): Promise<Buffer>', returnType: 'Promise<Buffer>', isAsync: true, description: 'Ultra-fast EXIF embedded JPEG extraction (< 15ms)' },
          { name: 'generateThumbnail', signature: '(path: string): Promise<Buffer>', returnType: 'Promise<Buffer>', isAsync: true, description: 'Generates mipmapped card thumbnail' },
        ],
        state: [
          { name: 'activeDecodes', type: 'number', initialValue: '0', description: 'Parallel decoding threads' },
          { name: 'gpuAcceleration', type: 'boolean', initialValue: 'true', description: 'Metal / GPU acceleration indicator' },
        ],
        callers: ['comp_ss_photo_deck', 'comp_ss_cull_inspector'],
        callees: ['sharp', 'native/fast-raw-preview'],
      },
      files: [
        { path: 'electron/embeddedPreview.ts', status: 'created', linesChanged: 310, description: 'Embedded preview extractor' },
        { path: 'electron/tiffPreview.ts', status: 'created', linesChanged: 180, description: 'TIFF and DNG preview generator' },
        { path: 'electron/rawPreviewRevision.ts', status: 'created', linesChanged: 115, description: 'Cache invalidation revision manager' },
      ],
      testSummary: {
        testFilesCount: 1,
        totalTests: 3,
        status: 'partial',
        coverageEstimatePercent: 65,
      },
      testFiles: [
        {
          path: 'electron/embeddedPreview.test.ts',
          testCount: 3,
          suites: ['RAW Preview Decoder'],
          testCases: [
            { name: 'extracts embedded JPEG from Canon CR3', suite: 'RAW Preview Decoder' },
            { name: 'falls back to tiff preview on corrupt EXIF header', suite: 'RAW Preview Decoder' },
          ],
        },
      ],
      wasteMetrics: {
        unusedExports: [],
        deadCodeLines: 0,
        duplicateFunctions: [],
        orphanFiles: [],
        testZombies: [],
        cleanlinessScore: 100,
        recommendation: 'clean',
      },
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_xmp_engine',
      name: 'XMP Sidecar Sync Engine',
      layerId: 'layer_0_native_storage',
      description: 'Generates and reads Adobe XMP sidecar files for Lightroom, Capture One, and Bridge interoperability.',
      color: 'amber',
      priority: 3,
      status: 'gap_detected',
      progress: 85,
      anatomy: {
        members: [
          { name: 'xmpNamespace', type: 'string', access: 'private', description: 'Adobe standard XML schema' },
          { name: 'writeRetryTimeoutMs', type: 'number', access: 'public', description: 'File lock write backoff duration' },
        ],
        functions: [
          { name: 'writeSidecar', signature: '(photoPath: string, rating: number, label: string): Promise<WriteResult>', returnType: 'Promise<WriteResult>', isAsync: true, description: 'Writes rating and color label to .xmp' },
          { name: 'readSidecar', signature: '(xmpPath: string): Promise<XmpData>', returnType: 'Promise<XmpData>', isAsync: true, description: 'Parses existing sidecar ratings' },
        ],
        state: [
          { name: 'pendingWrites', type: 'number', initialValue: '0', description: 'Queued disk sidecar writes' },
          { name: 'lastWriteFailure', type: 'string | null', initialValue: 'null', description: 'Latest filesystem error details' },
        ],
        callers: ['comp_ss_export_panel'],
        callees: ['Node fs/promises', 'exiftool-vendored'],
      },
      files: [
        { path: 'electron/exportRunner.ts', status: 'modified', linesChanged: 245, description: 'XMP batch export runner' },
        { path: 'electron/xmpWriteRefusals.test.ts', status: 'created', linesChanged: 120, description: 'XMP write permission test suite' },
      ],
      testSummary: {
        testFilesCount: 1,
        totalTests: 4,
        status: 'tested',
        coverageEstimatePercent: 80,
      },
      testFiles: [
        {
          path: 'electron/xmpWriteRefusals.test.ts',
          testCount: 4,
          suites: ['XMP Permissions & Sidecar Writing'],
          testCases: [
            { name: 'reproduces EACCES write failure on read-only mounted volume', suite: 'XMP Permissions & Sidecar Writing' },
            { name: 'validates sidecar XML tags adhere to Lightroom specification', suite: 'XMP Permissions & Sidecar Writing' },
          ],
        },
      ],
      wasteMetrics: {
        unusedExports: ['exportRunner.ts:legacyXmpXmlBuilder', 'exportRunner.ts:obsoleteIptcEncoder'],
        deadCodeLines: 42,
        duplicateFunctions: [],
        orphanFiles: [],
        testZombies: ['xmpWriteRefusals.test.ts:mockReadonlyDriveHelper'],
        cleanlinessScore: 75,
        recommendation: 'prune',
      },
      gaps: [
        {
          id: 'gap_xmp_readonly_refusal',
          title: 'XMP Sidecar Write Failure on Read-Only Mounted SD Cards',
          description: 'When photographers cull directly from SD cards or read-only mounted external drives, XMP writes fail with EACCES permissions error without automatic fallback to local app data cache.',
          severity: 'critical',
          resolved: false,
        },
      ],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_onnx_pool',
      name: 'ONNX Multi-Worker Pipeline',
      layerId: 'layer_1_ai_ml',
      description: 'Zero-Python on-device ML models executing in dedicated Node worker threads for blur, faces, and semantic search.',
      color: 'green',
      priority: 4,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'workerPool', type: 'Worker[]', access: 'private', description: 'Dedicated CPU/Neural Engine worker threads' },
          { name: 'activeJobQueue', type: 'PriorityQueue<MLJob>', access: 'private', description: 'Prioritized inference queue' },
        ],
        functions: [
          { name: 'analyzeBlur', signature: '(buffer: Buffer): Promise<BlurScore>', returnType: 'Promise<BlurScore>', isAsync: true, description: 'Calculates Laplacian variance and focus sharpness' },
          { name: 'detectFaces', signature: '(buffer: Buffer): Promise<FaceBox[]>', returnType: 'Promise<FaceBox[]>', isAsync: true, description: 'Extracts face embeddings and eye state' },
          { name: 'computeClipEmbedding', signature: '(buffer: Buffer): Promise<Float32Array>', returnType: 'Promise<Float32Array>', isAsync: true, description: 'Computes 512-dim SigLIP visual embedding vector' },
        ],
        state: [
          { name: 'poolStatus', type: "'idle' | 'processing'", initialValue: "'idle'", description: 'Worker thread status' },
          { name: 'workerUtilizationPercent', type: 'number', initialValue: '0', description: 'Thread load percentage' },
        ],
        callers: ['comp_ss_zustand', 'comp_ss_cull_inspector'],
        callees: ['onnxruntime-node'],
      },
      files: [
        { path: 'scripts/clip_worker_node.mjs', status: 'created', linesChanged: 165, description: 'SigLIP/CLIP semantic embedding worker' },
        { path: 'scripts/burst_metadata_worker.mjs', status: 'created', linesChanged: 210, description: 'Burst EXIF and temporal clustering worker' },
        { path: 'electron/analysisPriorityQueue.ts', status: 'created', linesChanged: 95, description: 'Inference queue scheduler' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_zustand',
      name: 'Zustand Global Photo Store',
      layerId: 'layer_1_ai_ml',
      description: 'High-speed reactive store orchestrating photo selections, rating maps, culling triage states, and keyboard indices.',
      color: 'green',
      priority: 5,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'photos', type: 'PhotoItem[]', access: 'public', description: 'Loaded session photo collection' },
          { name: 'selectionIndex', type: 'number', access: 'public', description: 'Active focused photo pointer' },
          { name: 'okList', type: 'Set<string>', access: 'public', description: 'Selected photo IDs' },
          { name: 'photoZoom', type: 'Map<string, number>', access: 'public', description: 'Per-photo zoom factor map' },
        ],
        functions: [
          { name: 'setRating', signature: '(id: string, stars: number): void', returnType: 'void', description: 'Updates photo star rating (1-5)' },
          { name: 'toggleSelect', signature: '(id: string): void', returnType: 'void', description: 'Toggles Select / Reject decision' },
          { name: 'advanceNext', signature: '(): void', returnType: 'void', description: 'Moves active cursor to next photo' },
        ],
        state: [
          { name: 'appPhase', type: "'import' | 'cull' | 'export'", initialValue: "'cull'", description: 'Active workflow stage' },
          { name: 'activeFilter', type: 'FilterCriteria', initialValue: '{ flag: null }', description: 'Filter predicate' },
        ],
        callers: ['comp_ss_photo_deck', 'comp_ss_keyboard', 'comp_ss_app_header'],
        callees: ['comp_ss_sqlite', 'comp_ss_ipc'],
      },
      files: [
        { path: 'src/store/usePhotoStore.ts', status: 'created', linesChanged: 420, description: 'Main Zustand photo store' },
        { path: 'src/store/keyBindings.ts', status: 'created', linesChanged: 85, description: 'Customizable keyboard mapping store' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_ipc',
      name: 'Electron Preload IPC Bridge',
      layerId: 'layer_2_ipc_desktop',
      description: 'Type-safe bridge connecting the React renderer with Node.js main process, FS operations, and mounted devices.',
      color: 'amber',
      priority: 6,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'registeredChannels', type: 'Set<string>', access: 'private', description: 'Whitelisted IPC handler channels' },
        ],
        functions: [
          { name: 'invoke', signature: '<T>(channel: string, ...args: any[]): Promise<T>', returnType: 'Promise<T>', isAsync: true, description: 'Asynchronous IPC bridge call' },
          { name: 'onDriveMounted', signature: '(cb: (drive: MountInfo) => void): () => void', returnType: '() => void', description: 'Hardware mount notification listener' },
          { name: 'scanFolder', signature: '(dirPath: string): Promise<ScanResult>', returnType: 'Promise<ScanResult>', isAsync: true, description: 'Scans directory for raw/jpeg media' },
        ],
        state: [
          { name: 'isElectronReady', type: 'boolean', initialValue: 'true', description: 'Desktop container ready state' },
        ],
        callers: ['comp_ss_import_panel', 'comp_ss_zustand'],
        callees: ['electron.ipcMain', 'electron.ipcRenderer'],
      },
      files: [
        { path: 'electron/main.ts', status: 'created', linesChanged: 340, description: 'Electron main process & lifecycle' },
        { path: 'electron/preload.ts', status: 'created', linesChanged: 110, description: 'Context isolation preload script' },
        { path: 'electron/macosMountedDevices.ts', status: 'created', linesChanged: 125, description: 'macOS /Volumes watcher' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_keyboard',
      name: 'High-Speed Keyboard Supervisor',
      layerId: 'layer_2_ipc_desktop',
      description: 'Zero-latency keyboard culling engine processing 100+ keystrokes/sec with rapid-fire debounce prevention.',
      color: 'amber',
      priority: 7,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'keyMap', type: 'Map<string, KeyAction>', access: 'private', description: 'Configured shortcut mapping' },
          { name: 'isSuppressed', type: 'boolean', access: 'public', description: 'Input modal focus lock' },
        ],
        functions: [
          { name: 'handleKeyDown', signature: '(e: KeyboardEvent): void', returnType: 'void', description: 'Dispatches hotkeys (1-5, Space, Arrows, X, P)' },
          { name: 'bindShortcut', signature: '(key: string, action: string): void', returnType: 'void', description: 'Rebinds custom user shortcut' },
        ],
        state: [
          { name: 'lastPressedKey', type: 'string | null', initialValue: 'null', description: 'Most recent key' },
        ],
        callers: ['window.addEventListener(keydown)'],
        callees: ['comp_ss_zustand'],
      },
      files: [
        { path: 'src/hooks/useKeyboard.ts', status: 'created', linesChanged: 185, description: 'Global keyboard listener hook' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_import_panel',
      name: 'Import Panel & Drive Detector',
      layerId: 'layer_3_studio_ui',
      description: 'Studio home surface detecting camera memory cards, recent shoots, and folder hierarchies.',
      color: 'rose',
      priority: 8,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'mountedCards', type: 'MountedVolume[]', access: 'public', description: 'Live detected SD cards' },
          { name: 'recentShoots', type: 'ProjectWorkspace[]', access: 'public', description: 'Historical shoots index' },
        ],
        functions: [
          { name: 'detectMountedSDCards', signature: '(): Promise<MountedVolume[]>', returnType: 'Promise<MountedVolume[]>', isAsync: true, description: 'Polls system mounts' },
          { name: 'openFolderDialog', signature: '(): Promise<string | null>', returnType: 'Promise<string | null>', isAsync: true, description: 'Displays native macOS folder selector' },
        ],
        state: [
          { name: 'isScanning', type: 'boolean', initialValue: 'false', description: 'Scanning folder activity' },
        ],
        callers: ['User Click', 'OS Mount Event'],
        callees: ['comp_ss_ipc', 'comp_ss_zustand'],
      },
      files: [
        { path: 'src/components/ImportPanel.tsx', status: 'created', linesChanged: 380, description: 'Import library panel' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_photo_deck',
      name: 'PhotoDeck Culling Canvas',
      layerId: 'layer_3_studio_ui',
      description: 'The core culling workspace with hardware-accelerated pan/zoom, swipe triage cards, and compare split-view.',
      color: 'rose',
      priority: 9,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'virtualWindow', type: 'VirtualScrollState', access: 'private', description: 'Virtualized DOM card window' },
          { name: 'compareModeActive', type: 'boolean', access: 'public', description: 'Side-by-side comparison state' },
        ],
        functions: [
          { name: 'renderVisibleCards', signature: '(): JSX.Element[]', returnType: 'JSX.Element[]', description: 'Renders GPU accelerated cards' },
          { name: 'handleSwipeVerdict', signature: '(dir: SwipeDirection): void', returnType: 'void', description: 'Applies Keep/Reject decision on swipe' },
          { name: 'enterCompareMode', signature: '(ids: string[]): void', returnType: 'void', description: 'Opens dual synchronized compare view' },
        ],
        state: [
          { name: 'panOffset', type: 'Point', initialValue: '{ x: 0, y: 0 }', description: 'Photo viewport offset' },
          { name: 'activeZoomFactor', type: 'number', initialValue: '1.0', description: 'Zoom level (1x - 4x)' },
        ],
        callers: ['User Gestures', 'comp_ss_keyboard'],
        callees: ['comp_ss_zustand', 'comp_ss_raw_decoder'],
      },
      files: [
        { path: 'src/components/PhotoDeck.tsx', status: 'created', linesChanged: 490, description: 'PhotoDeck main culling canvas' },
        { path: 'src/components/PhotoCard.tsx', status: 'created', linesChanged: 320, description: 'Individual swipe photo card' },
        { path: 'src/components/CompareMode.tsx', status: 'created', linesChanged: 280, description: 'Side-by-side compare component' },
      ],
      testSummary: {
        testFilesCount: 1,
        totalTests: 3,
        status: 'partial',
        coverageEstimatePercent: 70,
      },
      testFiles: [
        {
          path: 'src/components/PhotoDeck.test.tsx',
          testCount: 3,
          suites: ['PhotoDeck Interactive Canvas'],
          testCases: [
            { name: 'renders virtualized cards without DOM memory leak', suite: 'PhotoDeck Interactive Canvas' },
            { name: 'dispatches swipe verdict correctly on gesture release', suite: 'PhotoDeck Interactive Canvas' },
          ],
        },
      ],
      wasteMetrics: {
        unusedExports: [],
        deadCodeLines: 18,
        duplicateFunctions: [
          {
            name: 'formatBytes',
            sourceFile: 'src/components/PhotoDeck.tsx',
            duplicateOfFile: 'electron/utils.ts',
            similarity: 1.0,
            reason: 'Identical logic body matching "formatBytes" in electron/utils.ts',
          },
        ],
        orphanFiles: [],
        testZombies: [],
        cleanlinessScore: 80,
        recommendation: 'prune',
      },
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_ss_export_panel',
      name: 'Export & Lightroom Sync Dock',
      layerId: 'layer_3_studio_ui',
      description: 'Sidecar export dock managing XMP generation, ratings sync, and clean folder handoff.',
      color: 'rose',
      priority: 10,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'exportPreset', type: 'ExportPreset', access: 'public', description: 'XMP or copy export settings' },
        ],
        functions: [
          { name: 'startExport', signature: '(): Promise<ExportSummary>', returnType: 'Promise<ExportSummary>', isAsync: true, description: 'Kicks off batch XMP export runner' },
          { name: 'cancelExport', signature: '(): void', returnType: 'void', description: 'Cancels in-flight write' },
        ],
        state: [
          { name: 'exportStatus', type: "'idle' | 'writing' | 'completed' | 'error'", initialValue: "'idle'", description: 'Export progress state' },
          { name: 'exportedCount', type: 'number', initialValue: '0', description: 'Count of written XMPs' },
        ],
        callers: ['comp_ss_app_header'],
        callees: ['comp_ss_xmp_engine', 'comp_ss_zustand'],
      },
      files: [
        { path: 'src/components/ExportPanel.tsx', status: 'created', linesChanged: 340, description: 'Export dock UI component' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function getShotSelectProject(): BuildViewProject {
  return {
    id: 'proj_shotselect_desktop',
    name: 'ShotSelect Desktop Architecture',
    description: 'Real-world high-speed Electron + React photo culling application mapped directly into BuildView',
    version: '1.0.0',
    layers: getShotSelectLayers(),
    components: getShotSelectComponents(),
    activeStep: 10,
    totalSteps: 10,
    lastUpdated: new Date().toISOString(),
  };
}
