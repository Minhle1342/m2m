import './load-env.js';
import { Redis } from 'ioredis';
import { initializeDatabase } from '@m2m/database';
import { BullQueueAdapter, ExecutionEventBus, MAINTENANCE_QUEUE, SCHEDULE_QUEUE, WORKFLOW_QUEUE } from '@m2m/queue';
import { createWorkflowProcessor } from './processor.js';
import { createScheduleProcessor, reconcileSchedules } from './schedule-processor.js';
import { createRetentionProcessor } from './retention-processor.js';

const db=await initializeDatabase();await db.runMigrations();
const queue=new BullQueueAdapter();const events=new ExecutionEventBus();
await queue.process(WORKFLOW_QUEUE,createWorkflowProcessor(db,events));
await queue.process(SCHEDULE_QUEUE,createScheduleProcessor(db,queue));
await queue.process(MAINTENANCE_QUEUE,createRetentionProcessor(db));
await queue.addRepeatable(MAINTENANCE_QUEUE,{task:'execution-retention'},'execution-retention',{kind:'every',everyMs:86_400_000});
const scheduleCount=await reconcileSchedules(db,queue);
const redis=new Redis(process.env.REDIS_URL??'redis://127.0.0.1:6379');
redis.on('error', () => { /* handled */ });
const heartbeat=async()=>redis.set('m2m:worker:heartbeat',String(Date.now()),'EX',10);await heartbeat();const timer=setInterval(()=>void heartbeat(),5000);
// m2m workflow execution engine worker process (v1.2 resilient json & expression repair)
const shutdown=async()=>{clearInterval(timer);await redis.del('m2m:worker:heartbeat');redis.disconnect();await queue.close();await events.close();await db.destroy();process.exit(0);};
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
