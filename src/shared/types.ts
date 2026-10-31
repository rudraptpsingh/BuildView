export type ComponentStatus = 'planned' | 'in_progress' | 'completed' | 'gap_detected';

export interface DataMember {
  name: string;
  type: string;
  description?: string;
  access?: 'public' | 'private' | 'protected';
}

export interface FunctionSpec {
  name: string;
  signature: string;
  description?: string;
  returnType?: string;
  isAsync?: boolean;
}

export interface StateItem {
  name: string;
  type: string;
  description?: string;
  initialValue?: string;
  lifecycle?: string;
}

export interface FileChange {
  path: string;
  status: 'planned' | 'created' | 'modified' | 'deleted';
  linesChanged?: number;
  description?: string;
}

export interface GapItem {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolutionNote?: string;
  /** Rule that produced the gap (e.g. 'circular_dependency', 'type_only_boundary'). */
  kind?: string;
  /** Imports behind the gap, as "file:line → target". */
  evidence?: string[];
}

export type ComponentGap = GapItem;

export interface TestCaseInfo {
  name: string;
  suite: string;
}

export interface TestFileInfo {
  path: string;
  testCount?: number;
  suites?: string[];
  testCases: TestCaseInfo[];
  testFramework?: string;
}

export interface TestCoverageSummary {
  testFilesCount: number;
  totalTests: number;
  status: 'tested' | 'partial' | 'untested';
  coverageEstimatePercent: number;
}

export interface AstMetrics {
  totalFunctions: number;
  totalClasses: number;
  totalInterfaces: number;
  totalExports: number;
  linesOfCode: number;
}

export interface ComponentAnatomy {
  members: DataMember[];
  functions: FunctionSpec[];
  state: StateItem[];
  callers: string[]; // Component IDs or external callers (e.g., 'User CLI', 'Agent CLI')
  callees: string[]; // Component IDs that this component calls
}

export interface DuplicateCodeItem {
  name: string;
  sourceFile: string;
  duplicateOfFile: string;
  similarity: number; // e.g. 0.85 - 1.0
  reason: string;
}

/**
 * An export nobody imports. `local_only`: still used inside its own file, so
 * only the `export` keyword is unnecessary (low). `dead`: never referenced
 * anywhere, so the code itself can go (medium).
 */
export interface UnusedExportDetail {
  name: string;
  file: string;
  line: number;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type';
  usage: 'local_only' | 'dead';
  severity: 'low' | 'medium';
  message: string;
}

export interface WasteMetrics {
  unusedExports: string[];
  /** Per-export detail with file:line and local-only vs dead classification. */
  unusedExportDetails?: UnusedExportDetail[];
  deadCodeLines: number;
  duplicateFunctions: DuplicateCodeItem[];
  orphanFiles: string[];
  testZombies: string[]; // only referenced in tests, uncalled in production
  cleanlinessScore: number; // 0 - 100%
  recommendation: 'prune' | 'investigate' | 'clean';
}

export interface FigmaMappingInfo {
  name: string;
  nodeId: string;
  source: string;
  exportName?: string;
}

/**
 * Why a component sits in its layer. Layer-inversion checks only trust
 * `config`, `keyword` and `shared`; the rest are fallback guesses.
 */
export type LayerSource = 'config' | 'keyword' | 'shared' | 'runtime' | 'tooling' | 'default';

export interface PlanningDataPort {
  name: string;
  schemaRef: string;
  description: string;
  required?: boolean;
}

export interface ComponentPlanning {
  goal?: string;
  method?: string;
  outcome?: string;
  inputs?: PlanningDataPort[];
  outputs?: PlanningDataPort[];
  acceptanceTests?: Array<{id:string;description:string;evidence:string}>;
  integrationContracts?: Array<{boundary:string;input:string;output:string;failureBehavior:string;validation:string}>;
  reuseBoundaries?: Array<{tool:string;responsibility:string;ownedWork:string}>;
  evidenceRequired?: string[];
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  layerId: string;
  /** How the layer was chosen (auto-clustered components only). */
  layerSource?: LayerSource;
  description: string;
  color: string; // Accent color token or hex (e.g., 'cyan', 'indigo', 'emerald', 'amber', 'rose', 'purple')
  priority: number; // 1 = highest priority / build first
  status: ComponentStatus;
  progress: number; // 0 - 100%
  anatomy: ComponentAnatomy;
  files: FileChange[];
  testFiles?: TestFileInfo[];
  testSummary?: TestCoverageSummary;
  astMetrics?: AstMetrics;
  wasteMetrics?: WasteMetrics;
  figmaComponents?: FigmaMappingInfo[];
  gaps: GapItem[];
  updatedAt: string;
  /** Optional planned implementation ownership globs (repo-relative). */
  fileGlobs?: string[];
  /** Plan reference, excluded from implicit code ownership. */
  planSource?: string;
  module?: string;
  planning?: ComponentPlanning;
}

export interface ArchitectureLayer {
  id: string;
  name: string;
  order: number; // 0 = lowest foundation layer, 1 = mid, 2 = top interface
  description: string;
  color?: string;
}

export interface ArchitectureStep {
  id: string;
  order: number;
  title: string;
  description: string;
  targetComponentId: string;
  action: 'create' | 'refactor' | 'deprecate' | 'verify';
  status: 'pending' | 'in_progress' | 'completed';
  requiredFiles?: string[];
  verificationCriteria?: string[];
}

export interface ArchitecturePlan {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  status: 'draft' | 'in_progress' | 'completed';
  activeStepIndex: number;
  steps: ArchitectureStep[];
  affectedComponentIds: string[]; // Blast radius component IDs
}

export interface RepositoryFileDelta {
  path: string;
  status: 'created' | 'modified' | 'deleted';
  observedAt: string;
  componentIds: string[];
}

export interface BuildViewProject {
  id: string;
  name: string;
  description: string;
  version: string;
  layers: ArchitectureLayer[];
  components: ArchitectureComponent[];
  figmaBridge?: {
    fileKey?: string;
    totalMappedComponents: number;
  };
  activePlan?: ArchitecturePlan;
  activeStep?: number;
  totalSteps?: number;
  healthScore?: ArchitectureHealthScore;
  repositoryWatch?: {
    root: string;
    snapshot: Record<string,string>;
    lastScanAt: string;
    error?: string;
    planDrift?: boolean;
  };
  /** Latest observed delta per path, capped to 500 records; not a git diff. */
  workingTreeChanges?: RepositoryFileDelta[];
  lastUpdated: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'init' | 'component_added' | 'progress_update' | 'gap_reported' | 'gap_resolved' | 'file_changed';
  componentId?: string;
  title: string;
  description: string;
}

export type HealthGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreDimension {
  name: string;
  score: number; // 0 - 100
  weight: number; // e.g. 0.35
  deductions: Array<{ reason: string; penalty: number; file?: string; line?: number }>;
  summary: string;
}

export interface RemediationAction {
  id: string;
  priority: 1 | 2 | 3; // 1 = highest ROI
  category: 'architecture' | 'cleanliness' | 'verification' | 'modularity';
  title: string;
  impactScorePoints: number;
  description: string;
  file?: string;
  line?: number;
}

export interface ArchitectureHealthScore {
  overallScore: number; // 0 - 100
  grade: HealthGrade;
  dimensions: {
    architecture: ScoreDimension;
    cleanliness: ScoreDimension;
    verification: ScoreDimension;
    modularity: ScoreDimension;
  };
  remediationPlan: RemediationAction[];
  generatedAt: string;
}

export interface AgentBenchmarkEvaluation {
  verdict: 'improved' | 'regressed' | 'neutral' | 'blocked';
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  gradeBefore: HealthGrade;
  gradeAfter: HealthGrade;
  regressionsIntroduced: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    evidence?: string[];
  }>;
  improvementsAchieved: Array<{
    type: string;
    message: string;
  }>;
  tokenSavingsEstimate: {
    rawFilesTokens: number;
    componentContractTokens: number;
    tokensSaved: number;
    savingsPercent: number;
  };
  summary: string;
}

export interface PerformanceViolation {
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high';
  kind: 'sync_fs_in_ui' | 'sync_exec_in_ui' | 'sync_ipc' | 'sync_fs_in_main_startup';
  operation: string;
  message: string;
  contextSnippet?: string;
  remediation: string;
}

export interface PerformanceMetrics {
  totalViolations: number;
  syncFsInUiCount: number;
  syncExecCount: number;
  syncIpcCount: number;
  filesWithViolations: string[];
}

export interface AgentRemediationCard {
  gapId: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'architecture' | 'cleanliness' | 'verification' | 'performance' | 'design_tokens';
  targetFiles: string[];
  diagnosis: string;
  extractionPlan?: {
    newFile?: string;
    symbolsToMove?: string[];
    importUpdates?: Array<{ file: string; addImport: string; removeImport?: string }>;
  };
  verificationCommand: string;
  tokenCostEstimate: number;
  tokenSavingsVsRawDump: number;
  agentPromptText: string;
}

