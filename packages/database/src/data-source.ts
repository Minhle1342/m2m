import 'reflect-metadata';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import {
  AuditLogEntity, AuthSessionEntity, CredentialEntity, ExecutionEntity, IdempotencyKeyEntity,
  MediaAssetEntity, MediaAssetReferenceEntity, MediaAssetVersionEntity, MediaGenerationJobEntity,
  NodeExecutionEntity, NodeMemoryEntity,
  UserEntity, WorkflowEntity, WorkflowScheduleEntity, WorkflowVersionEntity, WorkspaceEntity, WorkspaceMemberEntity,
} from './entities.js';
import { InitialSchema1760000000000 } from './migrations/0001-initial.js';
import { WorkflowSchedules1760000000001 } from './migrations/0002-workflow-schedules.js';
import { MediaAssets1760000000002 } from './migrations/0003-media-assets.js';

const configuredPath = process.env.DATABASE_PATH ?? './data/m2m.sqlite';
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export function resolveDatabasePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}
export const databasePath = resolveDatabasePath(configuredPath);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: databasePath,
  synchronize: false,
  migrationsRun: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
  entities: [
    UserEntity, WorkspaceEntity, WorkspaceMemberEntity, WorkflowEntity, WorkflowVersionEntity,
    WorkflowScheduleEntity, ExecutionEntity, NodeExecutionEntity, NodeMemoryEntity, AuditLogEntity,
    AuthSessionEntity, CredentialEntity, IdempotencyKeyEntity,
    MediaAssetEntity, MediaAssetVersionEntity, MediaAssetReferenceEntity, MediaGenerationJobEntity
  ],
  migrations: [InitialSchema1760000000000, WorkflowSchedules1760000000001, MediaAssets1760000000002],
});

export type M2MDataSource = DataSource;

export async function initializeDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  return AppDataSource;
}
