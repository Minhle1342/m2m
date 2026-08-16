import Bull, { type Job, type JobOptions, type ProcessPromiseFunction, type Queue } from 'bull';
import { Redis } from 'ioredis';
import type { ExecutionEvent } from '@m2m/shared';
import { M2MError } from '@m2m/shared';

export const WORKFLOW_QUEUE = 'workflow-execution';
export const SCHEDULE_QUEUE = 'workflow-schedule';
export const MAINTENANCE_QUEUE = 'maintenance';
export interface WorkflowJobPayload { executionId: string; }
export interface ScheduleJobPayload { scheduleId: string; }
export interface MaintenanceJobPayload { task: 'execution-retention'; }
export interface QueueCounts { active:number; completed:number; failed:number; delayed:number; waiting:number; }
export type RepeatSchedule =
  | { kind: 'cron'; cron: string; timezone?: string }
  | { kind: 'every'; everyMs: number };

function integerInRange(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new M2MError('VALIDATION_ERROR', `${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

export function scheduleFromParameters(parameters: Record<string, unknown>): RepeatSchedule {
  const mode = String(parameters.mode ?? 'everyMinutes');
  const minute = integerInRange(parameters.minute ?? 0, 'Minute', 0, 59);
  if (mode === 'everyMinutes') {
    const minutes = integerInRange(parameters.minutes ?? 5, 'Minutes', 1, 525_600);
    return { kind: 'every', everyMs: minutes * 60_000 };
  }
  const timezone = String(parameters.timezone ?? 'UTC').trim();
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new M2MError('VALIDATION_ERROR', `Invalid timezone: ${timezone}`); }
  if (mode === 'hourly') return { kind: 'cron', cron: `${minute} * * * *`, timezone };
  const hour = integerInRange(parameters.hour ?? 9, 'Hour', 0, 23);
  if (mode === 'daily') return { kind: 'cron', cron: `${minute} ${hour} * * *`, timezone };
  if (mode === 'weekly') {
    const weekday = integerInRange(parameters.weekday ?? 1, 'Weekday', 0, 6);
    return { kind: 'cron', cron: `${minute} ${hour} * * ${weekday}`, timezone };
  }
  if (mode === 'cron') {
    const cron = String(parameters.cron ?? '').trim();
    const fields = cron.split(/\s+/);
    if (fields.length !== 5 || fields.some((field) => !/^[A-Za-z\d*/?,#L\-]+$/.test(field))) {
      throw new M2MError('VALIDATION_ERROR', 'Cron must use five fields and valid cron characters');
    }
    return { kind: 'cron', cron, timezone };
  }
  throw new M2MError('VALIDATION_ERROR', `Unsupported schedule mode: ${mode}`);
}

export interface QueueAdapter {
  add(queue: string, payload: unknown, options?: JobOptions): Promise<string>;
  addRepeatable(queue: string, payload: unknown, jobId: string, repeat: RepeatSchedule): Promise<string>;
  removeRepeatable(queue: string, repeatKey: string): Promise<void>;
  retry(jobId: string): Promise<void>;
  remove(jobId: string): Promise<void>;
  pause(queue: string): Promise<void>;
  resume(queue: string): Promise<void>;
  getCounts(queue: string): Promise<QueueCounts>;
}

export class BullQueueAdapter implements QueueAdapter {
  private readonly queues = new Map<string, Queue>();
  constructor(private readonly redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379') {}
  getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) { queue = new Bull(name, this.redisUrl); this.queues.set(name, queue); }
    return queue;
  }
  async add(queue: string, payload: unknown, options: JobOptions = {}): Promise<string> {
    const job = await this.getQueue(queue).add(payload, { removeOnComplete: 100, removeOnFail: 500, ...options });
    return String(job.id);
  }
  async addRepeatable(queue: string, payload: unknown, jobId: string, repeat: RepeatSchedule): Promise<string> {
    const repeatOptions = repeat.kind === 'cron'
      ? { cron: repeat.cron, tz: repeat.timezone }
      : { every: repeat.everyMs };
    await this.getQueue(queue).add(payload, {
      jobId,
      repeat: repeatOptions,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    const registered = (await this.getQueue(queue).getRepeatableJobs()).find((item) => String(item.id) === jobId);
    if (!registered) throw new Error(`Repeatable job was not registered: ${jobId}`);
    return registered.key;
  }
  async removeRepeatable(queue: string, repeatKey: string): Promise<void> {
    await this.getQueue(queue).removeRepeatableByKey(repeatKey);
  }
  async retry(jobId: string): Promise<void> {
    for (const queue of this.queues.values()) { const job = await queue.getJob(jobId); if (job) { await job.retry(); return; } }
    throw new Error(`Job not found: ${jobId}`);
  }
  async remove(jobId: string): Promise<void> {
    for (const queue of this.queues.values()) { const job = await queue.getJob(jobId); if (job) { await job.remove(); return; } }
  }
  async pause(queue: string): Promise<void> { await this.getQueue(queue).pause(); }
  async resume(queue: string): Promise<void> { await this.getQueue(queue).resume(); }
  async getCounts(queue: string): Promise<QueueCounts> { return this.getQueue(queue).getJobCounts(); }
  async process<T>(queue: string, handler: ProcessPromiseFunction<T>): Promise<void> { this.getQueue(queue).process(handler); }
  async getJob(queue: string, id: string): Promise<Job | null> { return this.getQueue(queue).getJob(id); }
  async ping(): Promise<boolean> { return (await this.getQueue(WORKFLOW_QUEUE).client.ping()) === 'PONG'; }
  async close(): Promise<void> { await Promise.all([...this.queues.values()].map((queue) => queue.close())); }
}

const eventChannel = (executionId: string) => `m2m:execution:${executionId}`;

export class ExecutionEventBus {
  private readonly publisher: Redis;
  constructor(private readonly redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379') {
    this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
    this.publisher.on('error', () => { /* handled: suppress unhandled error event crash */ });
  }
  async publish(event: ExecutionEvent): Promise<void> { await this.publisher.publish(eventChannel(event.executionId), JSON.stringify(event)); }
  subscribe(executionId: string, listener: (event: ExecutionEvent) => void): () => Promise<void> {
    const subscriber = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    subscriber.on('error', () => { /* handled: suppress unhandled error event crash */ });
    const channel = eventChannel(executionId);
    void subscriber.subscribe(channel);
    subscriber.on('message', (_channel: string, raw: string) => { try { listener(JSON.parse(raw) as ExecutionEvent); } catch { /* ignore invalid pubsub data */ } });
    return async () => { await subscriber.unsubscribe(channel); subscriber.disconnect(); };
  }
  async close(): Promise<void> { this.publisher.disconnect(); }
}
