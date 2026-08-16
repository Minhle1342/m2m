import type { NodeExecutionResult, WorkflowNode } from '@m2m/shared';

export interface NodePropertyOption {
  label: string;
  value: string | number | boolean;
}

export interface NodeProperty {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select' | 'credential';
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: NodePropertyOption[];
}

export interface NodeMetadata {
  type: string;
  version: number;
  displayName: string;
  description?: string;
  category: 'trigger' | 'core' | 'ai' | 'data' | 'media';
  icon?: string;
  inputs: number;
  outputs: number;
  outputNames?: string[];
  properties: NodeProperty[];
}

export interface CredentialValue {
  id?: string;
  name?: string;
  type: string;
  data: Record<string, string>;
}

export interface NodeStateStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface NodeExecutionContext {
  executionId: string;
  workflowId: string;
  node: WorkflowNode;
  input: unknown;
  nodeOutputs: Readonly<Record<string, NodeExecutionResult>>;
  env: Readonly<Record<string, string>>;
  credentials: Readonly<Record<string, CredentialValue>>;
  state?: NodeStateStore;
  signal: AbortSignal;
}

export interface M2MNode {
  type: string;
  version: number;
  metadata: NodeMetadata;
  execute(context: NodeExecutionContext): Promise<NodeExecutionResult>;
}

export class NodeRegistry {
  private readonly nodes = new Map<string, M2MNode>();
  private readonly aliases = new Map<string, string>();

  register(node: M2MNode): void {
    if (this.nodes.has(node.type)) throw new Error(`Node type already registered: ${node.type}`);
    this.nodes.set(node.type, node);
  }

  registerAlias(alias: string, targetType: string): void {
    this.aliases.set(alias, targetType);
  }

  resolveType(type: string): string {
    if (this.nodes.has(type)) return type;
    if (this.aliases.has(type)) return this.aliases.get(type)!;

    const lower = type.toLowerCase();
    if (lower === 'media.generateimage' || lower === 'generateimage' || lower === 'image_gen' || lower === 'image' || lower.includes('flux')) {
      if (this.nodes.has('m2m.media.generateImage')) return 'm2m.media.generateImage';
    }
    if (lower === 'media.imagetovideo' || lower === 'imagetovideo' || lower === 'video_gen' || lower === 'video' || lower.includes('wan')) {
      if (this.nodes.has('m2m.media.imageToVideo')) return 'm2m.media.imageToVideo';
    }
    if (lower === 'media.editimage' || lower === 'editimage' || lower.includes('inpaint')) {
      if (this.nodes.has('m2m.media.editImage')) return 'm2m.media.editImage';
    }
    if (lower === 'media.savemedia' || lower === 'savemedia' || lower.includes('file_storage') || lower.includes('storage')) {
      if (this.nodes.has('m2m.media.saveMedia')) return 'm2m.media.saveMedia';
    }
    if (lower === 'media.storyboardsplitter' || lower === 'storyboard') {
      if (this.nodes.has('m2m.media.storyboardSplitter')) return 'm2m.media.storyboardSplitter';
    }
    if (lower === 'ai.mediapromptbuilder' || lower === 'mediapromptbuilder') {
      if (this.nodes.has('m2m.ai.mediaPromptBuilder')) return 'm2m.ai.mediaPromptBuilder';
    }
    if (lower === 'media.mergevideo' || lower === 'mergevideo') {
      if (this.nodes.has('m2m.media.mergeVideo')) return 'm2m.media.mergeVideo';
    }
    if (lower === 'core.jscode' || lower === 'core.code' || lower === 'jscode' || lower === 'javascript') {
      if (this.nodes.has('core.jsCode')) return 'core.jsCode';
      if (this.nodes.has('core.code')) return 'core.code';
    }
    if (lower === 'trigger.cron' || lower === 'cron') {
      if (this.nodes.has('trigger.schedule')) return 'trigger.schedule';
    }
    if (lower === 'ai.llm' || lower === 'text_gen') {
      if (this.nodes.has('ai.prompt')) return 'ai.prompt';
    }

    return type;
  }

  get(type: string): M2MNode {
    const resolved = this.resolveType(type);
    const node = this.nodes.get(resolved);
    if (!node) throw new Error(`Unknown node type: ${type}`);
    return node;
  }

  has(type: string): boolean {
    const resolved = this.resolveType(type);
    return this.nodes.has(resolved);
  }

  list(): NodeMetadata[] {
    return [...this.nodes.values()].map((node) => node.metadata);
  }
}
