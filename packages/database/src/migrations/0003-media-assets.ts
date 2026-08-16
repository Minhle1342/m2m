import { type MigrationInterface, type QueryRunner, Table, TableIndex } from 'typeorm';

export class MediaAssets1760000000002 implements MigrationInterface {
  name = 'MediaAssets1760000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'media_assets',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'workspaceId', type: 'varchar' },
          { name: 'executionId', type: 'varchar', isNullable: true },
          { name: 'nodeExecutionId', type: 'varchar', isNullable: true },
          { name: 'type', type: 'varchar' },
          { name: 'mimeType', type: 'varchar' },
          { name: 'localPath', type: 'varchar' },
          { name: 'filename', type: 'varchar' },
          { name: 'sizeBytes', type: 'integer', isNullable: true },
          { name: 'width', type: 'integer', isNullable: true },
          { name: 'height', type: 'integer', isNullable: true },
          { name: 'durationMs', type: 'integer', isNullable: true },
          { name: 'fps', type: 'integer', isNullable: true },
          { name: 'provider', type: 'varchar', isNullable: true },
          { name: 'model', type: 'varchar', isNullable: true },
          { name: 'seed', type: 'integer', isNullable: true },
          { name: 'metadata', type: 'text', isNullable: true },
          { name: 'deletedAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' }
        ]
      })
    );
    await queryRunner.createIndex(
      'media_assets',
      new TableIndex({ name: 'IDX_media_assets_workspace', columnNames: ['workspaceId', 'createdAt'] })
    );
    await queryRunner.createIndex(
      'media_assets',
      new TableIndex({ name: 'IDX_media_assets_execution', columnNames: ['executionId', 'createdAt'] })
    );

    await queryRunner.createTable(
      new Table({
        name: 'media_asset_versions',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'assetId', type: 'varchar' },
          { name: 'parentVersionId', type: 'varchar', isNullable: true },
          { name: 'operation', type: 'varchar' },
          { name: 'prompt', type: 'text', isNullable: true },
          { name: 'provider', type: 'varchar', isNullable: true },
          { name: 'model', type: 'varchar', isNullable: true },
          { name: 'localPath', type: 'varchar' },
          { name: 'mimeType', type: 'varchar' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' }
        ]
      })
    );
    await queryRunner.createIndex(
      'media_asset_versions',
      new TableIndex({ name: 'IDX_media_versions_asset', columnNames: ['assetId', 'createdAt'] })
    );

    await queryRunner.createTable(
      new Table({
        name: 'media_asset_references',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'assetId', type: 'varchar' },
          { name: 'referenceType', type: 'varchar' },
          { name: 'referenceId', type: 'varchar' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' }
        ]
      })
    );
    await queryRunner.createIndex(
      'media_asset_references',
      new TableIndex({ name: 'IDX_media_references_asset', columnNames: ['assetId', 'referenceType'] })
    );

    await queryRunner.createTable(
      new Table({
        name: 'media_generation_jobs',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'workspaceId', type: 'varchar' },
          { name: 'executionId', type: 'varchar', isNullable: true },
          { name: 'nodeExecutionId', type: 'varchar', isNullable: true },
          { name: 'provider', type: 'varchar' },
          { name: 'model', type: 'varchar' },
          { name: 'providerJobId', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', default: "'queued'" },
          { name: 'progress', type: 'integer', isNullable: true },
          { name: 'input', type: 'text', isNullable: true },
          { name: 'output', type: 'text', isNullable: true },
          { name: 'error', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'startedAt', type: 'datetime', isNullable: true },
          { name: 'finishedAt', type: 'datetime', isNullable: true }
        ]
      })
    );
    await queryRunner.createIndex(
      'media_generation_jobs',
      new TableIndex({ name: 'IDX_media_jobs_workspace_status', columnNames: ['workspaceId', 'status'] })
    );
    await queryRunner.createIndex(
      'media_generation_jobs',
      new TableIndex({ name: 'IDX_media_jobs_execution', columnNames: ['executionId', 'createdAt'] })
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('media_generation_jobs', true);
    await queryRunner.dropTable('media_asset_references', true);
    await queryRunner.dropTable('media_asset_versions', true);
    await queryRunner.dropTable('media_assets', true);
  }
}
