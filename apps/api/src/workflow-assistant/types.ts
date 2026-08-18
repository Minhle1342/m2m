import { z } from 'zod';
import type { WorkflowDefinition } from '@m2m/shared';

export interface AssistantCredentialSummary {
  id: string;
  name: string;
  type: string;
}

export interface AssistantProviderStatus {
  provider: string;
  available: boolean;
  message?: string;
}

export interface AssistantExecutionContext {
  status: string;
  error?: unknown;
  failedNodeId?: string;
  failedNodeName?: string;
  failedNodeError?: unknown;
}

export interface AssistantNodeType {
  type: string;
  displayName: string;
  category: string;
  description?: string;
  inputs?: number;
  outputs?: number;
  outputNames?: string[];
  properties?: Array<{
    name: string;
    displayName?: string;
    type?: string;
    required?: boolean;
    default?: unknown;
    description?: string;
    options?: Array<{ label?: string; value: unknown }>;
  }>;
}

export interface AssistantRequest {
  prompt: string;
  workflow: WorkflowDefinition;
  nodeTypes?: AssistantNodeType[];
  selectedNodeId?: string;
  availableCredentials?: AssistantCredentialSummary[];
  providerStatuses?: AssistantProviderStatus[];
  recentExecution?: AssistantExecutionContext;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export interface AssistantResponse {
  explanation: string;
  definition: WorkflowDefinition;
  mutationsCount: number;
  changes: string[];
  warnings: string[];
  manualSteps: string[];
  canApply: boolean;
  readyToRun: boolean;
  tokenUsage?: AssistantTokenUsage;
}

export interface AssistantTokenUsage {
  requests: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

const positionSchema = z.object({ x: z.number(), y: z.number() });
const retrySchema = z.object({
  enabled: z.boolean(),
  maxAttempts: z.number().int().min(1).max(10),
  delayMs: z.number().int().min(0),
  backoff: z.enum(['fixed', 'exponential'])
});

const agentNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  position: positionSchema.optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  disabled: z.boolean().optional(),
  retry: retrySchema.optional(),
  timeoutMs: z.number().int().positive().optional()
});

const agentNodePatchSchema = agentNodeSchema.omit({ id: true }).partial();

const agentEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional()
});

const operationSchema = z.object({
  op: z.enum(['addNode', 'updateNode', 'removeNode', 'addEdge', 'updateEdge', 'removeEdge', 'replaceWorkflow']),
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
  node: agentNodeSchema.optional(),
  patch: z.union([agentNodePatchSchema, agentEdgeSchema.partial()]).optional(),
  edge: agentEdgeSchema.optional(),
  nodes: z.array(agentNodeSchema).optional(),
  edges: z.array(agentEdgeSchema).optional(),
  reason: z.string().optional()
}).superRefine((operation, context) => {
  const requireField = (field: keyof typeof operation) => {
    if (operation[field] === undefined) {
      context.addIssue({ code: 'custom', message: `${operation.op} requires '${String(field)}'` });
    }
  };
  if (operation.op === 'addNode') requireField('node');
  if (operation.op === 'updateNode') { requireField('nodeId'); requireField('patch'); }
  if (operation.op === 'removeNode') requireField('nodeId');
  if (operation.op === 'addEdge') requireField('edge');
  if (operation.op === 'updateEdge') { requireField('edgeId'); requireField('patch'); }
  if (operation.op === 'removeEdge') requireField('edgeId');
  if (operation.op === 'replaceWorkflow') { requireField('nodes'); requireField('edges'); }
});

export const workflowAgentPlanSchema = z.object({
  explanation: z.string().min(1),
  operations: z.array(operationSchema).max(100),
  assumptions: z.array(z.string()).optional().default([]),
  manualSteps: z.array(z.string()).optional().default([])
});

export type WorkflowAgentPlan = z.infer<typeof workflowAgentPlanSchema>;
export type WorkflowAgentOperation = z.infer<typeof operationSchema>;

const OPERATION_ALIASES: Record<string, string> = {
  add_node: 'addNode',
  update_node: 'updateNode',
  remove_node: 'removeNode',
  delete_node: 'removeNode',
  add_edge: 'addEdge',
  update_edge: 'updateEdge',
  remove_edge: 'removeEdge',
  delete_edge: 'removeEdge',
  replace_workflow: 'replaceWorkflow'
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Normalize harmless Gemini naming/nesting variants before strict Zod validation. */
export function normalizeWorkflowAgentPlan(value: unknown): unknown {
  const source = asRecord(value);
  if (!source) return value;
  const rawOperations = Array.isArray(source.operations)
    ? source.operations
    : Array.isArray(source.actions)
      ? source.actions
      : [];

  const operations = rawOperations.map((item) => {
    const raw = asRecord(item);
    if (!raw) return item;
    const operationName = String(raw.op ?? raw.operation ?? (
      typeof raw.type === 'string' && /^(?:add|update|remove|delete|replace)[A-Z_]/.test(raw.type)
        ? raw.type
        : ''
    ));
    const op = OPERATION_ALIASES[operationName] ?? operationName;
    const normalized: Record<string, unknown> = Object.fromEntries(
      Object.entries({ ...raw, op }).filter(([, entry]) => entry !== null && entry !== undefined)
    );

    if (op === 'updateNode') {
      const node = asRecord(raw.node);
      normalized.nodeId ??= raw.id ?? node?.id;
      if (!normalized.patch && node) {
        const { id: _id, ...patch } = node;
        normalized.patch = patch;
      }
      delete normalized.node;
    } else if (op === 'removeNode') {
      normalized.nodeId ??= raw.id ?? asRecord(raw.node)?.id;
      delete normalized.node;
    } else if (op === 'addNode' && !normalized.node) {
      const { op: _op, operation: _operation, reason: _reason, ...node } = raw;
      normalized.node = node;
    } else if (op === 'updateEdge') {
      const edge = asRecord(raw.edge);
      normalized.edgeId ??= raw.id ?? edge?.id;
      if (!normalized.patch && edge) {
        const { id: _id, ...patch } = edge;
        normalized.patch = patch;
      }
      delete normalized.edge;
    } else if (op === 'removeEdge') {
      normalized.edgeId ??= raw.id ?? asRecord(raw.edge)?.id;
      delete normalized.edge;
    } else if (op === 'addEdge' && !normalized.edge) {
      const { op: _op, operation: _operation, reason: _reason, ...edge } = raw;
      normalized.edge = edge;
    }
    return normalized;
  });

  return {
    explanation: source.explanation ?? source.summary ?? 'Đã lập kế hoạch cập nhật workflow.',
    operations,
    assumptions: Array.isArray(source.assumptions) ? source.assumptions : [],
    manualSteps: Array.isArray(source.manualSteps)
      ? source.manualSteps
      : Array.isArray(source.manual_steps)
        ? source.manual_steps
        : []
  };
}

const positionJsonSchema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y']
};

const retryJsonSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    maxAttempts: { type: 'integer' },
    delayMs: { type: 'integer' },
    backoff: { type: 'string', enum: ['fixed', 'exponential'] }
  },
  required: ['enabled', 'maxAttempts', 'delayMs', 'backoff']
};

const nodeJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    name: { type: 'string' },
    position: positionJsonSchema,
    parameters: {
      type: 'object',
      additionalProperties: true,
      description: 'Node parameter values using exact property names from the runtime catalog.'
    },
    disabled: { type: 'boolean' },
    retry: retryJsonSchema,
    timeoutMs: { type: 'integer' }
  },
  required: ['id', 'type', 'name', 'parameters']
};

const edgeJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    source: { type: 'string' },
    target: { type: 'string' },
    sourceHandle: { type: 'string' },
    targetHandle: { type: 'string' }
  },
  required: ['id', 'source', 'target']
};

const patchJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    name: { type: 'string' },
    position: positionJsonSchema,
    parameters: {
      type: 'object',
      additionalProperties: true,
      description: 'Only parameter keys whose values should change.'
    },
    disabled: { type: 'boolean' },
    retry: retryJsonSchema,
    timeoutMs: { type: 'integer' },
    source: { type: 'string' },
    target: { type: 'string' },
    sourceHandle: { type: 'string' },
    targetHandle: { type: 'string' }
  }
};

const operationJsonSchemas = [
  {
    type: 'object',
    properties: { op: { type: 'string', enum: ['addNode'] }, node: nodeJsonSchema, reason: { type: 'string' } },
    required: ['op', 'node']
  },
  {
    type: 'object',
    properties: { op: { type: 'string', enum: ['updateNode'] }, nodeId: { type: 'string' }, patch: patchJsonSchema, reason: { type: 'string' } },
    required: ['op', 'nodeId', 'patch']
  },
  {
    type: 'object',
    properties: { op: { type: 'string', enum: ['removeNode'] }, nodeId: { type: 'string' }, reason: { type: 'string' } },
    required: ['op', 'nodeId']
  },
  {
    type: 'object',
    properties: { op: { type: 'string', enum: ['addEdge'] }, edge: edgeJsonSchema, reason: { type: 'string' } },
    required: ['op', 'edge']
  },
  {
    type: 'object',
    properties: { op: { type: 'string', enum: ['updateEdge'] }, edgeId: { type: 'string' }, patch: patchJsonSchema, reason: { type: 'string' } },
    required: ['op', 'edgeId', 'patch']
  },
  {
    type: 'object',
    properties: { op: { type: 'string', enum: ['removeEdge'] }, edgeId: { type: 'string' }, reason: { type: 'string' } },
    required: ['op', 'edgeId']
  },
  {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['replaceWorkflow'] },
      nodes: { type: 'array', items: nodeJsonSchema },
      edges: { type: 'array', items: edgeJsonSchema },
      reason: { type: 'string' }
    },
    required: ['op', 'nodes', 'edges']
  }
];

export const workflowAgentResponseJsonSchema = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    manualSteps: { type: 'array', items: { type: 'string' } },
    operations: {
      type: 'array',
      items: { anyOf: operationJsonSchemas }
    }
  },
  required: ['explanation', 'operations', 'assumptions', 'manualSteps']
};
