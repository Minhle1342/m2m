import { randomUUID } from 'node:crypto';
import type { NodeRegistry } from '@m2m/node-sdk';
import { ExecutionEntity, WorkflowEntity, WorkflowVersionEntity, type M2MDataSource } from '@m2m/database';
import { BullQueueAdapter, WORKFLOW_QUEUE } from '@m2m/queue';
import { M2MError } from '@m2m/shared';
import { validateWorkflow } from '@m2m/workflow-core';

export async function createWorkflowVersionSnapshot(input: {
  db: M2MDataSource;
  workflow: WorkflowEntity;
  workspaceId: string;
  userId: string;
}): Promise<WorkflowVersionEntity> {
  const nextVersion = input.workflow.version + 1;
  const version = input.db.getRepository(WorkflowVersionEntity).create({
    id: randomUUID(), workspaceId: input.workspaceId, workflowId: input.workflow.id,
    version: nextVersion, definition: input.workflow.definition, createdBy: input.userId,
  });
  input.workflow.version = nextVersion;
  await input.db.transaction(async (manager) => {
    await manager.save(input.workflow);
    await manager.save(version);
  });
  return version;
}

export async function enqueueWorkflow(input: {
  db: M2MDataSource;
  queue: BullQueueAdapter;
  registry: NodeRegistry;
  workspaceId: string;
  userId: string;
  workflow: WorkflowEntity;
  mode: ExecutionEntity['mode'];
  triggerData?: unknown;
  retryOfId?: string;
  workflowVersionId?: string;
}): Promise<ExecutionEntity> {
  let version: WorkflowVersionEntity | null = null;
  if (input.workflowVersionId) {
    version = await input.db.getRepository(WorkflowVersionEntity).findOneBy({
      id: input.workflowVersionId, workflowId: input.workflow.id, workspaceId: input.workspaceId,
    });
    if (!version) throw new M2MError('NOT_FOUND', 'Workflow version not found');
  } else if (input.mode === 'webhook' && input.workflow.activeVersionId) {
    version = await input.db.getRepository(WorkflowVersionEntity).findOneBy({
      id: input.workflow.activeVersionId, workflowId: input.workflow.id, workspaceId: input.workspaceId,
    });
    if (!version) throw new M2MError('NOT_FOUND', 'Active workflow version not found');
  }
  const definition = version?.definition ?? input.workflow.definition;
  const validation = validateWorkflow(definition, input.registry);
  if (!validation.valid) {
    const errorMsg = validation.summaryVi || validation.summary || 'Workflow is invalid';
    throw new M2MError('VALIDATION_ERROR', errorMsg, false, validation.errors);
  }
  version ??= await createWorkflowVersionSnapshot(input);
  const execution = input.db.getRepository(ExecutionEntity).create({
    id: randomUUID(), workspaceId: input.workspaceId, workflowId: input.workflow.id,
    workflowVersionId: version.id, status: 'queued', mode: input.mode,
    triggerData: input.triggerData ?? null, output: null, error: null, queueJobId: null,
    retryOfId: input.retryOfId ?? null, scheduleTickKey: null,
    startedAt: null, finishedAt: null, createdBy: input.userId,
  });
  await input.db.getRepository(ExecutionEntity).save(execution);
  try {
    execution.queueJobId = await input.queue.add(WORKFLOW_QUEUE, { executionId: execution.id }, { jobId: execution.id });
    await input.db.getRepository(ExecutionEntity).save(execution);
    return execution;
  } catch (error) {
    execution.status = 'failed';
    execution.finishedAt = new Date();
    execution.error = { code:'QUEUE_UNAVAILABLE', message:'Redis queue is unavailable. Start Redis with: docker compose up -d redis', retryable:true };
    await input.db.getRepository(ExecutionEntity).save(execution);
    throw new M2MError('QUEUE_UNAVAILABLE', execution.error.message, true, error instanceof Error ? error.message : error);
  }
}
