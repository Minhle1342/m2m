export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'success'
  | 'failed'
  | 'cancelled';

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface WorkflowPosition {
  x: number;
  y: number;
}

export interface RetryPolicy {
  enabled: boolean;
  maxAttempts: number;
  delayMs: number;
  backoff: 'fixed' | 'exponential';
}

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: WorkflowPosition;
  parameters: Record<string, unknown>;
  credentials?: Record<string, string>;
  disabled?: boolean;
  retry?: RetryPolicy;
  timeoutMs?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowSettings {
  timeoutMs?: number;
  saveExecutionProgress?: boolean;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}

export interface SerializedError {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface NodeExecutionResult {
  json: unknown;
  branch?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionEvent {
  executionId: string;
  workflowId: string;
  nodeId?: string;
  event:
    | 'execution.started'
    | 'node.started'
    | 'node.completed'
    | 'node.skipped'
    | 'node.failed'
    | 'execution.completed'
    | 'execution.failed'
    | 'media.generation.queued'
    | 'media.generation.started'
    | 'media.generation.progress'
    | 'media.generation.completed'
    | 'media.generation.failed';
  timestamp: string;
  data?: unknown;
}

export type MediaCostBadge =
  | 'LOCAL'
  | 'OPEN-WEIGHT'
  | 'FREE CREDIT'
  | 'PAID'
  | 'BYOK'
  | 'EXPERIMENTAL'
  | 'PREVIEW';

export type MediaTask =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'video-to-video'
  | 'image-edit'
  | 'inpainting';

export interface MediaModelCapabilities {
  textToImage?: boolean;
  imageToImage?: boolean;
  textToVideo?: boolean;
  imageToVideo?: boolean;
  videoToVideo?: boolean;
  imageEdit?: boolean;
  inpainting?: boolean;
  referenceImage?: boolean;
  multipleReferenceImages?: boolean;
  negativePrompt?: boolean;
  seed?: boolean;
  steps?: boolean;
  guidance?: boolean;
  customResolution?: boolean;
  aspectRatio?: boolean;
  duration?: boolean;
  fps?: boolean;
  motionStrength?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
}

export interface MediaModelLicense {
  name: string;
  url?: string;
  commercialUse: 'allowed' | 'restricted' | 'unknown';
}

export interface MediaModel {
  id: string;
  provider: string;
  displayName: string;
  task: MediaTask;
  tasks?: MediaTask[];
  executionMode: 'local' | 'cloud';
  costTier: 'local-free' | 'free-credit' | 'paid' | 'unknown';
  badges: MediaCostBadge[];
  capabilities: MediaModelCapabilities;
  license?: MediaModelLicense;
  documentationUrl?: string;
  description?: string;
}

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

export interface MediaGenerationJob {
  id: string;
  workspaceId: string;
  executionId?: string;
  nodeExecutionId?: string;
  provider: string;
  model: string;
  providerJobId?: string;
  status: 'queued' | 'submitted' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: SerializedError;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface MediaAssetVersion {
  id: string;
  assetId: string;
  parentVersionId?: string;
  operation: 'generated' | 'edit' | 'remove-object' | 'replace-object' | 'regenerate';
  prompt?: string;
  provider?: string;
  model?: string;
  fileId: string;
  previewUrl: string;
  createdAt: string;
}

export interface MediaAssetReference {
  id: string;
  assetId: string;
  referenceType: 'node-input' | 'node-output' | 'workflow' | 'execution' | 'media-parent';
  referenceId: string;
  createdAt: string;
}

export class M2MError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'M2MError';
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof M2MError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { code: 'INTERNAL_ERROR', message, retryable: false };
}

export const LOCAL_USER_ID = 'local-user';
export const LOCAL_WORKSPACE_ID = 'local-workspace';
