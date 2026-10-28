import { BuildViewProject, ArchitectureLayer, ArchitectureComponent } from '../shared/types.js';

export function getDogfoodLayers(): ArchitectureLayer[] {
  return [
    {
      id: 'layer_0_protocol',
      name: 'Layer 0: Protocol & Persistence',
      order: 0,
      description: 'Model Context Protocol (MCP) server, state store, and shared schema contracts',
      color: '#6366f1', // Indigo
    },
    {
      id: 'layer_1_sync',
      name: 'Layer 1: Real-time Sync & API',
      order: 1,
      description: 'Express REST router, Server-Sent Events (SSE) hub, and live client broadcast',
      color: '#06b6d4', // Cyan
    },
    {
      id: 'layer_2_ui',
      name: 'Layer 2: Neumorphic Visualizer Core',
      order: 2,
      description: 'Soft UI design system, layer swimlanes, interactive anatomy drawer, and file hover tracker',
      color: '#10b981', // Emerald
    },
    {
      id: 'layer_3_execution',
      name: 'Layer 3: Execution Guidance & Dogfood Engine',
      order: 3,
      description: 'Roadmap banner directing AI next actions, gap auditor, and simulation playback',
      color: '#f59e0b', // Amber
    },
  ];
}

export function getDogfoodComponents(): ArchitectureComponent[] {
  return [
    {
      id: 'comp_types',
      name: 'Shared Type System & Contracts',
      layerId: 'layer_0_protocol',
      description: 'Core TypeScript definitions and data models for layers, components, API anatomy, files, and gaps.',
      color: 'indigo',
      priority: 1,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'ComponentStatus', type: "'planned' | 'in_progress' | 'completed' | 'gap_detected'", access: 'public', description: 'Lifecycle status enum' },
          { name: 'ArchitectureComponent', type: 'Interface', access: 'public', description: 'Main component schema with anatomy & files' },
          { name: 'GapItem', type: 'Interface', access: 'public', description: 'Architectural gap data model' },
        ],
        functions: [],
        state: [],
        callers: ['comp_store', 'comp_mcp', 'comp_lanes', 'comp_drawer'],
        callees: [],
      },
      files: [
        { path: 'src/shared/types.ts', status: 'created', linesChanged: 78, description: 'Core interfaces and types' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_design_tokens',
      name: 'Design Token System & Compliance Engine',
      layerId: 'layer_0_protocol',
      description: 'Single-source-of-truth token registry, pill styling system, and compliance validator (reusable across all UI layers).',
      color: 'blue',
      priority: 2,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'STATUS_TOKENS', type: 'Record<ComponentStatus, StatusToken>', access: 'public', description: 'Canonical status definitions' },
          { name: 'SEVERITY_TOKENS', type: 'Record<Severity, SeverityToken>', access: 'public', description: 'Canonical gap severity levels' },
          { name: 'LAYER_ACCENTS', type: 'Record<string, LayerAccent>', access: 'public', description: 'Architectural layer color accents' },
        ],
        functions: [
          { name: 'resolveStatusToken', signature: '(status: ComponentStatus, gapCount?: number): StatusToken', returnType: 'StatusToken', description: 'Resolves pill badge & bar color with gap escalation' },
          { name: 'resolveSeverityToken', signature: '(severity: Severity): SeverityToken', returnType: 'SeverityToken', description: 'Resolves gap severity pill' },
          { name: 'validateCompliance', signature: '(component: any): ValidationResult', returnType: 'ValidationResult', description: 'Validates architectural component compliance with design tokens' },
        ],
        state: [
          { name: 'activeTheme', type: "'light' | 'dark'", initialValue: "'light'", description: 'Active color scheme' },
        ],
        callers: ['comp_store', 'comp_lanes', 'comp_drawer', 'StatusBadge', 'SeverityBadge', 'ProgressBar'],
        callees: ['src/client/src/index.css'],
      },
      files: [
        { path: 'src/shared/tokens.ts', status: 'created', linesChanged: 110, description: 'Core tokens and TokenEngine validator' },
        { path: 'src/shared/tokens.test.ts', status: 'created', linesChanged: 58, description: 'Unit test validation suite' },
        { path: 'src/client/src/components/ui/StatusBadge.tsx', status: 'created', linesChanged: 38, description: 'Reusable status pill component' },
        { path: 'src/client/src/components/ui/SeverityBadge.tsx', status: 'created', linesChanged: 20, description: 'Reusable severity pill component' },
        { path: 'src/client/src/components/ui/ProgressBar.tsx', status: 'created', linesChanged: 30, description: 'Reusable progress bar component' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_store',
      name: 'BuildView State Store',
      layerId: 'layer_0_protocol',
      description: 'Central in-memory reactive store with disk persistence (.buildview/state.json) and EventEmitter.',
      color: 'indigo',
      priority: 2,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'project', type: 'BuildViewProject', access: 'private', description: 'Active project architecture state' },
          { name: 'stateFilePath', type: 'string', access: 'private', description: 'Filesystem location of state.json' },
          { name: 'timeline', type: 'TimelineEvent[]', access: 'private', description: 'Audit log of actions' },
        ],
        functions: [
          { name: 'defineComponent', signature: '(comp: ArchitectureComponent): ArchitectureComponent', returnType: 'ArchitectureComponent', description: 'Registers or updates component with API anatomy' },
          { name: 'updateComponentProgress', signature: '(params: UpdateParams): ArchitectureComponent | null', returnType: 'ArchitectureComponent | null', description: 'Updates progress %, status, and files modified' },
          { name: 'reportGap', signature: '(compId: string, gap: GapSpec): GapItem', returnType: 'GapItem', description: 'Flags an architectural gap' },
          { name: 'resolveGap', signature: '(compId: string, gapId: string, note?: string): boolean', returnType: 'boolean', description: 'Resolves an architectural gap' },
          { name: 'getRoadmap', signature: '(): RoadmapSummary', returnType: 'RoadmapSummary', description: 'Calculates next prioritized layer/component to build' },
        ],
        state: [
          { name: 'isLoaded', type: 'boolean', initialValue: 'true', description: 'Store initialized state' },
        ],
        callers: ['comp_mcp', 'comp_api', 'comp_simulation'],
        callees: ['Node fs', 'comp_types'],
      },
      files: [
        { path: 'src/server/store.ts', status: 'created', linesChanged: 230, description: 'State management and persistence' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_mcp',
      name: 'MCP Server Integration',
      layerId: 'layer_0_protocol',
      description: 'Model Context Protocol server exposing tool capabilities to Claude, Antigravity, and Cursor.',
      color: 'indigo',
      priority: 3,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'server', type: 'McpServer', access: 'private', description: 'Official MCP SDK Server instance' },
        ],
        functions: [
          { name: 'buildview_init_project', signature: '(args: InitArgs): Promise<ToolResult>', returnType: 'Promise<ToolResult>', isAsync: true, description: 'MCP tool to initialize architecture layers' },
          { name: 'buildview_define_component', signature: '(args: DefineArgs): Promise<ToolResult>', returnType: 'Promise<ToolResult>', isAsync: true, description: 'MCP tool to register component anatomy' },
          { name: 'buildview_update_progress', signature: '(args: ProgressArgs): Promise<ToolResult>', returnType: 'Promise<ToolResult>', isAsync: true, description: 'MCP tool to push progress and files' },
          { name: 'buildview_report_gap', signature: '(args: GapArgs): Promise<ToolResult>', returnType: 'Promise<ToolResult>', isAsync: true, description: 'MCP tool to report architectural gaps' },
          { name: 'buildview_get_roadmap', signature: '(): Promise<ToolResult>', returnType: 'Promise<ToolResult>', isAsync: true, description: 'MCP tool to guide agent on next priority' },
        ],
        state: [
          { name: 'transportState', type: "'idle' | 'connected'", initialValue: "'connected'", description: 'Active stdio or HTTP transport status' },
        ],
        callers: ['Claude Desktop', 'Antigravity Agent', 'Cursor Agent'],
        callees: ['comp_store', '@modelcontextprotocol/sdk', 'zod'],
      },
      files: [
        { path: 'src/server/mcp.ts', status: 'created', linesChanged: 195, description: 'Tool handlers and zod schemas' },
        { path: 'src/server/mcp-standalone.ts', status: 'created', linesChanged: 20, description: 'Stdio standalone transport runner' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_api',
      name: 'Real-time SSE Hub & REST API',
      layerId: 'layer_1_sync',
      description: 'Express server streaming real-time Server-Sent Events to web browsers on every MCP mutation.',
      color: 'cyan',
      priority: 4,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'router', type: 'express.Router', access: 'private', description: 'Express route handler' },
          { name: 'sseClients', type: 'Response[]', access: 'private', description: 'Active browser SSE connections' },
        ],
        functions: [
          { name: 'handleEvents', signature: '(req: Request, res: Response): void', returnType: 'void', description: 'Establishes SSE keepalive stream' },
          { name: 'broadcast', signature: '(event: string, data: any): void', returnType: 'void', description: 'Pushes update payloads to all open tabs' },
        ],
        state: [
          { name: 'connectedClientCount', type: 'number', initialValue: '0', description: 'Live browser clients' },
        ],
        callers: ['Web Browser UI (Vite App)'],
        callees: ['comp_store', 'express', 'cors'],
      },
      files: [
        { path: 'src/server/api.ts', status: 'created', linesChanged: 85, description: 'API router and SSE stream logic' },
        { path: 'src/server/index.ts', status: 'created', linesChanged: 45, description: 'Unified server entrypoint' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_neu_design',
      name: 'Neumorphic Design System',
      layerId: 'layer_2_ui',
      description: 'Soft UI dual-shadow elevation system, pressed inset states, dark mode, and color themes.',
      color: 'emerald',
      priority: 5,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'neu-flat', type: 'CSS Class', access: 'public', description: 'Extruded soft surface' },
          { name: 'neu-inset', type: 'CSS Class', access: 'public', description: 'Pressed well surface' },
          { name: 'neu-btn', type: 'CSS Class', access: 'public', description: 'Interactive soft button with active press state' },
        ],
        functions: [],
        state: [
          { name: 'activeTheme', type: "'light' | 'dark'", initialValue: "'light'", description: 'Current color scheme' },
        ],
        callers: ['comp_lanes', 'comp_drawer', 'Header'],
        callees: ['Tailwind CSS v4'],
      },
      files: [
        { path: 'src/client/src/index.css', status: 'created', linesChanged: 85, description: 'Neumorphic CSS variables and utility classes' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_drawer',
      name: 'Component Anatomy & File Inspector Drawer',
      layerId: 'layer_2_ui',
      description: 'Interactive slide-over showing API structure (members, functions, state), call graph, files, and gaps.',
      color: 'emerald',
      priority: 6,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'activeTab', type: "'anatomy' | 'graph' | 'files' | 'gaps'", access: 'private', description: 'Current inspector tab' },
        ],
        functions: [
          { name: 'copyPath', signature: '(path: string): void', returnType: 'void', description: 'Copies relative file path to clipboard' },
        ],
        state: [
          { name: 'copiedFile', type: 'string | null', initialValue: 'null', description: 'Path currently copied' },
        ],
        callers: ['comp_lanes', 'RoadmapBanner'],
        callees: ['comp_types', 'lucide-react'],
      },
      files: [
        { path: 'src/client/src/components/ComponentDrawer.tsx', status: 'created', linesChanged: 340, description: 'Anatomy drawer component' },
        { path: 'src/client/src/components/ComponentCard.tsx', status: 'created', linesChanged: 180, description: 'Card with file hover peeker' },
        { path: 'src/client/src/components/LayerLane.tsx', status: 'created', linesChanged: 95, description: 'Layer lane container' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'comp_roadmap',
      name: 'AI Agent Roadmap & Dogfood Engine',
      layerId: 'layer_3_execution',
      description: 'Calculates the next priority component and layer for coding agents, tracks gaps, and provides step simulation.',
      color: 'amber',
      priority: 7,
      status: 'completed',
      progress: 100,
      anatomy: {
        members: [
          { name: 'roadmap', type: 'RoadmapSummary', access: 'public', description: 'Calculated execution sequence' },
        ],
        functions: [
          { name: 'getRoadmap', signature: '(): RoadmapSummary', returnType: 'RoadmapSummary', description: 'Orders layers and prioritizes next build step' },
        ],
        state: [
          { name: 'activeSimulationStep', type: 'number', initialValue: '0', description: 'Current demo playback step' },
        ],
        callers: ['Header', 'App'],
        callees: ['comp_store'],
      },
      files: [
        { path: 'src/client/src/components/RoadmapBanner.tsx', status: 'created', linesChanged: 95, description: 'Roadmap recommendation banner' },
        { path: 'src/client/src/components/SimulationControls.tsx', status: 'planned', description: 'Interactive simulation controls' },
        { path: 'src/client/src/components/GapsModal.tsx', status: 'planned', description: 'Gaps audit dialog' },
      ],
      gaps: [],
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function getDogfoodProject(): BuildViewProject {
  return {
    id: 'proj_buildview_dogfood',
    name: 'BuildView (Self-Building Architecture)',
    description: 'BuildView dogfooding itself: an AI architecture visualizer and MCP execution tracker tracking its own creation!',
    version: '1.0.0',
    layers: getDogfoodLayers(),
    components: getDogfoodComponents(),
    activeStep: 7,
    totalSteps: 7,
    lastUpdated: new Date().toISOString(),
  };
}
