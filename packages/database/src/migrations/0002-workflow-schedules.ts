import { type MigrationInterface, type QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

export class WorkflowSchedules1760000000001 implements MigrationInterface {
  name = 'WorkflowSchedules1760000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('workflows', new TableColumn({ name: 'activeVersionId', type: 'varchar', isNullable: true }));
    await queryRunner.addColumn('executions', new TableColumn({ name: 'scheduleTickKey', type: 'varchar', isNullable: true, isUnique: true }));
    await queryRunner.createTable(new Table({
      name: 'workflow_schedules',
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'workspaceId', type: 'varchar' },
        { name: 'workflowId', type: 'varchar' },
        { name: 'workflowVersionId', type: 'varchar' },
        { name: 'nodeId', type: 'varchar' },
        { name: 'kind', type: 'varchar' },
        { name: 'cron', type: 'varchar', isNullable: true },
        { name: 'everyMs', type: 'integer', isNullable: true },
        { name: 'timezone', type: 'varchar', isNullable: true },
        { name: 'repeatKey', type: 'varchar', isNullable: true },
        { name: 'active', type: 'boolean', default: true },
        { name: 'createdBy', type: 'varchar' },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }));
    await queryRunner.createIndex('workflow_schedules', new TableIndex({ name: 'IDX_workflow_schedule_node', columnNames: ['workflowId', 'nodeId'], isUnique: true }));
    await queryRunner.createIndex('workflow_schedules', new TableIndex({ name: 'IDX_workflow_schedule_active', columnNames: ['active', 'updatedAt'] }));
    await queryRunner.createTable(new Table({
      name: 'node_memory',
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'workspaceId', type: 'varchar' },
        { name: 'workflowId', type: 'varchar' },
        { name: 'nodeId', type: 'varchar' },
        { name: 'key', type: 'varchar' },
        { name: 'value', type: 'text' },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }));
    await queryRunner.createIndex('node_memory', new TableIndex({ name: 'IDX_node_memory_scope', columnNames: ['workspaceId', 'workflowId', 'nodeId', 'key'], isUnique: true }));
    await queryRunner.createTable(new Table({
      name: 'audit_logs',
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'workspaceId', type: 'varchar' },
        { name: 'userId', type: 'varchar' },
        { name: 'action', type: 'varchar' },
        { name: 'resourceType', type: 'varchar' },
        { name: 'resourceId', type: 'varchar', isNullable: true },
        { name: 'metadata', type: 'text', isNullable: true },
        { name: 'ipAddress', type: 'varchar', isNullable: true },
        { name: 'userAgent', type: 'varchar', isNullable: true },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }));
    await queryRunner.createIndex('audit_logs', new TableIndex({ name: 'IDX_audit_workspace_created', columnNames: ['workspaceId', 'createdAt'] }));
    await queryRunner.createTable(new Table({
      name: 'auth_sessions',
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'userId', type: 'varchar' },
        { name: 'refreshTokenHash', type: 'varchar' },
        { name: 'expiresAt', type: 'datetime' },
        { name: 'revokedAt', type: 'datetime', isNullable: true },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }));
    await queryRunner.createIndex('auth_sessions', new TableIndex({ name: 'IDX_auth_session_refresh', columnNames: ['refreshTokenHash'], isUnique: true }));
    await queryRunner.createIndex('auth_sessions', new TableIndex({ name: 'IDX_auth_session_user_expiry', columnNames: ['userId', 'expiresAt'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('auth_sessions', true);
    await queryRunner.dropTable('audit_logs', true);
    await queryRunner.dropTable('node_memory', true);
    await queryRunner.dropTable('workflow_schedules', true);
    await queryRunner.dropColumn('executions', 'scheduleTickKey');
    await queryRunner.dropColumn('workflows', 'activeVersionId');
  }
}
