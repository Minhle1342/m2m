export interface NodeType {
  type: string;
  version: number;
  displayName: string;
  description?: string;
  category: string;
  icon?: string;
  inputs: number;
  outputs: number;
  outputNames?: string[];
  properties: Array<{
    name: string;
    displayName: string;
    type: string;
    required?: boolean;
    default?: unknown;
    description?: string;
    options?: Array<{ label: string; value: unknown }>;
  }>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  parameters: Record<string, unknown>;
  credentials?: Record<string, string>;
  disabled?: boolean;
  retry?: { enabled: boolean; maxAttempts: number; delayMs: number; backoff: 'fixed' | 'exponential' };
  timeoutMs?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: { timeoutMs?: number; saveExecutionProgress?: boolean };
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  definition: WorkflowDefinition;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowVersionId: string;
  status: string;
  mode: string;
  triggerData?: unknown;
  output?: unknown;
  error?: unknown;
  retryOfId?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  nodes?: NodeExecution[];
}

export interface NodeExecution {
  id: string;
  nodeId: string;
  nodeName: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  attempt: number;
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type MediaCostBadge =
  | 'LOCAL'
  | 'OPEN-WEIGHT'
  | 'FREE CREDIT'
  | 'PAID'
  | 'BYOK'
  | 'EXPERIMENTAL'
  | 'PREVIEW';

export interface MediaFile {
  id: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  filename?: string;
  localPath?: string;
  url?: string;
  previewUrl?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  provider?: string;
  model?: string;
  seed?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface MediaAssetVersion {
  id: string;
  assetId: string;
  parentVersionId?: string;
  operation: 'generated' | 'edit' | 'remove-object' | 'replace-object' | 'regenerate';
  prompt?: string;
  provider?: string;
  model?: string;
  localPath: string;
  mimeType: string;
  createdAt: string;
}

export interface CredentialTypeDefinition {
  type: string;
  displayName: string;
  category: 'llm' | 'image' | 'video' | 'local-inference' | 'storage' | 'generic';
  costBadge?: MediaCostBadge;
  badges?: MediaCostBadge[];
  description?: string;
  documentationUrl?: string;
  fields: Array<{
    name: string;
    label: string;
    type: 'string' | 'password' | 'select';
    required?: boolean;
    default?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  testConnection?: boolean;
}
