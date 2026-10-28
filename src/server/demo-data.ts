import { BuildViewProject, ArchitectureComponent, ArchitectureLayer } from '../shared/types.js';

export function getCliDemoLayers(): ArchitectureLayer[] {
  return [
    {
      id: 'layer_storage',
      name: 'Layer 0: Storage & Persistence',
      order: 0,
      description: 'Underlying SQLite database, file-based schema, and local configuration engine',
      color: '#6366f1', // Indigo
    },
    {
      id: 'layer_engine',
      name: 'Layer 1: Core Engine & Logic',
      order: 1,
      description: 'Task orchestration, worker threads, and live telemetry metric collection',
      color: '#06b6d4', // Cyan
    },
    {
      id: 'layer_cli',
      name: 'Layer 2: CLI Routing & TUI',
      order: 2,
      description: 'Terminal argument parsing, subcommand routing, and rich interactive rendering',
      color: '#10b981', // Emerald
    },
  ];
}

export function getCliDemoComponents(): ArchitectureComponent[] {
  return [
    {
      id: 'comp_config_store',
      name: 'Config Store',
      layerId: 'layer_storage',
      description: 'Manages user configuration files, defaults, and schema migrations for the CLI.',
      color: 'indigo',
      priority: 1,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [
          { name: 'configPath', type: 'string', description: 'Path to ~/.devpulse/config.json', access: 'private' },
          { name: 'schemaVersion', type: 'number', description: 'Config version number', access: 'public' },
          { name: 'cache', type: 'Map<string, unknown>', description: 'In-memory config cache', access: 'private' },
        ],
        functions: [
          { name: 'loadConfig', signature: '(): Promise<DevPulseConfig>', returnType: 'Promise<DevPulseConfig>', isAsync: true, description: 'Loads and parses JSON config from disk' },
          { name: 'saveConfig', signature: '(cfg: DevPulseConfig): Promise<void>', returnType: 'Promise<void>', isAsync: true, description: 'Atomic write to user config file' },
          { name: 'get', signature: '<T>(key: string, defaultVal?: T): T', returnType: 'T', description: 'Safely read typed key' },
        ],
        state: [
          { name: 'isLoaded', type: 'boolean', initialValue: 'false', description: 'Whether file has been read once' },
          { name: 'hasUnsavedChanges', type: 'boolean', initialValue: 'false', description: 'Dirty write buffer indicator' },
        ],
        callers: ['comp_task_engine', 'comp_command_router'],
        callees: ['Node fs/promises', 'zod validator'],
      },
      files: [
        { path: 'src/storage/config-store.ts', status: 'planned', description: 'Core config read/write module' },
        { path: 'src/storage/schema.ts', status: 'planned', description: 'Zod config validation schemas' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_sqlite_db',
      name: 'Local SQLite DB',
      layerId: 'layer_storage',
      description: 'Embedded fast storage for historical task logs, execution runs, and telemetry.',
      color: 'indigo',
      priority: 2,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [
          { name: 'dbHandle', type: 'Database.Database', description: 'better-sqlite3 connection instance', access: 'private' },
          { name: 'dbPath', type: 'string', description: 'Filesystem location of devpulse.db', access: 'public' },
        ],
        functions: [
          { name: 'initSchema', signature: '(): void', returnType: 'void', description: 'Runs initial DDL tables migration' },
          { name: 'insertTaskRecord', signature: '(task: TaskRecord): void', returnType: 'void', description: 'Persists task execution record' },
          { name: 'queryMetrics', signature: '(filter: QueryFilter): MetricRow[]', returnType: 'MetricRow[]', description: 'Executes indexed time-range query' },
        ],
        state: [
          { name: 'connectionState', type: "'disconnected' | 'connected' | 'locked'", initialValue: "'disconnected'", description: 'SQLite file lock status' },
        ],
        callers: ['comp_task_engine', 'comp_metric_aggregator'],
        callees: ['better-sqlite3'],
      },
      files: [
        { path: 'src/storage/sqlite-db.ts', status: 'planned', description: 'SQLite connector & prepared queries' },
        { path: 'src/storage/migrations.ts', status: 'planned', description: 'Schema DDL and version tracker' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_task_engine',
      name: 'Task Engine',
      layerId: 'layer_engine',
      description: 'Coordinates asynchronous build task execution, queueing, and lifecycle events.',
      color: 'cyan',
      priority: 3,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [
          { name: 'queue', type: 'PriorityQueue<TaskDef>', description: 'Prioritized pending execution queue', access: 'private' },
          { name: 'maxWorkers', type: 'number', description: 'Max parallel process workers', access: 'public' },
          { name: 'activeWorkers', type: 'Map<string, ChildProcess>', description: 'Running child processes', access: 'private' },
        ],
        functions: [
          { name: 'enqueueTask', signature: '(task: TaskDef): string', returnType: 'string', description: 'Adds task to queue and returns task UUID' },
          { name: 'executeNext', signature: '(): Promise<TaskResult>', returnType: 'Promise<TaskResult>', isAsync: true, description: 'Spawns worker for highest priority item' },
          { name: 'cancelTask', signature: '(id: string): boolean', returnType: 'boolean', description: 'Sends SIGINT to worker' },
        ],
        state: [
          { name: 'engineState', type: "'idle' | 'running' | 'paused'", initialValue: "'idle'", description: 'Current engine operational state' },
          { name: 'runningTasksCount', type: 'number', initialValue: '0', description: 'Current active subprocesses' },
        ],
        callers: ['comp_command_router'],
        callees: ['comp_config_store', 'comp_sqlite_db', 'Node child_process'],
      },
      files: [
        { path: 'src/engine/task-engine.ts', status: 'planned', description: 'Task state machine & executor' },
        { path: 'src/engine/worker-pool.ts', status: 'planned', description: 'Child process worker supervisor' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_metric_aggregator',
      name: 'Metric Aggregator',
      layerId: 'layer_engine',
      description: 'Samples CPU, RAM, and command duration telemetry with moving average smoothing.',
      color: 'cyan',
      priority: 4,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [
          { name: 'buffer', type: 'RingBuffer<MetricSample>', description: 'Rolling 60-second in-memory window', access: 'private' },
          { name: 'sampleRateMs', type: 'number', description: 'Sampling frequency in milliseconds', access: 'public' },
        ],
        functions: [
          { name: 'recordSample', signature: '(s: MetricSample): void', returnType: 'void', description: 'Pushes sample into ring buffer' },
          { name: 'getSummary', signature: '(): StatsSummary', returnType: 'StatsSummary', description: 'Calculates p50, p95 and peak metrics' },
        ],
        state: [
          { name: 'isSampling', type: 'boolean', initialValue: 'false', description: 'Whether background timer is active' },
        ],
        callers: ['comp_task_engine', 'comp_command_router'],
        callees: ['comp_sqlite_db', 'Node os module'],
      },
      files: [
        { path: 'src/engine/metrics.ts', status: 'planned', description: 'Telemetry collector & statistical math' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_command_router',
      name: 'Command Router',
      layerId: 'layer_cli',
      description: 'Parses command line inputs, flags, and delegates to corresponding handlers.',
      color: 'emerald',
      priority: 5,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [
          { name: 'commandRegistry', type: 'Map<string, CommandHandler>', description: 'Registered subcommands map', access: 'private' },
          { name: 'parsedArgs', type: 'ParsedArguments', description: 'Sanitized CLI arguments', access: 'public' },
        ],
        functions: [
          { name: 'parse', signature: '(argv: string[]): ParsedArguments', returnType: 'ParsedArguments', description: 'Extracts flags, positional args and options' },
          { name: 'dispatch', signature: '(cmd: string, args: string[]): Promise<number>', returnType: 'Promise<number>', isAsync: true, description: 'Invokes command handler' },
        ],
        state: [
          { name: 'currentCommand', type: 'string | null', initialValue: 'null', description: 'Currently active subcommand' },
        ],
        callers: ['User Shell (bin/devpulse)'],
        callees: ['comp_task_engine', 'comp_config_store', 'comp_terminal_renderer'],
      },
      files: [
        { path: 'src/cli/router.ts', status: 'planned', description: 'CLI argument parser & dispatcher' },
        { path: 'src/cli/commands/run.ts', status: 'planned', description: 'devpulse run command handler' },
        { path: 'src/cli/commands/status.ts', status: 'planned', description: 'devpulse status command handler' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_terminal_renderer',
      name: 'Terminal Renderer',
      layerId: 'layer_cli',
      description: 'Neumorphic-styled terminal UX with animated spinners, progress bars, and status cards.',
      color: 'emerald',
      priority: 6,
      status: 'planned',
      progress: 0,
      anatomy: {
        members: [
          { name: 'theme', type: 'TuiTheme', description: 'Color palette and unicode glyph symbols', access: 'public' },
          { name: 'outputStream', type: 'NodeJS.WriteStream', description: 'Terminal stdout reference', access: 'private' },
        ],
        functions: [
          { name: 'renderCard', signature: '(title: string, body: string, accent: string): void', returnType: 'void', description: 'Draws boxed neumorphic-styled card in terminal' },
          { name: 'showSpinner', signature: '(msg: string): SpinnerController', returnType: 'SpinnerController', description: 'Starts animated braille terminal spinner' },
          { name: 'renderProgressBar', signature: '(progress: number, label: string): void', returnType: 'void', description: 'Renders unicode progress bar' },
        ],
        state: [
          { name: 'activeSpinners', type: 'number', initialValue: '0', description: 'Count of active terminal animations' },
        ],
        callers: ['comp_command_router', 'comp_task_engine'],
        callees: ['picocolors', 'cli-cursor'],
      },
      files: [
        { path: 'src/cli/ui/renderer.ts', status: 'planned', description: 'Terminal boxed layouts and card drawings' },
        { path: 'src/cli/ui/theme.ts', status: 'planned', description: 'Unicode borders, shadows & color schemes' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function getCliDemoProject(): BuildViewProject {
  return {
    id: 'proj_devpulse_cli',
    name: 'DevPulse CLI Architecture',
    description: 'A developer workspace telemetry and task monitor CLI built layer-by-layer with AI pair programming',
    version: '1.0.0',
    layers: getCliDemoLayers(),
    components: getCliDemoComponents(),
    activeStep: 0,
    totalSteps: 7,
    lastUpdated: new Date().toISOString(),
  };
}

export interface SimulationStep {
  stepIndex: number;
  title: string;
  description: string;
  action: {
    type: 'init' | 'progress' | 'gap_reported' | 'gap_resolved' | 'layer_completed';
    componentId?: string;
    progress?: number;
    status?: 'planned' | 'in_progress' | 'completed' | 'gap_detected';
    files?: Array<{ path: string; status: 'planned' | 'created' | 'modified' | 'deleted'; linesChanged?: number; description?: string }>;
    gap?: { title: string; description: string; severity: 'low' | 'medium' | 'high' | 'critical' };
    gapId?: string;
    resolutionNote?: string;
  };
}

export function getCliDemoSteps(): SimulationStep[] {
  return [
    {
      stepIndex: 1,
      title: 'Phase 1: Build Layer 0 Foundation - Config Store',
      description: 'Agent writes ~/.devpulse/config.json parser, zod schemas, and atomic disk writes.',
      action: {
        type: 'progress',
        componentId: 'comp_config_store',
        progress: 100,
        status: 'completed',
        files: [
          { path: 'src/storage/config-store.ts', status: 'created', linesChanged: 142, description: 'Added atomic write and cached config getters' },
          { path: 'src/storage/schema.ts', status: 'created', linesChanged: 64, description: 'Defined DevPulseConfig zod validation schema' },
        ],
      },
    },
    {
      stepIndex: 2,
      title: 'Phase 2: Implement SQLite Storage Engine',
      description: 'Agent writes SQLite schema migrations and connection pool.',
      action: {
        type: 'progress',
        componentId: 'comp_sqlite_db',
        progress: 60,
        status: 'in_progress',
        files: [
          { path: 'src/storage/sqlite-db.ts', status: 'created', linesChanged: 110, description: 'better-sqlite3 connection setup and statements' },
          { path: 'src/storage/migrations.ts', status: 'created', linesChanged: 85, description: 'V1 DDL tables for tasks & metric points' },
        ],
      },
    },
    {
      stepIndex: 3,
      title: 'Phase 3: Architectural GAP Identified in SQLite DB',
      description: 'Agent notices that concurrent CLI executions fail with SQLITE_BUSY due to missing WAL mode and retry locks.',
      action: {
        type: 'gap_reported',
        componentId: 'comp_sqlite_db',
        gap: {
          title: 'Missing SQLite WAL mode and file lock retry mechanism',
          description: 'Concurrent CLI processes will fail with SQLITE_BUSY error when running tasks simultaneously because database journal is in default DELETE mode.',
          severity: 'high',
        },
      },
    },
    {
      stepIndex: 4,
      title: 'Phase 4: Resolve SQLite Gap & Complete Layer 0',
      description: 'Agent implements PRAGMA journal_mode=WAL and exponential backoff lock retry in src/storage/sqlite-db.ts.',
      action: {
        type: 'gap_resolved',
        componentId: 'comp_sqlite_db',
        progress: 100,
        status: 'completed',
        resolutionNote: 'Enabled SQLite WAL mode (PRAGMA journal_mode = WAL) and implemented 5000ms busy_timeout with exponential backoff.',
        files: [
          { path: 'src/storage/sqlite-db.ts', status: 'modified', linesChanged: 38, description: 'Configured WAL journal mode & busy handler' },
        ],
      },
    },
    {
      stepIndex: 5,
      title: 'Phase 5: Build Layer 1 - Task Engine & Subprocess Pool',
      description: 'Agent implements priority queue, child process workers, and task state transitions.',
      action: {
        type: 'progress',
        componentId: 'comp_task_engine',
        progress: 100,
        status: 'completed',
        files: [
          { path: 'src/engine/task-engine.ts', status: 'created', linesChanged: 215, description: 'Task state machine & async execution loop' },
          { path: 'src/engine/worker-pool.ts', status: 'created', linesChanged: 120, description: 'Subprocess worker supervisor with auto-restart' },
        ],
      },
    },
    {
      stepIndex: 6,
      title: 'Phase 6: Build Metric Aggregator',
      description: 'Agent implements ring-buffer rolling window telemetry collector and os resource sampling.',
      action: {
        type: 'progress',
        componentId: 'comp_metric_aggregator',
        progress: 100,
        status: 'completed',
        files: [
          { path: 'src/engine/metrics.ts', status: 'created', linesChanged: 95, description: 'Rolling 60s memory/CPU window with p95 percentile' },
        ],
      },
    },
    {
      stepIndex: 7,
      title: 'Phase 7: Build Layer 2 - Command Router & Terminal Renderer',
      description: 'Agent builds CLI routing, flags parser, and beautiful Neumorphic-inspired terminal output cards.',
      action: {
        type: 'progress',
        componentId: 'comp_command_router',
        progress: 100,
        status: 'completed',
        files: [
          { path: 'src/cli/router.ts', status: 'created', linesChanged: 150, description: 'Command dispatcher for run, status, and config' },
          { path: 'src/cli/commands/run.ts', status: 'created', linesChanged: 80, description: 'devpulse run subcommand' },
          { path: 'src/cli/commands/status.ts', status: 'created', linesChanged: 60, description: 'devpulse status subcommand' },
          { path: 'src/cli/ui/renderer.ts', status: 'created', linesChanged: 175, description: 'Neumorphic boxed terminal cards & braille spinner' },
          { path: 'src/cli/ui/theme.ts', status: 'created', linesChanged: 45, description: 'Terminal styling palette & icons' },
        ],
      },
    },
  ];
}
