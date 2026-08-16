import { randomUUID } from 'node:crypto';
import type { NodeRegistry } from '@m2m/node-sdk';
import { WorkflowEntity, WorkflowScheduleEntity, type M2MDataSource } from '@m2m/database';
import { BullQueueAdapter, SCHEDULE_QUEUE, scheduleFromParameters } from '@m2m/queue';
import { M2MError } from '@m2m/shared';
import { validateWorkflow } from '@m2m/workflow-core';
import { createWorkflowVersionSnapshot } from './execution-service.js';

export async function deactivateWorkflow(input: {
  db: M2MDataSource;
  queue: BullQueueAdapter;
  workflow: WorkflowEntity;
}): Promise<WorkflowEntity> {
  const schedules = await input.db.getRepository(WorkflowScheduleEntity).findBy({ workflowId: input.workflow.id, active: true });
  for (const schedule of schedules) {
    schedule.active = false;
    if (schedule.repeatKey) {
      try { await input.queue.removeRepeatable(SCHEDULE_QUEUE, schedule.repeatKey); }
      catch { /* inactive database state prevents stale ticks from creating executions */ }
    }
  }
  if (schedules.length > 0) await input.db.getRepository(WorkflowScheduleEntity).save(schedules);
  input.workflow.active = false;
  input.workflow.activeVersionId = null;
  return input.db.getRepository(WorkflowEntity).save(input.workflow);
}

export async function activateWorkflow(input: {
  db: M2MDataSource;
  queue: BullQueueAdapter;
  registry: NodeRegistry;
  workflow: WorkflowEntity;
  workspaceId: string;
  userId: string;
}): Promise<WorkflowEntity> {
  const validation = validateWorkflow(input.workflow.definition, input.registry);
  if (!validation.valid) {
    const errorMsg = validation.summaryVi || validation.summary || 'Workflow is invalid';
    throw new M2MError('VALIDATION_ERROR', errorMsg, false, validation.errors);
  }
  await deactivateWorkflow({ db: input.db, queue: input.queue, workflow: input.workflow });
  const version = await createWorkflowVersionSnapshot(input);
  input.workflow.active = true;
  input.workflow.activeVersionId = version.id;
  await input.db.getRepository(WorkflowEntity).save(input.workflow);

  const trigger = version.definition.nodes.find((node) => node.type === 'trigger.schedule');
  if (!trigger) return input.workflow;
  const repeat = scheduleFromParameters(trigger.parameters);
  const repository = input.db.getRepository(WorkflowScheduleEntity);
  let schedule = await repository.findOneBy({ workflowId: input.workflow.id, nodeId: trigger.id });
  schedule ??= repository.create({
    id: randomUUID(), workspaceId: input.workspaceId, workflowId: input.workflow.id,
    nodeId: trigger.id, createdBy: input.userId,
  });
  Object.assign(schedule, {
    workflowVersionId: version.id,
    kind: repeat.kind,
    cron: repeat.kind === 'cron' ? repeat.cron : null,
    everyMs: repeat.kind === 'every' ? repeat.everyMs : null,
    timezone: repeat.kind === 'cron' ? repeat.timezone ?? null : null,
    repeatKey: null,
    active: true,
  });
  await repository.save(schedule);
  try {
    schedule.repeatKey = await input.queue.addRepeatable(SCHEDULE_QUEUE, { scheduleId: schedule.id }, schedule.id, repeat);
    await repository.save(schedule);
    return input.workflow;
  } catch (error) {
    schedule.active = false;
    input.workflow.active = false;
    input.workflow.activeVersionId = null;
    await repository.save(schedule);
    await input.db.getRepository(WorkflowEntity).save(input.workflow);
    throw new M2MError('QUEUE_UNAVAILABLE', 'Unable to register the persistent schedule in Redis', true, error instanceof Error ? error.message : error);
  }
}
