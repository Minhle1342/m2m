import 'dotenv/config';
import { initializeDatabase, databasePath } from './data-source.js';
import { seedDevelopment } from './seed.js';

const db = await initializeDatabase();
const migrations = await db.runMigrations();
await seedDevelopment();
console.log(`Database: ${databasePath}`);
console.log(`Applied migrations: ${migrations.length}`);
await db.destroy();
