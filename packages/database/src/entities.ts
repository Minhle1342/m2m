import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  ExecutionStatus,
  NodeExecutionStatus,
  SerializedError,
  WorkflowDefinition,
} from '@m2m/shared';

@Entity('users')
export class UserEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar', { unique: true }) email!: string;
  @Column('varchar') displayName!: string;
  @Column('varchar', { nullable: true, select: false }) passwordHash!: string | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('workspaces')
export class WorkspaceEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') name!: string;
  @Column('varchar') ownerId!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('workspace_members')
@Index(['workspaceId', 'userId'], { unique: true })
export class WorkspaceMemberEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') userId!: string;
  @Column('varchar', { default: 'OWNER' }) role!: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  @CreateDateColumn() createdAt!: Date;
}

@Entity('workflows')
@Index(['workspaceId', 'updatedAt'])
export class WorkflowEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') name!: string;
  @Column('text', { nullable: true }) description!: string | null;
  @Column('simple-json') definition!: WorkflowDefinition;
  @Column('boolean', { default: false }) active!: boolean;
  @Column('varchar', { nullable: true }) activeVersionId!: string | null;
  @Column('integer', { default: 0 }) version!: number;
  @Column('varchar') createdBy!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('workflow_versions')
@Index(['workflowId', 'version'], { unique: true })
export class WorkflowVersionEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') workflowId!: string;
  @Column('integer') version!: number;
  @Column('simple-json') definition!: WorkflowDefinition;
  @Column('varchar') createdBy!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('executions')
@Index(['workspaceId', 'createdAt'])
@Index(['workflowId', 'createdAt'])
export class ExecutionEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') workflowId!: string;
  @Column('varchar') workflowVersionId!: string;
  @Column('varchar') status!: ExecutionStatus;
  @Column('varchar') mode!: 'manual' | 'webhook' | 'schedule' | 'retry';
  @Column('simple-json', { nullable: true }) triggerData!: unknown | null;
  @Column('simple-json', { nullable: true }) output!: unknown | null;
  @Column('simple-json', { nullable: true }) error!: SerializedError | null;
  @Column('varchar', { nullable: true }) queueJobId!: string | null;
  @Column('varchar', { nullable: true }) retryOfId!: string | null;
  @Column('varchar', { nullable: true, unique: true }) scheduleTickKey!: string | null;
  @Column('datetime', { nullable: true }) startedAt!: Date | null;
  @Column('datetime', { nullable: true }) finishedAt!: Date | null;
  @Column('varchar') createdBy!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('workflow_schedules')
@Index(['workflowId', 'nodeId'], { unique: true })
@Index(['active', 'updatedAt'])
export class WorkflowScheduleEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') workflowId!: string;
  @Column('varchar') workflowVersionId!: string;
  @Column('varchar') nodeId!: string;
  @Column('varchar') kind!: 'cron' | 'every';
  @Column('varchar', { nullable: true }) cron!: string | null;
  @Column('integer', { nullable: true }) everyMs!: number | null;
  @Column('varchar', { nullable: true }) timezone!: string | null;
  @Column('varchar', { nullable: true }) repeatKey!: string | null;
  @Column('boolean', { default: true }) active!: boolean;
  @Column('varchar') createdBy!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('node_memory')
@Index(['workspaceId', 'workflowId', 'nodeId', 'key'], { unique: true })
export class NodeMemoryEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') workflowId!: string;
  @Column('varchar') nodeId!: string;
  @Column('varchar') key!: string;
  @Column('simple-json') value!: unknown;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('audit_logs')
@Index(['workspaceId', 'createdAt'])
export class AuditLogEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') userId!: string;
  @Column('varchar') action!: string;
  @Column('varchar') resourceType!: string;
  @Column('varchar', { nullable: true }) resourceId!: string | null;
  @Column('simple-json', { nullable: true }) metadata!: Record<string, unknown> | null;
  @Column('varchar', { nullable: true }) ipAddress!: string | null;
  @Column('varchar', { nullable: true }) userAgent!: string | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('auth_sessions')
@Index(['refreshTokenHash'], { unique: true })
@Index(['userId', 'expiresAt'])
export class AuthSessionEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') userId!: string;
  @Column('varchar') refreshTokenHash!: string;
  @Column('datetime') expiresAt!: Date;
  @Column('datetime', { nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('node_executions')
@Index(['executionId', 'nodeId', 'attempt'], { unique: true })
export class NodeExecutionEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') executionId!: string;
  @Column('varchar') nodeId!: string;
  @Column('varchar') nodeName!: string;
  @Column('varchar') status!: NodeExecutionStatus;
  @Column('simple-json', { nullable: true }) input!: unknown | null;
  @Column('simple-json', { nullable: true }) output!: unknown | null;
  @Column('simple-json', { nullable: true }) error!: SerializedError | null;
  @Column('datetime') startedAt!: Date;
  @Column('datetime', { nullable: true }) finishedAt!: Date | null;
  @Column('integer', { nullable: true }) durationMs!: number | null;
  @Column('integer') attempt!: number;
}

@Entity('credentials')
@Index(['workspaceId', 'name'])
export class CredentialEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar') name!: string;
  @Column('varchar') type!: string;
  @Column('text', { select: false }) encryptedData!: string;
  @Column('simple-json', { nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('idempotency_keys')
@Index(['workflowId', 'key'], { unique: true })
export class IdempotencyKeyEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workflowId!: string;
  @Column('varchar') key!: string;
  @Column('varchar') executionId!: string;
  @CreateDateColumn() createdAt!: Date;
  @Column('datetime') expiresAt!: Date;
}

@Entity('media_assets')
@Index(['workspaceId', 'createdAt'])
@Index(['executionId', 'createdAt'])
export class MediaAssetEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar', { nullable: true }) executionId!: string | null;
  @Column('varchar', { nullable: true }) nodeExecutionId!: string | null;
  @Column('varchar') type!: 'image' | 'video' | 'audio';
  @Column('varchar') mimeType!: string;
  @Column('varchar') localPath!: string;
  @Column('varchar') filename!: string;
  @Column('integer', { nullable: true }) sizeBytes!: number | null;
  @Column('integer', { nullable: true }) width!: number | null;
  @Column('integer', { nullable: true }) height!: number | null;
  @Column('integer', { nullable: true }) durationMs!: number | null;
  @Column('integer', { nullable: true }) fps!: number | null;
  @Column('varchar', { nullable: true }) provider!: string | null;
  @Column('varchar', { nullable: true }) model!: string | null;
  @Column('integer', { nullable: true }) seed!: number | null;
  @Column('simple-json', { nullable: true }) metadata!: Record<string, unknown> | null;
  @Column('datetime', { nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('media_asset_versions')
@Index(['assetId', 'createdAt'])
export class MediaAssetVersionEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') assetId!: string;
  @Column('varchar', { nullable: true }) parentVersionId!: string | null;
  @Column('varchar') operation!: 'generated' | 'edit' | 'remove-object' | 'replace-object' | 'regenerate' | 'inpaint';
  @Column('text', { nullable: true }) prompt!: string | null;
  @Column('varchar', { nullable: true }) provider!: string | null;
  @Column('varchar', { nullable: true }) model!: string | null;
  @Column('varchar') localPath!: string;
  @Column('varchar') mimeType!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('media_asset_references')
@Index(['assetId', 'referenceType'])
export class MediaAssetReferenceEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') assetId!: string;
  @Column('varchar') referenceType!: 'node-input' | 'node-output' | 'workflow' | 'execution' | 'media-parent';
  @Column('varchar') referenceId!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('media_generation_jobs')
@Index(['workspaceId', 'status'])
@Index(['executionId', 'createdAt'])
export class MediaGenerationJobEntity {
  @PrimaryColumn('varchar') id!: string;
  @Column('varchar') workspaceId!: string;
  @Column('varchar', { nullable: true }) executionId!: string | null;
  @Column('varchar', { nullable: true }) nodeExecutionId!: string | null;
  @Column('varchar') provider!: string;
  @Column('varchar') model!: string;
  @Column('varchar', { nullable: true }) providerJobId!: string | null;
  @Column('varchar', { default: 'queued' }) status!: 'queued' | 'submitted' | 'processing' | 'completed' | 'failed' | 'cancelled';
  @Column('integer', { nullable: true }) progress!: number | null;
  @Column('simple-json', { nullable: true }) input!: Record<string, unknown> | null;
  @Column('simple-json', { nullable: true }) output!: Record<string, unknown> | null;
  @Column('simple-json', { nullable: true }) error!: SerializedError | null;
  @CreateDateColumn() createdAt!: Date;
  @Column('datetime', { nullable: true }) startedAt!: Date | null;
  @Column('datetime', { nullable: true }) finishedAt!: Date | null;
}

