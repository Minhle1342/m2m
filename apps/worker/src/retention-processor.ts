import type { Job } from 'bull';
import { ExecutionEntity, NodeExecutionEntity, type M2MDataSource } from '@m2m/database';
import type { MaintenanceJobPayload } from '@m2m/queue';

export function createRetentionProcessor(db:M2MDataSource){
  return async(job:Job<MaintenanceJobPayload>):Promise<void>=>{
    if(job.data.task!=='execution-retention')return;
    const days=Math.max(1,Math.min(3650,Number(process.env.EXECUTION_RETENTION_DAYS??30)));
    const cutoff=new Date(Date.now()-days*86_400_000);
    const expired=await db.getRepository(ExecutionEntity).createQueryBuilder('execution').select('execution.id').where('execution.createdAt < :cutoff',{cutoff}).andWhere('execution.status IN (:...statuses)',{statuses:['success','failed','cancelled']}).getMany();
    const ids=expired.map(item=>item.id);if(ids.length===0)return;
    await db.transaction(async manager=>{await manager.createQueryBuilder().delete().from(NodeExecutionEntity).where('executionId IN (:...ids)',{ids}).execute();await manager.createQueryBuilder().delete().from(ExecutionEntity).where('id IN (:...ids)',{ids}).execute();});
  };
}
