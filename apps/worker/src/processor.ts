import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import type { Job } from 'bull';
import { createNodeRegistry } from '@m2m/config';
import {
  CredentialEntity,
  ExecutionEntity,
  MediaAssetEntity,
  MediaAssetReferenceEntity,
  NodeExecutionEntity,
  NodeMemoryEntity,
  WorkflowVersionEntity,
  decryptCredential,
  type M2MDataSource
} from '@m2m/database';
import { ExecutionEventBus, type WorkflowJobPayload } from '@m2m/queue';
import { M2MError, serializeError } from '@m2m/shared';
import { executeWorkflow, type NodeLifecycleRecord } from '@m2m/workflow-core';

function isReadableMediaFile(localPath: unknown): localPath is string {
  if (typeof localPath !== 'string' || !localPath.trim()) return false;
  try {
    return existsSync(localPath) && statSync(localPath).isFile();
  } catch {
    return false;
  }
}

export function createWorkflowProcessor(db: M2MDataSource, events: ExecutionEventBus) {
  const registry = createNodeRegistry();
  return async (job: Job<WorkflowJobPayload>) => {
    const executionRepo = db.getRepository(ExecutionEntity);
    const execution = await executionRepo.findOneBy({ id: job.data.executionId });
    if (!execution) throw new M2MError('NOT_FOUND', 'Execution not found');
    if (execution.status === 'success' || execution.status === 'cancelled') return;
    const version = await db.getRepository(WorkflowVersionEntity).findOneBy({
      id: execution.workflowVersionId,
      workspaceId: execution.workspaceId
    });
    if (!version) throw new M2MError('NOT_FOUND', 'Workflow version not found');
    execution.status = 'running';
    execution.startedAt = execution.startedAt ?? new Date();
    execution.error = null;
    await executionRepo.save(execution);

    try {
      const output = await executeWorkflow({
        executionId: execution.id,
        workflowId: execution.workflowId,
        definition: version.definition,
        triggerData: execution.triggerData,
        registry,
        hooks: {
          publish: (event) => events.publish(event),
          isCancelled: async () => (await executionRepo.findOneBy({ id: execution.id }))?.status === 'cancelled',
          nodeStarted: async (node, input, attempt) => {
            const repo = db.getRepository(NodeExecutionEntity);
            const existing = await repo.findOneBy({ executionId: execution.id, nodeId: node.id, attempt });
            const record = existing ?? repo.create({ id: randomUUID(), executionId: execution.id, nodeId: node.id, nodeName: node.name, attempt });
            record.status = 'running';
            record.input = input;
            record.output = null;
            record.error = null;
            record.startedAt = new Date();
            record.finishedAt = null;
            record.durationMs = null;
            await repo.save(record);
            if (node.type === 'core.delay') {
              execution.status = 'waiting';
              await executionRepo.save(execution);
            }
          },
          nodeFinished: async (record: NodeLifecycleRecord) => {
            const repo = db.getRepository(NodeExecutionEntity);
            const entity = await repo.findOneByOrFail({ executionId: execution.id, nodeId: record.node.id, attempt: record.attempt });
            entity.status = record.error ? 'failed' : 'success';
            entity.output = record.output ?? null;
            entity.error = record.error ?? null;
            entity.finishedAt = record.finishedAt;
            entity.durationMs = record.finishedAt.getTime() - record.startedAt.getTime();
            await repo.save(entity);

            // Record media asset if output contains media
            if (record.output && typeof record.output === 'object') {
              const json = (record.output as any).json;
              const mediaItems: any[] = [];
              if (json?.media && typeof json.media === 'object') mediaItems.push(json.media);
              if (Array.isArray(json?.images)) mediaItems.push(...json.images);
              if (json?.video && typeof json.video === 'object') mediaItems.push(json.video);
              if (json?.savedMedia && typeof json.savedMedia === 'object') mediaItems.push(json.savedMedia);

              const assetRepo = db.getRepository(MediaAssetEntity);
              const refRepo = db.getRepository(MediaAssetReferenceEntity);

              for (const item of mediaItems) {
                if (item && item.id && item.type && isReadableMediaFile(item.localPath)) {
                  try {
                    const existing = await assetRepo.findOneBy({ id: item.id });
                    if (!existing) {
                      await assetRepo.save(
                        assetRepo.create({
                          id: item.id,
                          workspaceId: execution.workspaceId,
                          executionId: execution.id,
                          nodeExecutionId: entity.id,
                          type: item.type,
                          mimeType: item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/png'),
                          localPath: item.localPath || '',
                          filename: item.filename || item.id,
                          sizeBytes: item.sizeBytes ?? null,
                          width: item.width ?? null,
                          height: item.height ?? null,
                          durationMs: item.durationMs ?? null,
                          fps: item.fps ?? null,
                          provider: item.provider ?? null,
                          model: item.model ?? null,
                          seed: item.seed ?? null,
                          metadata: item.metadata ?? null
                        })
                      );
                    }
                    await refRepo.save(
                      refRepo.create({
                        id: randomUUID(),
                        assetId: item.id,
                        referenceType: 'node-output',
                        referenceId: entity.id
                      })
                    );
                  } catch {
                    // ignore duplication
                  }
                }
              }
            }

            if (record.node.type === 'core.delay') {
              const current = await executionRepo.findOneByOrFail({ id: execution.id });
              if (current.status !== 'cancelled') {
                current.status = 'running';
                await executionRepo.save(current);
              }
            }
          },
          nodeSkipped: async (node) => {
            const repo = db.getRepository(NodeExecutionEntity);
            const existing = await repo.findOneBy({ executionId: execution.id, nodeId: node.id, attempt: 1 });
            if (existing) return;
            const now = new Date();
            await repo.save(
              repo.create({
                id: randomUUID(),
                executionId: execution.id,
                nodeId: node.id,
                nodeName: node.name,
                status: 'skipped',
                input: null,
                output: null,
                error: null,
                startedAt: now,
                finishedAt: now,
                durationMs: 0,
                attempt: 1
              })
            );
          },
          createStateStore: async (node) => {
            const repo = db.getRepository(NodeMemoryEntity);
            const scope = { workspaceId: execution.workspaceId, workflowId: execution.workflowId, nodeId: node.id };
            return {
              get: async (key) => (await repo.findOneBy({ ...scope, key }))?.value,
              set: async (key, value) => {
                let entity = await repo.findOneBy({ ...scope, key });
                entity ??= repo.create({ id: randomUUID(), ...scope, key });
                entity.value = value;
                await repo.save(entity);
              },
              delete: async (key) => {
                await repo.delete({ ...scope, key });
              }
            };
          },
          resolveCredentials: async (node) => {
            const resolved: Record<string, { type: string; data: Record<string, string> }> = {};
            for (const [alias, id] of Object.entries(node.credentials ?? {})) {
              const credential = await db
                .getRepository(CredentialEntity)
                .createQueryBuilder('c')
                .addSelect('c.encryptedData')
                .where('c.id = :id AND c.workspaceId = :workspaceId', { id, workspaceId: execution.workspaceId })
                .getOne();
              if (!credential) throw new M2MError('CREDENTIAL_ERROR', `Credential not found for ${alias}`);
              resolved[alias] = { type: credential.type, data: decryptCredential(credential.encryptedData) };
            }
            return resolved;
          }
        }
      });
      execution.status = 'success';
      execution.output = output;
      execution.finishedAt = new Date();
      await executionRepo.save(execution);
      await events.publish({
        executionId: execution.id,
        workflowId: execution.workflowId,
        event: 'execution.completed',
        timestamp: new Date().toISOString(),
        data: { status: 'success' }
      });
      return;
    } catch (error) {
      const current = await executionRepo.findOneByOrFail({ id: execution.id });
      if (current.status !== 'cancelled') {
        current.status = 'failed';
        current.error = serializeError(error);
        current.finishedAt = new Date();
        await executionRepo.save(current);
        await events.publish({
          executionId: execution.id,
          workflowId: execution.workflowId,
          event: 'execution.failed',
          timestamp: new Date().toISOString(),
          data: current.error
        });
      }
      throw error;
    }
  };
}
