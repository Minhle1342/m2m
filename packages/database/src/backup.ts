import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { databasePath } from './data-source.js';

const backupDirectory = path.resolve(process.cwd(), process.env.BACKUP_DIRECTORY ?? './backups');
await fs.mkdir(backupDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDirectory, `m2m-${stamp}.sqlite`);
await fs.copyFile(databasePath, target);
console.log(`Database backup created: ${target}`);
