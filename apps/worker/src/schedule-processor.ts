import { randomUUID } from 'node:crypto';
import type { Job } from 'bull';
import { ExecutionEntity, WorkflowEntity, WorkflowScheduleEntity, WorkflowVersionEntity, type M2MDataSource } from '@m2m/database';
import {
  BullQueueAdapter, SCHEDULE_QUEUE, WORKFLOW_QUEUE,
  type RepeatSchedule, type ScheduleJobPayload,
} from '@m2m/queue';
import { M2MError } from '@m2m/shared';

function repeatFromEntity(schedule: WorkflowScheduleEntity): RepeatSchedule {
  if (schedule.kind === 'every' && schedule.everyMs) return { kind: 'every', everyMs: schedule.everyMs };
  if (schedule.kind === 'cron' && schedule.cron) return { kind: 'cron', cron: schedule.cron, timezone: schedule.timezone ?? undefined };
  throw new M2MError('VALIDATION_ERROR', `Stored schedule ${schedule.id} is incomplete`);
}

export function createScheduleProcessor(db: M2MDataSource, queue: BullQueueAdapter) {
  return async (job: Job<ScheduleJobPayload>): Promise<void> => {
    const schedule = await db.getRepository(WorkflowScheduleEntity).findOneBy({ id: job.data.scheduleId, active: true });
    if (!schedule) return;
    const workflow = await db.getRepository(WorkflowEntity).findOneBy({ id: schedule.workflowId, workspaceId: schedule.workspaceId, active: true });
    if (!workflow || workflow.activeVersionId !== schedule.workflowVersionId) return;
    const version = await db.getRepository(WorkflowVersionEntity).findOneBy({ id: schedule.workflowVersionId, workflowId: workflow.id });
    if (!version) throw new M2MError('NOT_FOUND', 'Scheduled workflow version not found');

    const tickKey = `${SCHEDULE_QUEUE}:${String(job.id)}`;
    const executionRepository = db.getRepository(ExecutionEntity);
    if (await executionRepository.findOneBy({ scheduleTickKey: tickKey })) return;
    const execution = executionRepository.create({
      id: randomUUID(), workspaceId: schedule.workspaceId, workflowId: workflow.id,
      workflowVersionId: version.id, status: 'queued', mode: 'schedule',
      triggerData: { scheduleId: schedule.id, scheduledAt: new Date(job.timestamp).toISOString() },
      output: null, error: null, queueJobId: null, retryOfId: null, scheduleTickKey: tickKey,
      startedAt: null, finishedAt: null, createdBy: schedule.createdBy,
    });
    try {
      await executionRepository.save(execution);
    } catch (error) {
      if (await executionRepository.findOneBy({ scheduleTickKey: tickKey })) return;
      throw error;
    }
    try {
      execution.queueJobId = await queue.add(WORKFLOW_QUEUE, { executionId: execution.id }, { jobId: execution.id });
      await executionRepository.save(execution);
    } catch (error) {
      execution.status = 'failed';
      execution.finishedAt = new Date();
      execution.error = { code: 'QUEUE_UNAVAILABLE', message: 'Unable to enqueue scheduled workflow execution', retryable: true };
      await executionRepository.save(execution);
      throw error;
    }
  };
}

export async function reconcileSchedules(db: M2MDataSource, queue: BullQueueAdapter): Promise<number> {
  const repository = db.getRepository(WorkflowScheduleEntity);
  const schedules = await repository.findBy({ active: true });
  for (const schedule of schedules) {
    schedule.repeatKey = await queue.addRepeatable(
      SCHEDULE_QUEUE,
      { scheduleId: schedule.id },
      schedule.id,
      repeatFromEntity(schedule),
    );
  }
  if (schedules.length > 0) await repository.save(schedules);
  return schedules.length;
}
