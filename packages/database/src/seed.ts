import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { LOCAL_USER_ID, LOCAL_WORKSPACE_ID, type WorkflowDefinition } from '@m2m/shared';
import { initializeDatabase } from './data-source.js';
import { decryptCredentialWithMetadata, encryptCredential } from './crypto.js';
import { CredentialEntity, UserEntity, WorkflowEntity, WorkspaceEntity, WorkspaceMemberEntity } from './entities.js';

export async function seedDevelopment(): Promise<void> {
  const db = await initializeDatabase();
  if (!await db.getRepository(UserEntity).findOneBy({ id: LOCAL_USER_ID })) {
    await db.getRepository(UserEntity).save({ id:LOCAL_USER_ID, email:'local@m2m.dev', displayName:'Local Developer', passwordHash:null });
  }
  if (!await db.getRepository(WorkspaceEntity).findOneBy({ id: LOCAL_WORKSPACE_ID })) {
    await db.getRepository(WorkspaceEntity).save({ id:LOCAL_WORKSPACE_ID, name:'Local Workspace', ownerId:LOCAL_USER_ID });
  }
  if (!await db.getRepository(WorkspaceMemberEntity).findOneBy({ workspaceId:LOCAL_WORKSPACE_ID, userId:LOCAL_USER_ID })) {
    await db.getRepository(WorkspaceMemberEntity).save({ id:randomUUID(), workspaceId:LOCAL_WORKSPACE_ID, userId:LOCAL_USER_ID, role:'OWNER' });
  }
  if (await db.getRepository(WorkflowEntity).countBy({ workspaceId: LOCAL_WORKSPACE_ID }) === 0) {
    const definition: WorkflowDefinition = {
      nodes: [
        { id:'manual-trigger', type:'trigger.manual', name:'Manual Trigger', position:{x:100,y:160}, parameters:{} },
        { id:'set-data', type:'core.setData', name:'Set Data', position:{x:400,y:160}, parameters:{values:{message:'Hello from m2m'},keepInput:true} },
      ],
      edges: [{ id:'manual-to-set', source:'manual-trigger', target:'set-data' }],
      settings: { timeoutMs: 300000, saveExecutionProgress: true },
    };
    await db.getRepository(WorkflowEntity).save({ id:randomUUID(), workspaceId:LOCAL_WORKSPACE_ID, name:'Welcome workflow', description:'Manual Trigger → Set Data', definition, active:false, activeVersionId:null, version:0, createdBy:LOCAL_USER_ID });
  }

  const credentialRepository = db.getRepository(CredentialEntity);
  const credentials = await credentialRepository.createQueryBuilder('credential').addSelect('credential.encryptedData').getMany();
  for (const credential of credentials) {
    try {
      const decrypted = decryptCredentialWithMetadata(credential.encryptedData);
      if (decrypted.usedLegacyDevelopmentKey) {
        credential.encryptedData = encryptCredential(decrypted.data);
        await credentialRepository.save(credential);
      }
    } catch {
      // Keep truly corrupt credentials visible so the user can replace or delete them in the UI.
    }
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  await seedDevelopment();
  console.log('Development data is ready.');
  await (await initializeDatabase()).destroy();
}
