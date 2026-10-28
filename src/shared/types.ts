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
}

export interface ComponentAnatomy {
  members: DataMember[];
  functions: FunctionSpec[];
  state: StateItem[];
  callers: string[]; // Component IDs or external callers (e.g., 'User CLI', 'Agent CLI')
  callees: string[]; // Component IDs that this component calls
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  layerId: string;
  description: string;
  color: string; // Accent color token or hex (e.g., 'cyan', 'indigo', 'emerald', 'amber', 'rose', 'purple')
  priority: number; // 1 = highest priority / build first
  status: ComponentStatus;
  progress: number; // 0 - 100%
  anatomy: ComponentAnatomy;
  files: FileChange[];
  gaps: GapItem[];
  updatedAt: string;
}

export interface ArchitectureLayer {
  id: string;
  name: string;
  order: number; // 0 = lowest foundation layer, 1 = mid, 2 = top interface
  description: string;
  color?: string;
}

export interface BuildViewProject {
  id: string;
  name: string;
  description: string;
  version: string;
  layers: ArchitectureLayer[];
  components: ArchitectureComponent[];
  activeStep?: number;
  totalSteps?: number;
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
