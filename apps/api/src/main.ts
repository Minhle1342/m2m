import './load-env.js';
import { initializeDatabase, seedDevelopment } from '@m2m/database';
import { BullQueueAdapter, ExecutionEventBus } from '@m2m/queue';
import { createApp } from './app.js';

const db = await initializeDatabase();
await db.runMigrations();
if ((process.env.AUTH_MODE ?? 'development') === 'development') await seedDevelopment();
const queue = new BullQueueAdapter();
const events = new ExecutionEventBus();
const app = createApp(db,queue,events);
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port,()=>console.log(`m2m API listening at http://localhost:${port}`));
const shutdown=async()=>{server.close();await queue.close();await events.close();await db.destroy();process.exit(0);};
process.on('SIGINT',()=>void shutdown()); process.on('SIGTERM',()=>void shutdown());
