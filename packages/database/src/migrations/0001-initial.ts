import { type MigrationInterface, type QueryRunner, Table, TableIndex } from 'typeorm';

const dates = [
  { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
  { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
];
const id = { name: 'id', type: 'varchar', isPrimary: true };

export class InitialSchema1760000000000 implements MigrationInterface {
  name = 'InitialSchema1760000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({ name:'users', columns:[id,{name:'email',type:'varchar',isUnique:true},{name:'displayName',type:'varchar'},{name:'passwordHash',type:'varchar',isNullable:true},...dates] }));
    await queryRunner.createTable(new Table({ name:'workspaces', columns:[id,{name:'name',type:'varchar'},{name:'ownerId',type:'varchar'},...dates] }));
    await queryRunner.createTable(new Table({ name:'workspace_members', columns:[id,{name:'workspaceId',type:'varchar'},{name:'userId',type:'varchar'},{name:'role',type:'varchar',default:"'OWNER'"},{name:'createdAt',type:'datetime',default:'CURRENT_TIMESTAMP'}] }));
    await queryRunner.createIndex('workspace_members', new TableIndex({name:'IDX_workspace_member',columnNames:['workspaceId','userId'],isUnique:true}));
    await queryRunner.createTable(new Table({ name:'workflows', columns:[id,{name:'workspaceId',type:'varchar'},{name:'name',type:'varchar'},{name:'description',type:'text',isNullable:true},{name:'definition',type:'text'},{name:'active',type:'boolean',default:false},{name:'version',type:'integer',default:0},{name:'createdBy',type:'varchar'},...dates] }));
    await queryRunner.createIndex('workflows', new TableIndex({name:'IDX_workflows_workspace_updated',columnNames:['workspaceId','updatedAt']}));
    await queryRunner.createTable(new Table({ name:'workflow_versions', columns:[id,{name:'workspaceId',type:'varchar'},{name:'workflowId',type:'varchar'},{name:'version',type:'integer'},{name:'definition',type:'text'},{name:'createdBy',type:'varchar'},{name:'createdAt',type:'datetime',default:'CURRENT_TIMESTAMP'}] }));
    await queryRunner.createIndex('workflow_versions', new TableIndex({name:'IDX_workflow_version',columnNames:['workflowId','version'],isUnique:true}));
    await queryRunner.createTable(new Table({ name:'executions', columns:[id,{name:'workspaceId',type:'varchar'},{name:'workflowId',type:'varchar'},{name:'workflowVersionId',type:'varchar'},{name:'status',type:'varchar'},{name:'mode',type:'varchar'},{name:'triggerData',type:'text',isNullable:true},{name:'output',type:'text',isNullable:true},{name:'error',type:'text',isNullable:true},{name:'queueJobId',type:'varchar',isNullable:true},{name:'retryOfId',type:'varchar',isNullable:true},{name:'startedAt',type:'datetime',isNullable:true},{name:'finishedAt',type:'datetime',isNullable:true},{name:'createdBy',type:'varchar'},{name:'createdAt',type:'datetime',default:'CURRENT_TIMESTAMP'}] }));
    await queryRunner.createIndex('executions', new TableIndex({name:'IDX_executions_workspace_created',columnNames:['workspaceId','createdAt']}));
    await queryRunner.createIndex('executions', new TableIndex({name:'IDX_executions_workflow_created',columnNames:['workflowId','createdAt']}));
    await queryRunner.createTable(new Table({ name:'node_executions', columns:[id,{name:'executionId',type:'varchar'},{name:'nodeId',type:'varchar'},{name:'nodeName',type:'varchar'},{name:'status',type:'varchar'},{name:'input',type:'text',isNullable:true},{name:'output',type:'text',isNullable:true},{name:'error',type:'text',isNullable:true},{name:'startedAt',type:'datetime'},{name:'finishedAt',type:'datetime',isNullable:true},{name:'durationMs',type:'integer',isNullable:true},{name:'attempt',type:'integer'}] }));
    await queryRunner.createIndex('node_executions', new TableIndex({name:'IDX_node_execution_attempt',columnNames:['executionId','nodeId','attempt'],isUnique:true}));
    await queryRunner.createTable(new Table({ name:'credentials', columns:[id,{name:'workspaceId',type:'varchar'},{name:'name',type:'varchar'},{name:'type',type:'varchar'},{name:'encryptedData',type:'text'},{name:'metadata',type:'text',isNullable:true},...dates] }));
    await queryRunner.createIndex('credentials', new TableIndex({name:'IDX_credentials_workspace_name',columnNames:['workspaceId','name']}));
    await queryRunner.createTable(new Table({ name:'idempotency_keys', columns:[id,{name:'workflowId',type:'varchar'},{name:'key',type:'varchar'},{name:'executionId',type:'varchar'},{name:'createdAt',type:'datetime',default:'CURRENT_TIMESTAMP'},{name:'expiresAt',type:'datetime'}] }));
    await queryRunner.createIndex('idempotency_keys', new TableIndex({name:'IDX_idempotency_workflow_key',columnNames:['workflowId','key'],isUnique:true}));
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['idempotency_keys','credentials','node_executions','executions','workflow_versions','workflows','workspace_members','workspaces','users']) await queryRunner.dropTable(table, true);
  }
}
