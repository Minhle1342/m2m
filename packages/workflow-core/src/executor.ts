import type { CredentialValue, NodeExecutionContext, NodeRegistry, NodeStateStore } from '@m2m/node-sdk';
import {
  M2MError,
  serializeError,
  type ExecutionEvent,
  type NodeExecutionResult,
  type SerializedError,
  type WorkflowDefinition,
  type WorkflowNode,
} from '@m2m/shared';
import { resolveExpressions } from './expression/index.js';
import { validateWorkflow } from './validation.js';

export interface NodeLifecycleRecord {
  node: WorkflowNode;
  input: unknown;
  output?: NodeExecutionResult;
  error?: SerializedError;
  attempt: number;
  startedAt: Date;
  finishedAt: Date;
}

export interface WorkflowExecutorHooks {
  publish(event: ExecutionEvent): Promise<void>;
  nodeStarted(node: WorkflowNode, input: unknown, attempt: number): Promise<void>;
  nodeFinished(record: NodeLifecycleRecord): Promise<void>;
  nodeSkipped?(node: WorkflowNode): Promise<void>;
  resolveCredentials(node: WorkflowNode): Promise<Record<string, CredentialValue>>;
  createStateStore?(node: WorkflowNode): Promise<NodeStateStore>;
  isCancelled(): Promise<boolean>;
}

export interface ExecuteWorkflowInput {
  executionId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  triggerData?: unknown;
  registry: NodeRegistry;
  hooks: WorkflowExecutorHooks;
  env?: Record<string, string>;
  startNodeId?: string;
  initialResults?: Record<string, NodeExecutionResult>;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new M2MError('TIMEOUT_ERROR', `Node timed out after ${timeoutMs}ms`, true)),
    timeoutMs,
  );
  try {
    return await task(AbortSignal.any([controller.signal, parentSignal]));
  } finally {
    clearTimeout(timer);
  }
}

export async function executeWorkflow(input: ExecuteWorkflowInput): Promise<Record<string, NodeExecutionResult>> {
  const { definition, registry, hooks, executionId, workflowId } = input;
  const validation = validateWorkflow(definition, registry);
  if (!validation.valid) {
    throw new M2MError('VALIDATION_ERROR', 'Workflow is invalid', false, validation.errors);
  }
  const results: Record<string, NodeExecutionResult> = { ...(input.initialResults ?? {}) };
  const incoming = new Map<string, typeof definition.edges>();
  for (const edge of definition.edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }
  const explicitStartNodeId =
    input.startNodeId ||
    (typeof input.triggerData === 'object' && input.triggerData !== null && 'startNodeId' in input.triggerData
      ? String((input.triggerData as Record<string, unknown>).startNodeId)
      : undefined);

  const initialQueue: string[] = [];
  if (explicitStartNodeId && definition.nodes.some((n) => n.id === explicitStartNodeId)) {
    initialQueue.push(explicitStartNodeId);
  } else {
    for (const node of definition.nodes) {
      if (registry.get(node.type).metadata.category === 'trigger') {
        initialQueue.push(node.id);
      }
    }
  }

  const queue = [...initialQueue];
  const completed = new Set<string>();
  const skipped = new Set<string>();
  const queued = new Set(queue);
  const workflowController = new AbortController();
  const workflowTimeoutMs = definition.settings.timeoutMs ?? Number(process.env.WORKFLOW_TIMEOUT_MS ?? 300_000);
  const workflowTimer = setTimeout(
    () => workflowController.abort(new M2MError('TIMEOUT_ERROR', 'Workflow timed out', true)),
    workflowTimeoutMs,
  );

  await hooks.publish({
    executionId,
    workflowId,
    event: 'execution.started',
    timestamp: new Date().toISOString(),
  });
  try {
    const edgeIsActive = (edge: (typeof definition.edges)[number]): boolean => {
      if (!completed.has(edge.source)) return false;
      return !edge.sourceHandle || edge.sourceHandle === results[edge.source]?.branch;
    };
    const settleReadyNodes = async (): Promise<void> => {
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of definition.nodes) {
          if (completed.has(candidate.id) || skipped.has(candidate.id) || queued.has(candidate.id)) continue;
          const candidateEdges = incoming.get(candidate.id) ?? [];
          if (candidateEdges.length === 0) continue;

          // If execution started from a specific node, activate candidate if any parent completed from this run
          if (explicitStartNodeId) {
            const hasActiveCompletedParent = candidateEdges.some((edge) => completed.has(edge.source) && edgeIsActive(edge));
            if (hasActiveCompletedParent) {
              queue.push(candidate.id);
              queued.add(candidate.id);
              changed = true;
            }
            continue;
          }

          if (!candidateEdges.every((edge) => completed.has(edge.source) || skipped.has(edge.source))) continue;
          if (candidateEdges.some(edgeIsActive)) {
            queue.push(candidate.id);
            queued.add(candidate.id);
          } else {
            skipped.add(candidate.id);
            await hooks.nodeSkipped?.(candidate);
            await hooks.publish({ executionId, workflowId, nodeId: candidate.id, event: 'node.skipped', timestamp: new Date().toISOString() });
          }
          changed = true;
        }
      }
    };
    while (queue.length > 0) {
      if (workflowController.signal.aborted) throw workflowController.signal.reason;
      if (await hooks.isCancelled()) throw new M2MError('EXECUTION_CANCELLED', 'Execution cancelled');
      const nodeId = queue.shift()!;
      const node = definition.nodes.find((item) => item.id === nodeId)!;
      const parentEdges = (incoming.get(node.id) ?? []).filter(edgeIsActive);
      let inputJson: unknown;
      if (parentEdges.length === 1) {
        inputJson = results[parentEdges[0].source]?.json ?? input.triggerData ?? {};
      } else if (parentEdges.length > 1) {
        inputJson = parentEdges.map((edge) => results[edge.source]?.json);
      } else {
        // If no active parent edge in this run (e.g. root node or running from startNodeId), check if results exist for incoming parents
        const allIncomingEdges = incoming.get(node.id) ?? [];
        const availableParentResults = allIncomingEdges
          .map((edge) => results[edge.source]?.json)
          .filter(Boolean);

        if (availableParentResults.length === 1) {
          inputJson = availableParentResults[0];
        } else if (availableParentResults.length > 1) {
          inputJson = availableParentResults;
        } else {
          inputJson = input.triggerData ?? {};
        }
      }
      if (node.disabled) {
        results[node.id] = { json: inputJson };
        completed.add(node.id);
        await hooks.nodeSkipped?.(node);
        await hooks.publish({ executionId, workflowId, nodeId: node.id, event: 'node.skipped', timestamp: new Date().toISOString(), data: { disabled: true } });
        await settleReadyNodes();
        continue;
      }
      const resolvedNode: WorkflowNode = {
        ...node,
        parameters: resolveExpressions(node.parameters, {
          json: inputJson,
          node: Object.fromEntries(
            definition.nodes.flatMap((item) => {
              const result = results[item.id];
              return result ? [[item.id, result], [item.name, result]] : [];
            }),
          ),
          env: input.env ?? {},
          workflow: { id: workflowId },
          execution: { id: executionId },
        }) as Record<string, unknown>,
      };
      const implementation = registry.get(node.type);
      const retry = node.retry ?? { enabled: false, maxAttempts: 1, delayMs: 0, backoff: 'fixed' as const };
      const maxAttempts = retry.enabled ? Math.max(1, retry.maxAttempts) : 1;
      let result: NodeExecutionResult | undefined;
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const startedAt = new Date();
        await hooks.nodeStarted(node, inputJson, attempt);
        await hooks.publish({
          executionId,
          workflowId,
          nodeId: node.id,
          event: 'node.started',
          timestamp: startedAt.toISOString(),
          data: { attempt },
        });
        try {
          const credentials = await hooks.resolveCredentials(node);
          const state = await hooks.createStateStore?.(node);
          result = await withTimeout(
            (signal) => {
              const context: NodeExecutionContext = {
                executionId,
                workflowId,
                node: resolvedNode,
                input: inputJson,
                nodeOutputs: results,
                env: input.env ?? {},
                credentials,
                state,
                signal,
              };
              return implementation.execute(context);
            },
            node.timeoutMs ?? Number(process.env.NODE_TIMEOUT_MS ?? 60_000),
            workflowController.signal,
          );
          const finishedAt = new Date();
          await hooks.nodeFinished({ node, input: inputJson, output: result, attempt, startedAt, finishedAt });
          await hooks.publish({
            executionId,
            workflowId,
            nodeId: node.id,
            event: 'node.completed',
            timestamp: finishedAt.toISOString(),
            data: result,
          });
          break;
        } catch (error) {
          lastError = error;
          const serialized = serializeError(error);
          const finishedAt = new Date();
          const canRetry = attempt < maxAttempts && serialized.retryable;
          await hooks.nodeFinished({
            node,
            input: inputJson,
            error: serialized,
            attempt,
            startedAt,
            finishedAt,
          });
          if (!canRetry) {
            await hooks.publish({
              executionId,
              workflowId,
              nodeId: node.id,
              event: 'node.failed',
              timestamp: finishedAt.toISOString(),
              data: serialized,
            });
            throw error;
          }
          const waitMs = retry.backoff === 'exponential' ? retry.delayMs * 2 ** (attempt - 1) : retry.delayMs;
          await delay(waitMs, workflowController.signal);
        }
      }
      if (!result) throw lastError;
      results[node.id] = result;
      completed.add(node.id);
      await settleReadyNodes();
    }
    return results;
  } finally {
    clearTimeout(workflowTimer);
  }
}
