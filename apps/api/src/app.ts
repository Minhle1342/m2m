import { existsSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type NextFunction, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { createDefaultModelRouter, createNodeRegistry, createDefaultMediaRouter } from '@m2m/config';
import {
  AuditLogEntity, CredentialEntity, ExecutionEntity, IdempotencyKeyEntity,
  MediaAssetEntity, MediaAssetReferenceEntity, MediaAssetVersionEntity, MediaGenerationJobEntity,
  NodeExecutionEntity, UserEntity, WorkflowEntity, WorkflowScheduleEntity,
  WorkflowVersionEntity, WorkspaceEntity, WorkspaceMemberEntity,
  decryptCredential, encryptCredential, type M2MDataSource,
} from '@m2m/database';
import { BullQueueAdapter, ExecutionEventBus, MAINTENANCE_QUEUE, SCHEDULE_QUEUE, WORKFLOW_QUEUE } from '@m2m/queue';
import { LOCAL_USER_ID, LOCAL_WORKSPACE_ID, M2MError, serializeError, type WorkflowDefinition } from '@m2m/shared';
import { validateWorkflow } from '@m2m/workflow-core';
import { developmentAuth, type M2MRequest } from './context.js';
import { enqueueWorkflow } from './execution-service.js';
import { activateWorkflow, deactivateWorkflow } from './schedule-service.js';
import { hashPassword, issueTokens, revokeRefreshToken, rotateRefreshToken, verifyAccessToken, verifyPassword } from './auth.js';
import { workflowTemplates } from './templates.js';
import { MediaService } from './media-service.js';
import { processWorkflowAssistant, type AssistantRequest } from './assistant-service.js';
import multer from 'multer';

const CREDENTIAL_TYPE_DEFINITIONS = [
  {
    type: 'comfyui',
    displayName: 'ComfyUI Local',
    category: 'local-inference',
    costBadge: 'LOCAL',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Local GPU/CPU inference backend for FLUX.2 Klein, Wan2.2, SDXL, and CogVideoX.',
    documentationUrl: 'https://docs.comfy.org/',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true, default: 'http://127.0.0.1:8188' },
      { name: 'apiKey', label: 'API Key (Optional)', type: 'password', required: false }
    ],
    testConnection: true
  },
  {
    type: 'huggingface',
    displayName: 'Hugging Face',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Hosted Inference Providers with monthly credits for FLUX Schnell images and LTX image-to-video.',
    documentationUrl: 'https://huggingface.co/docs/inference-providers/pricing',
    fields: [
      { name: 'apiKey', label: 'HF Access Token (hf_...)', type: 'password', required: true },
      { name: 'baseUrl', label: 'Inference Base URL (Optional)', type: 'string', required: false }
    ],
    testConnection: true
  },
  {
    type: 'black-forest-labs',
    displayName: 'Black Forest Labs',
    category: 'image',
    costBadge: 'PAID',
    badges: ['PAID', 'BYOK'],
    description: 'Official enterprise cloud API for FLUX 1.1 [pro] and FLUX.1 [dev].',
    documentationUrl: 'https://docs.bfl.ai/',
    fields: [
      { name: 'apiKey', label: 'BFL API Key', type: 'password', required: true },
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: false, default: 'https://api.bfl.ml' }
    ],
    testConnection: true
  },
  {
    type: 'ollama',
    displayName: 'Ollama (Local LLM)',
    category: 'llm',
    costBadge: 'LOCAL',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Run open-source large language models locally on your GPU/CPU.',
    documentationUrl: 'https://ollama.com',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true, default: 'http://127.0.0.1:11434' }
    ],
    testConnection: true
  },
  {
    type: 'gemini',
    displayName: 'Google Gemini',
    category: 'llm',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Google AI Studio API with generous free tiers for Gemini 2.0 / 1.5 Flash.',
    documentationUrl: 'https://ai.google.dev',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true }
    ],
    testConnection: true
  },
  {
    type: 'openai-compatible',
    displayName: 'OpenAI-compatible API',
    category: 'llm',
    costBadge: 'BYOK',
    badges: ['BYOK'],
    description: 'Any OpenAI API compatible endpoint (OpenAI, DeepSeek, Groq, OpenRouter, vLLM, LM Studio).',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true, default: 'https://api.openai.com/v1' },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true }
    ],
    testConnection: true
  },
  {
    type: 'generic-media',
    displayName: 'Generic Media API',
    category: 'generic',
    costBadge: 'BYOK',
    badges: ['BYOK'],
    description: 'Custom self-hosted or cloud media endpoints.',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true },
      { name: 'apiKey', label: 'API Key / Bearer Token', type: 'password', required: false }
    ],
    testConnection: false
  }
];

const workflowDefinitionSchema = z.object({
  nodes: z.array(z.object({
    id:z.string().min(1), type:z.string().min(1), name:z.string().min(1),
    position:z.object({x:z.number(),y:z.number()}), parameters:z.record(z.string(),z.unknown()),
    credentials:z.record(z.string(),z.string()).optional(), disabled:z.boolean().optional(),
    timeoutMs:z.number().positive().optional(), retry:z.object({enabled:z.boolean(),maxAttempts:z.number().int().positive(),delayMs:z.number().nonnegative(),backoff:z.enum(['fixed','exponential'])}).optional(),
  })),
  edges: z.array(z.object({id:z.string(),source:z.string(),target:z.string(),sourceHandle:z.string().optional(),targetHandle:z.string().optional()})),
  settings: z.object({timeoutMs:z.number().positive().optional(),saveExecutionProgress:z.boolean().optional()}),
});
const emptyDefinition: WorkflowDefinition = { nodes:[], edges:[], settings:{timeoutMs:300000,saveExecutionProgress:true} };

export function createApp(db: M2MDataSource, queue: BullQueueAdapter, events: ExecutionEventBus) {
  const app = express();
  const registry = createNodeRegistry();
  const mediaService = new MediaService(db);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']; cb(null, allowed.includes(file.mimetype)); } });
  const mediaRouter = mediaService.getRouter();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { lazyConnect:true, maxRetriesPerRequest:1, connectTimeout:1000 });

  const waitForWebhookResult=async(executionId:string,nodeId:string):Promise<{completed:boolean;body?:unknown}>=>{
    const timeoutMs=Math.max(1000,Math.min(120_000,Number(process.env.WEBHOOK_RESPONSE_TIMEOUT_MS??55_000)));const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){const execution=await db.getRepository(ExecutionEntity).findOneBy({id:executionId});if(execution?.status==='success'){const node=await db.getRepository(NodeExecutionEntity).findOne({where:{executionId,nodeId,status:'success'},order:{attempt:'DESC'}});const output=node?.output as{json?:unknown}|null;return{completed:true,body:output?.json??execution.output};}if(execution&&['failed','cancelled'].includes(execution.status))throw new M2MError(execution.error?.code??'EXECUTION_FAILED',execution.error?.message??`Execution ${execution.status}`,false,execution.error?.details);await new Promise(resolve=>setTimeout(resolve,100));}return{completed:false};
  };

  redis.on('error', () => undefined);

  const assistantBodySchema = z.object({
    prompt: z.string().min(1).max(20_000),
    workflow: z.object({
      name: z.string().optional(),
      nodes: z.array(z.record(z.string(), z.unknown())).max(500),
      edges: z.array(z.record(z.string(), z.unknown())).max(2_000),
      settings: z.record(z.string(), z.unknown()).optional()
    }),
    selectedNodeId: z.string().optional(),
    model: z.string().optional(),
    maxTokens: z.number().optional()
  });

  const buildAssistantContext = async (
    req: M2MRequest,
    body: z.infer<typeof assistantBodySchema>,
    workflowId?: string
  ): Promise<AssistantRequest> => {
    const credentialEntities = await db
      .getRepository(CredentialEntity)
      .createQueryBuilder('credential')
      .addSelect('credential.encryptedData')
      .where('credential.workspaceId = :workspaceId', { workspaceId: req.auth.workspaceId })
      .getMany();
    const decryptedCredentials: Array<{
      entity: CredentialEntity;
      data: Record<string, string>;
    }> = [];
    const failedCredentialIds = new Set<string>();
    for (const credential of credentialEntities) {
      try {
        decryptedCredentials.push({
          entity: credential,
          data: decryptCredential(credential.encryptedData)
        });
      } catch {
        failedCredentialIds.add(credential.id);
      }
    }
    const geminiCredential = decryptedCredentials.find(({ entity }) => entity.type === 'gemini');

    const mediaProviders = ['comfyui', 'huggingface', 'black-forest-labs'];
    const providerStatuses = await Promise.all(mediaProviders.map(async (providerId) => {
      const storedCredential = credentialEntities.find((entity) => entity.type === providerId);
      const credential = decryptedCredentials.find(({ entity }) => entity.type === providerId);
      if (storedCredential && failedCredentialIds.has(storedCredential.id)) {
        return {
          provider: providerId,
          available: false,
          message: 'Stored credential cannot be decrypted. Re-enter or replace it in Credentials.'
        };
      }
      try {
        const available = await mediaRouter.get(providerId).health(
          credential ? { id: credential.entity.id, name: credential.entity.name, type: credential.entity.type, data: credential.data } : undefined
        );
        return {
          provider: providerId,
          available,
          message: available ? 'Connection verified' : 'Offline, unreachable, or credential is not usable'
        };
      } catch (error) {
        return {
          provider: providerId,
          available: false,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }));

    let recentExecution: AssistantRequest['recentExecution'];
    if (workflowId) {
      const execution = await db.getRepository(ExecutionEntity).findOne({
        where: { workflowId, workspaceId: req.auth.workspaceId },
        order: { createdAt: 'DESC' }
      });
      if (execution) {
        const failedNode = await db.getRepository(NodeExecutionEntity).findOne({
          where: { executionId: execution.id, status: 'failed' },
          order: { startedAt: 'DESC' }
        });
        recentExecution = {
          status: execution.status,
          error: execution.error,
          failedNodeId: failedNode?.nodeId,
          failedNodeName: failedNode?.nodeName,
          failedNodeError: failedNode?.error
        };
      }
    }

    return {
      prompt: body.prompt,
      workflow: body.workflow as unknown as WorkflowDefinition,
      // The server registry is authoritative; never trust a client-supplied node catalog.
      nodeTypes: registry.list(),
      selectedNodeId: body.selectedNodeId,
      availableCredentials: decryptedCredentials.map(({ entity }) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type
      })),
      providerStatuses,
      recentExecution,
      apiKey: geminiCredential?.data.apiKey,
      model: body.model,
      maxTokens: body.maxTokens
    };
  };
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy:false }));
  app.use(cors({ origin:(process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials:true }));
  app.use(express.json({ limit:'20mb' }));

  app.use(async (request, response, next) => {
    const req = request as M2MRequest;
    req.requestId = request.header('x-request-id') ?? randomUUID();
    response.setHeader('x-request-id', req.requestId);
    if((process.env.AUTH_MODE??'development')==='development'){req.auth=developmentAuth;next();return;}
    const publicRoute=request.path==='/health'||request.path.startsWith('/health/')||request.path==='/api/v1/auth/register'||request.path==='/api/v1/auth/login'||request.path==='/api/v1/auth/refresh'||request.path.startsWith('/webhook/')||request.path.startsWith('/api/v1/media/assets/')&&request.path.endsWith('/content');
    if(publicRoute){req.auth=developmentAuth;next();return;}
    try{
      const sseToken=request.path.endsWith('/events')&&typeof request.query.access_token==='string'?request.query.access_token:'';const authorization=request.header('authorization')??(sseToken?`Bearer ${sseToken}`:'');if(!authorization.startsWith('Bearer '))throw new M2MError('UNAUTHORIZED','Bearer access token is required');
      const claims=verifyAccessToken(authorization.slice(7));const workspaceId=request.header('x-workspace-id')??(typeof request.query.workspace_id==='string'?request.query.workspace_id:claims.workspaceId);
      const membership=await db.getRepository(WorkspaceMemberEntity).findOneBy({userId:claims.sub,workspaceId});if(!membership)throw new M2MError('FORBIDDEN','Workspace access is denied');
      req.auth={userId:claims.sub,workspaceId,role:membership.role};next();
    }catch(error){next(error);}
  });

  app.use((request,response,next)=>{
    if(!['POST','PUT','PATCH','DELETE'].includes(request.method)){next();return;}
    const req=request as M2MRequest;
    response.on('finish',()=>{
      if(response.statusCode>=400)return;
      const segments=request.path.replace(/^\/api\/v1\//,'').split('/').filter(Boolean);
      const resourceType=segments[0]??'system';const resourceId=segments[1]??null;
      void db.getRepository(AuditLogEntity).save({
        id:randomUUID(),workspaceId:req.auth.workspaceId,userId:req.auth.userId,
        action:`${request.method.toLowerCase()}.${segments.at(-1)??resourceType}`,resourceType,resourceId,
        metadata:{requestId:req.requestId,statusCode:response.statusCode,path:request.path},
        ipAddress:request.ip??null,userAgent:request.header('user-agent')??null,
      }).catch(error=>console.error(JSON.stringify({level:'error',message:'Unable to persist audit log',error:error instanceof Error?error.message:String(error)})));
    });
    next();
  });

  app.use('/api/', rateLimit({ windowMs:60_000, limit:600, standardHeaders:'draft-8', legacyHeaders:false }));
  app.use('/api/v1/auth/login',rateLimit({windowMs:10*60_000,limit:20,standardHeaders:'draft-8',legacyHeaders:false}));
  app.use('/api/v1/auth/register',rateLimit({windowMs:60*60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}));

  app.use('/api/v1', (request,_response,next)=>{
    const req=request as M2MRequest;if((process.env.AUTH_MODE??'development')==='development'){next();return;}
    const mutation=['POST','PUT','PATCH','DELETE'].includes(request.method);
    if(req.auth.role==='VIEWER'&&mutation){next(new M2MError('FORBIDDEN','Viewer role is read-only'));return;}
    if((request.path.startsWith('/admin/')||request.path.startsWith('/audit-logs')||request.path.startsWith('/credentials'))&&!['OWNER','ADMIN'].includes(req.auth.role)){next(new M2MError('FORBIDDEN','Admin role is required'));return;}
    next();
  });

  app.get('/health/live', (_req,res) => res.json({status:'ok'}));
  app.get('/health', async (_req,res) => {
    const database = db.isInitialized;
    let redisOnline = false;
    let worker = false;
    try { if (redis.status === 'wait') await redis.connect(); redisOnline = (await redis.ping()) === 'PONG'; worker = Boolean(await redis.get('m2m:worker:heartbeat')); } catch { /* reported below */ }
    const aiRouter = createDefaultModelRouter();
    const ai = Object.fromEntries(await Promise.all(aiRouter.list().map(async provider => [provider.id, await provider.health()])));
    let comfyuiOnline = false;
    try { comfyuiOnline = await mediaRouter.get('comfyui').health(); } catch { /* ignore */ }
    res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'unavailable',
      dependencies: {
        api: true,
        database,
        redis: redisOnline,
        worker,
        ai,
        media: { comfyui: comfyuiOnline }
      }
    });
  });

  app.get('/health/ready', async (_req,res) => {
    try { if (redis.status === 'wait') await redis.connect(); await redis.ping(); res.json({status:'ready'}); }
    catch { res.status(503).json({status:'not_ready',message:'Redis is unavailable'}); }
  });

  app.get('/api/v1/admin/queues', async (_req,res) => res.json({
    workflow:await queue.getCounts(WORKFLOW_QUEUE),schedule:await queue.getCounts(SCHEDULE_QUEUE),maintenance:await queue.getCounts(MAINTENANCE_QUEUE),
  }));
  app.get('/api/v1/audit-logs', async (request,res) => {const req=request as M2MRequest;res.json(await db.getRepository(AuditLogEntity).find({where:{workspaceId:req.auth.workspaceId},order:{createdAt:'DESC'},take:200}));});

  // Media APIs
  app.get('/api/v1/media/providers', (_req, res) => {
    res.json(mediaRouter.listProviders());
  });

  app.get('/api/v1/media/models', (req, res) => {
    const task = req.query.task as any;
    const provider = req.query.provider as string | undefined;
    const executionMode = req.query.executionMode as any;
    const models = mediaRouter.registry.filter({ task, provider, executionMode });
    res.json(models);
  });

  app.get('/api/v1/media/assets', async (req, res) => {
    const request = req as M2MRequest;
    const type = req.query.type as any;
    const assets = await mediaService.listAssets(request.auth.workspaceId, type);
    res.json(assets);
  });

  app.get('/api/v1/media/assets/:id', async (req, res, next) => {
    try {
      const request = req as M2MRequest;
      const asset = await mediaService.getAsset(request.auth.workspaceId, req.params.id);
      res.json(asset);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/media/assets/:id/content', async (req, res, next) => {
    try {
      const asset = await db.getRepository(MediaAssetEntity).findOneBy({ id: req.params.id });
      if (asset) {
        return mediaService.streamAssetContent(req, res, asset);
      }

      // Direct disk streaming fallback for assets stored in media directories
      const possibleDirs = [
        join(mediaService.mediaRouter.storage.getBasePath(), 'assets'),
        resolve('./data/media/assets'),
        resolve('../../data/media/assets')
      ];

      for (const basePath of possibleDirs) {
        if (existsSync(basePath)) {
          const files = readdirSync(basePath);
          const match = files.find((file) => {
            const extension = extname(file);
            const stem = extension ? file.slice(0, -extension.length) : file;
            return file === req.params.id || stem === req.params.id;
          });
          if (match) {
            const fullPath = join(basePath, match);
            const ext = extname(match).toLowerCase();
            const mimeType = ext === '.mp4' ? 'video/mp4' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
            const type = ext === '.mp4' ? 'video' : 'image';
            return mediaService.streamAssetContent(req, res, {
              id: req.params.id,
              localPath: fullPath,
              mimeType,
              type
            } as unknown as MediaAssetEntity);
          }
        }
      }

      throw new M2MError('MEDIA_ASSET_NOT_FOUND', 'Media asset not found', false);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/media/assets/:id/versions', async (req, res, next) => {
    try {
      const versions = await mediaService.getVersions(req.params.id);
      res.json(versions);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/media/assets/:id/edit', async (req, res, next) => {
    try {
      const request = req as M2MRequest;
      const body = z.object({
        prompt: z.string().min(1),
        maskAssetId: z.string().optional(),
        maskData: z.string().optional(),
        operation: z.enum(['replace-object', 'remove-object', 'inpaint', 'edit']).optional(),
        model: z.string().optional()
      }).parse(req.body);

      const result = await mediaService.editAsset({
        workspaceId: request.auth.workspaceId,
        assetId: req.params.id,
        prompt: body.prompt,
        maskAssetId: body.maskAssetId,
        maskData: body.maskData,
        operation: body.operation,
        model: body.model
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/media/assets/:id/restore', async (req, res, next) => {
    try {
      const request = req as M2MRequest;
      const body = z.object({ versionId: z.string().min(1) }).parse(req.body);
      const asset = await mediaService.restoreVersion({
        workspaceId: request.auth.workspaceId,
        assetId: req.params.id,
        versionId: body.versionId
      });
      res.json(asset);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/v1/media/assets/:id', async (req, res, next) => {
    try {
      const request = req as M2MRequest;
      const force = req.query.force === 'true';
      const result = await mediaService.deleteAsset(request.auth.workspaceId, req.params.id, force);
      if (!result.softDeleted && result.warning) {
        res.status(409).json({ warning: result.warning, canForce: true });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/media/upload', upload.single('file'), async (req, res, next) => {
    try {
      const request = req as M2MRequest;
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: { code: 'MEDIA_INVALID_INPUT', message: 'No image file provided or invalid file type' } });
        return;
      }
      const saved = await mediaService.mediaRouter.storage.save({
        type: 'image',
        mimeType: file.mimetype,
        buffer: file.buffer,
        filename: file.originalname,
        provider: 'user-upload',
        model: 'upload',
        metadata: { source: 'user-upload' }
      });
      const entity = db.getRepository(MediaAssetEntity).create({
        id: saved.id,
        workspaceId: request.auth.workspaceId,
        type: 'image',
        mimeType: saved.mimeType,
        localPath: saved.localPath || '',
        filename: saved.filename || file.originalname,
        sizeBytes: saved.sizeBytes || null,
        width: saved.width || null,
        height: saved.height || null,
        provider: 'user-upload',
        model: 'upload',
        metadata: { source: 'user-upload' }
      });
      await db.getRepository(MediaAssetEntity).save(entity);
      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  });

  // Auth APIs
  app.get('/api/v1/auth/me', async (request,res) => {
    const req=request as M2MRequest;const user = await db.getRepository(UserEntity).findOneByOrFail({id:req.auth.userId});
    const workspace = await db.getRepository(WorkspaceEntity).findOneByOrFail({id:req.auth.workspaceId});
    res.json({user,workspace,authMode:process.env.AUTH_MODE ?? 'development'});
  });
  app.post('/api/v1/auth/register',async(request,res)=>{if((process.env.AUTH_MODE??'development')==='development'){const user=await db.getRepository(UserEntity).findOneByOrFail({id:LOCAL_USER_ID});res.json({user,accessToken:'development-mode',workspaceId:LOCAL_WORKSPACE_ID});return;}const body=z.object({email:z.string().email(),password:z.string().min(10).max(200),displayName:z.string().min(1).max(120),workspaceName:z.string().min(1).max(120).default('My Workspace')}).parse(request.body);const email=body.email.trim().toLowerCase();if(await db.getRepository(UserEntity).findOneBy({email}))throw new M2MError('CONFLICT','Email is already registered');const user=db.getRepository(UserEntity).create({id:randomUUID(),email,displayName:body.displayName,passwordHash:await hashPassword(body.password)});const workspace=db.getRepository(WorkspaceEntity).create({id:randomUUID(),name:body.workspaceName,ownerId:user.id});const membership=db.getRepository(WorkspaceMemberEntity).create({id:randomUUID(),workspaceId:workspace.id,userId:user.id,role:'OWNER'});await db.transaction(async manager=>{await manager.save(user);await manager.save(workspace);await manager.save(membership);});res.status(201).json({user:{id:user.id,email:user.email,displayName:user.displayName},workspace,...await issueTokens(db,user.id,workspace.id)});});
  app.post('/api/v1/auth/login',async(request,res)=>{if((process.env.AUTH_MODE??'development')==='development'){const user=await db.getRepository(UserEntity).findOneByOrFail({id:LOCAL_USER_ID});res.json({user,accessToken:'development-mode',workspaceId:LOCAL_WORKSPACE_ID});return;}const body=z.object({email:z.string().email(),password:z.string(),workspaceId:z.string().optional()}).parse(request.body);const user=await db.getRepository(UserEntity).createQueryBuilder('user').addSelect('user.passwordHash').where('LOWER(user.email) = :email',{email:body.email.trim().toLowerCase()}).getOne();if(!user||!await verifyPassword(body.password,user.passwordHash))throw new M2MError('UNAUTHORIZED','Email or password is incorrect');const membership=body.workspaceId?await db.getRepository(WorkspaceMemberEntity).findOneBy({userId:user.id,workspaceId:body.workspaceId}):await db.getRepository(WorkspaceMemberEntity).findOne({where:{userId:user.id},order:{createdAt:'ASC'}});if(!membership)throw new M2MError('FORBIDDEN','User has no workspace membership');res.json({user:{id:user.id,email:user.email,displayName:user.displayName},...await issueTokens(db,user.id,membership.workspaceId)});});
  app.post('/api/v1/auth/logout',async(request,res)=>{const body=z.object({refreshToken:z.string().optional()}).parse(request.body??{});if(body.refreshToken)await revokeRefreshToken(db,body.refreshToken);res.status(204).end();});
  app.post('/api/v1/auth/refresh',async(request,res)=>{if((process.env.AUTH_MODE??'development')==='development'){res.json({accessToken:'development-mode',workspaceId:LOCAL_WORKSPACE_ID});return;}const body=z.object({refreshToken:z.string().min(1),workspaceId:z.string().min(1)}).parse(request.body);res.json(await rotateRefreshToken(db,body.refreshToken,body.workspaceId));});

  // Workspaces
  app.get('/api/v1/workspaces',async(request,res)=>{const req=request as M2MRequest;const memberships=await db.getRepository(WorkspaceMemberEntity).findBy({userId:req.auth.userId});const ids=memberships.map(item=>item.workspaceId);if(ids.length===0){res.json([]);return;}const workspaces=await db.getRepository(WorkspaceEntity).createQueryBuilder('workspace').where('workspace.id IN (:...ids)',{ids}).orderBy('workspace.updatedAt','DESC').getMany();res.json(workspaces.map(workspace=>({...workspace,role:memberships.find(item=>item.workspaceId===workspace.id)?.role})));});
  app.post('/api/v1/workspaces',async(request,res)=>{const req=request as M2MRequest;const body=z.object({name:z.string().min(1).max(120)}).parse(request.body);const workspace=db.getRepository(WorkspaceEntity).create({id:randomUUID(),name:body.name,ownerId:req.auth.userId});const membership=db.getRepository(WorkspaceMemberEntity).create({id:randomUUID(),workspaceId:workspace.id,userId:req.auth.userId,role:'OWNER'});await db.transaction(async manager=>{await manager.save(workspace);await manager.save(membership);});res.status(201).json(workspace);});
  app.get('/api/v1/workspaces/:id/members',async(request,res)=>{const req=request as M2MRequest;if(req.params.id!==req.auth.workspaceId)throw new M2MError('FORBIDDEN','Workspace access is denied');const members=await db.getRepository(WorkspaceMemberEntity).createQueryBuilder('member').innerJoinAndSelect(UserEntity,'user','user.id = member.userId').where('member.workspaceId = :workspaceId',{workspaceId:req.params.id}).select(['member.id AS id','member.userId AS userId','member.role AS role','member.createdAt AS createdAt','user.email AS email','user.displayName AS displayName']).getRawMany();res.json(members);});
  app.post('/api/v1/workspaces/:id/members',async(request,res)=>{const req=request as M2MRequest;if(req.params.id!==req.auth.workspaceId||!['OWNER','ADMIN'].includes(req.auth.role))throw new M2MError('FORBIDDEN','Admin role is required');const body=z.object({email:z.string().email(),role:z.enum(['ADMIN','MEMBER','VIEWER']).default('MEMBER')}).parse(request.body);const user=await db.getRepository(UserEntity).findOneBy({email:body.email.trim().toLowerCase()});if(!user)throw new M2MError('NOT_FOUND','User not found');if(await db.getRepository(WorkspaceMemberEntity).findOneBy({workspaceId:req.params.id,userId:user.id}))throw new M2MError('CONFLICT','User is already a workspace member');const member=await db.getRepository(WorkspaceMemberEntity).save({id:randomUUID(),workspaceId:req.params.id,userId:user.id,role:body.role});res.status(201).json(member);});
  app.patch('/api/v1/workspaces/:id/members/:userId',async(request,res)=>{const req=request as M2MRequest;if(req.params.id!==req.auth.workspaceId||!['OWNER','ADMIN'].includes(req.auth.role))throw new M2MError('FORBIDDEN','Admin role is required');const body=z.object({role:z.enum(['ADMIN','MEMBER','VIEWER'])}).parse(request.body);const repository=db.getRepository(WorkspaceMemberEntity);const member=await repository.findOneBy({workspaceId:req.params.id,userId:req.params.userId});if(!member)throw new M2MError('NOT_FOUND','Workspace member not found');if(member.role==='OWNER')throw new M2MError('CONFLICT','Workspace owner role cannot be changed');member.role=body.role;res.json(await repository.save(member));});
  app.delete('/api/v1/workspaces/:id/members/:userId',async(request,res)=>{const req=request as M2MRequest;if(req.params.id!==req.auth.workspaceId||!['OWNER','ADMIN'].includes(req.auth.role))throw new M2MError('FORBIDDEN','Admin role is required');const repository=db.getRepository(WorkspaceMemberEntity);const member=await repository.findOneBy({workspaceId:req.params.id,userId:req.params.userId});if(!member)throw new M2MError('NOT_FOUND','Workspace member not found');if(member.role==='OWNER')throw new M2MError('CONFLICT','Workspace owner cannot be removed');await repository.delete({id:member.id});res.status(204).end();});

  // Nodes & Templates
  app.get('/api/v1/node-types', (_req,res) => res.json(registry.list()));
  app.get('/api/v1/node-types/:type', (req,res,next) => { try { res.json(registry.get(req.params.type).metadata); } catch(error) { next(new M2MError('NOT_FOUND','Node type not found',false,error)); } });
  app.get('/api/v1/templates',(_req,res)=>res.json(workflowTemplates));
  app.post('/api/v1/templates/:id/instantiate',async(request,res)=>{const req=request as M2MRequest;const template=workflowTemplates.find(item=>item.id===req.params.id);if(!template)throw new M2MError('NOT_FOUND','Workflow template not found');const body=z.object({name:z.string().min(1).max(120).optional()}).parse(request.body??{});const workflow=db.getRepository(WorkflowEntity).create({id:randomUUID(),workspaceId:req.auth.workspaceId,name:body.name??template.name,description:template.description,definition:structuredClone(template.definition),active:false,activeVersionId:null,version:0,createdBy:req.auth.userId});res.status(201).json(await db.getRepository(WorkflowEntity).save(workflow));});

  // Workflows
  app.get('/api/v1/workflows', async (request,res) => {
    const req=request as M2MRequest; res.json(await db.getRepository(WorkflowEntity).find({where:{workspaceId:req.auth.workspaceId},order:{updatedAt:'DESC'}}));
  });
  app.post('/api/v1/workflows', async (request,res) => {
    const req=request as M2MRequest; const body=z.object({name:z.string().min(1).max(120),description:z.string().optional(),definition:workflowDefinitionSchema.optional()}).parse(req.body);
    const workflow=db.getRepository(WorkflowEntity).create({id:randomUUID(),workspaceId:req.auth.workspaceId,name:body.name,description:body.description??null,definition:body.definition??emptyDefinition,active:false,activeVersionId:null,version:0,createdBy:req.auth.userId});
    res.status(201).json(await db.getRepository(WorkflowEntity).save(workflow));
  });
  app.post('/api/v1/workflows/import', async (request,res) => {const req=request as M2MRequest;const body=z.object({name:z.string().min(1).max(120),description:z.string().nullable().optional(),definition:workflowDefinitionSchema}).parse(req.body);const workflow=db.getRepository(WorkflowEntity).create({id:randomUUID(),workspaceId:req.auth.workspaceId,name:body.name,description:body.description??null,definition:body.definition,active:false,activeVersionId:null,version:0,createdBy:req.auth.userId});res.status(201).json(await db.getRepository(WorkflowEntity).save(workflow));});
  app.get('/api/v1/workflows/:id', async (request,res) => { const req=request as M2MRequest; const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found'); res.json(workflow); });
  app.get('/api/v1/workflows/:id/export', async (request,res) => {const req=request as M2MRequest;const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId});if(!workflow)throw new M2MError('NOT_FOUND','Workflow not found');res.setHeader('content-disposition',`attachment; filename="${workflow.id}.m2m.json"`);res.json({schemaVersion:1,name:workflow.name,description:workflow.description,definition:workflow.definition});});
  app.patch('/api/v1/workflows/:id', async (request,res) => {
    const req=request as M2MRequest; const repo=db.getRepository(WorkflowEntity); const workflow=await repo.findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found');
    const body=z.object({name:z.string().min(1).max(120).optional(),description:z.string().nullable().optional(),definition:workflowDefinitionSchema.optional()}).parse(req.body);
    Object.assign(workflow,body); res.json(await repo.save(workflow));
  });
  app.delete('/api/v1/workflows/:id', async (request,res) => { const req=request as M2MRequest; const repo=db.getRepository(WorkflowEntity); const workflow=await repo.findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found'); await deactivateWorkflow({db,queue,workflow}); await db.getRepository(WorkflowScheduleEntity).delete({workflowId:workflow.id,workspaceId:req.auth.workspaceId}); await repo.delete({id:workflow.id,workspaceId:req.auth.workspaceId}); res.status(204).end(); });
  app.post('/api/v1/workflows/:id/duplicate', async (request,res) => { const req=request as M2MRequest; const repo=db.getRepository(WorkflowEntity); const source=await repo.findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!source) throw new M2MError('NOT_FOUND','Workflow not found'); const copy=repo.create({...source,id:randomUUID(),name:`${source.name} copy`,active:false,activeVersionId:null,version:0,createdAt:undefined,updatedAt:undefined}); res.status(201).json(await repo.save(copy)); });
  app.post('/api/v1/workflows/:id/validate', async (request,res) => { const req=request as M2MRequest; const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found'); res.json(validateWorkflow(workflow.definition,registry)); });
  app.post('/api/v1/workflows/:id/activate', async (request,res) => { const req=request as M2MRequest; const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found'); res.json(await activateWorkflow({db,queue,registry,workflow,workspaceId:req.auth.workspaceId,userId:req.auth.userId})); });
  app.post('/api/v1/workflows/:id/deactivate', async (request,res) => { const req=request as M2MRequest; const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found'); res.json(await deactivateWorkflow({db,queue,workflow})); });
  app.post('/api/v1/workflows/:id/run', async (request,res) => { const req=request as M2MRequest; const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!workflow) throw new M2MError('NOT_FOUND','Workflow not found'); const execution=await enqueueWorkflow({db,queue,registry,workspaceId:req.auth.workspaceId,userId:req.auth.userId,workflow,mode:'manual',triggerData:req.body}); res.status(202).json(execution); });
  app.get('/api/v1/workflows/:id/versions', async (request,res) => { const req=request as M2MRequest; res.json(await db.getRepository(WorkflowVersionEntity).find({where:{workflowId:req.params.id,workspaceId:req.auth.workspaceId},order:{version:'DESC'}})); });
  app.post('/api/v1/workflows/:id/versions/:versionId/restore', async (request,res) => {const req=request as M2MRequest;const workflow=await db.getRepository(WorkflowEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId});if(!workflow)throw new M2MError('NOT_FOUND','Workflow not found');const version=await db.getRepository(WorkflowVersionEntity).findOneBy({id:req.params.versionId,workflowId:workflow.id,workspaceId:req.auth.workspaceId});if(!version)throw new M2MError('NOT_FOUND','Workflow version not found');if(workflow.active)await deactivateWorkflow({db,queue,workflow});workflow.definition=version.definition;res.json(await db.getRepository(WorkflowEntity).save(workflow));});
  app.get('/api/v1/workflows/:id/schedules', async (request,res) => { const req=request as M2MRequest; res.json(await db.getRepository(WorkflowScheduleEntity).find({where:{workflowId:req.params.id,workspaceId:req.auth.workspaceId},order:{updatedAt:'DESC'}})); });
  app.post('/api/v1/workflows/:id/assistant', async (request, res) => {
    const req = request as M2MRequest;
    const body = assistantBodySchema.parse(req.body);
    const result = await processWorkflowAssistant(await buildAssistantContext(req, body, req.params.id));
    const validation = validateWorkflow(result.definition, registry);
    if (!validation.valid) {
      const blockingErrors = validation.errors.filter((issue) => issue.code !== 'CREDENTIAL_REQUIRED');
      result.canApply = result.canApply && blockingErrors.length === 0;
      result.readyToRun = false;
      result.warnings = [...new Set([
        ...result.warnings,
        ...validation.errors.map((issue) => issue.message)
      ])];
    }
    res.json(result);
  });
  app.post('/api/v1/assistant/workflow', async (request, res) => {
    const req = request as M2MRequest;
    const body = assistantBodySchema.parse(request.body);
    const result = await processWorkflowAssistant(await buildAssistantContext(req, body));
    const validation = validateWorkflow(result.definition, registry);
    if (!validation.valid) {
      const blockingErrors = validation.errors.filter((issue) => issue.code !== 'CREDENTIAL_REQUIRED');
      result.canApply = result.canApply && blockingErrors.length === 0;
      result.readyToRun = false;
      result.warnings = [...new Set([...result.warnings, ...validation.errors.map((issue) => issue.message)])];
    }
    res.json(result);
  });

  // Executions
  app.get('/api/v1/executions', async (request,res) => { const req=request as M2MRequest; res.json(await db.getRepository(ExecutionEntity).find({where:{workspaceId:req.auth.workspaceId},order:{createdAt:'DESC'},take:100})); });
  app.get('/api/v1/executions/:id', async (request,res) => { const req=request as M2MRequest; const execution=await db.getRepository(ExecutionEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!execution) throw new M2MError('NOT_FOUND','Execution not found'); const nodes=await db.getRepository(NodeExecutionEntity).find({where:{executionId:execution.id},order:{startedAt:'ASC'}}); res.json({...execution,nodes}); });
  app.post('/api/v1/executions/:id/retry', async (request,res) => { const req=request as M2MRequest; const original=await db.getRepository(ExecutionEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!original) throw new M2MError('NOT_FOUND','Execution not found'); const workflow=await db.getRepository(WorkflowEntity).findOneByOrFail({id:original.workflowId,workspaceId:req.auth.workspaceId}); const execution=await enqueueWorkflow({db,queue,registry,workspaceId:req.auth.workspaceId,userId:req.auth.userId,workflow,mode:'retry',triggerData:original.triggerData,retryOfId:original.id,workflowVersionId:original.workflowVersionId}); res.status(202).json(execution); });
  app.post('/api/v1/executions/:id/cancel', async (request,res) => { const req=request as M2MRequest; const repo=db.getRepository(ExecutionEntity); const execution=await repo.findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!execution) throw new M2MError('NOT_FOUND','Execution not found'); if(['success','failed','cancelled'].includes(execution.status)) throw new M2MError('CONFLICT','Execution has already finished'); execution.status='cancelled'; execution.finishedAt=new Date(); res.json(await repo.save(execution)); });
  app.delete('/api/v1/executions/:id', async (request,res) => {const req=request as M2MRequest;const repo=db.getRepository(ExecutionEntity);const execution=await repo.findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId});if(!execution)throw new M2MError('NOT_FOUND','Execution not found');if(['queued','running','waiting'].includes(execution.status))throw new M2MError('CONFLICT','Active execution cannot be deleted');await db.transaction(async manager=>{await manager.delete(NodeExecutionEntity,{executionId:execution.id});await manager.delete(ExecutionEntity,{id:execution.id});});res.status(204).end();});
  app.post('/api/v1/admin/retention/run',async(request,res)=>{const req=request as M2MRequest;const days=Math.max(1,Math.min(3650,Number(process.env.EXECUTION_RETENTION_DAYS??30)));const cutoff=new Date(Date.now()-days*86_400_000);const expired=await db.getRepository(ExecutionEntity).createQueryBuilder('execution').select('execution.id').where('execution.workspaceId = :workspaceId',{workspaceId:req.auth.workspaceId}).andWhere('execution.createdAt < :cutoff',{cutoff}).andWhere('execution.status IN (:...statuses)',{statuses:['success','failed','cancelled']}).getMany();const ids=expired.map(item=>item.id);if(ids.length>0)await db.transaction(async manager=>{await manager.createQueryBuilder().delete().from(NodeExecutionEntity).where('executionId IN (:...ids)',{ids}).execute();await manager.createQueryBuilder().delete().from(ExecutionEntity).where('id IN (:...ids)',{ids}).execute();});res.json({deleted:ids.length,retentionDays:days,cutoff:cutoff.toISOString()});});
  app.get('/api/v1/executions/:id/events', async (request,res) => { const req=request as M2MRequest; const execution=await db.getRepository(ExecutionEntity).findOneBy({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!execution) throw new M2MError('NOT_FOUND','Execution not found'); const nodes=await db.getRepository(NodeExecutionEntity).find({where:{executionId:execution.id},order:{startedAt:'ASC'}}); res.setHeader('content-type','text/event-stream'); res.setHeader('cache-control','no-cache'); res.setHeader('connection','keep-alive'); res.flushHeaders(); res.write(`event: snapshot\ndata: ${JSON.stringify({...execution,nodes})}\n\n`); const unsubscribe=events.subscribe(execution.id,event=>res.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)); const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000); request.on('close',()=>{clearInterval(heartbeat);void unsubscribe();}); });

  // Credentials
  app.get('/api/v1/credential-types', (_req, res) => {
    res.json(CREDENTIAL_TYPE_DEFINITIONS);
  });
  app.get('/api/v1/credentials', async (request,res) => { const req=request as M2MRequest; res.json(await db.getRepository(CredentialEntity).find({where:{workspaceId:req.auth.workspaceId},order:{updatedAt:'DESC'}})); });
  app.post('/api/v1/credentials', async (request,res) => { const req=request as M2MRequest; const body=z.object({name:z.string().min(1),type:z.string().min(1),data:z.record(z.string(),z.string()),metadata:z.record(z.string(),z.unknown()).optional()}).parse(req.body); const credential=db.getRepository(CredentialEntity).create({id:randomUUID(),workspaceId:req.auth.workspaceId,name:body.name,type:body.type,encryptedData:encryptCredential(body.data),metadata:body.metadata??null}); const saved=await db.getRepository(CredentialEntity).save(credential); const {encryptedData:_,...safe}=saved; res.status(201).json(safe); });
  app.patch('/api/v1/credentials/:id', async (request,res) => { const req=request as M2MRequest; const repo=db.getRepository(CredentialEntity); const credential=await repo.createQueryBuilder('c').addSelect('c.encryptedData').where('c.id = :id AND c.workspaceId = :workspaceId',{id:req.params.id,workspaceId:req.auth.workspaceId}).getOne(); if(!credential) throw new M2MError('NOT_FOUND','Credential not found'); const body=z.object({name:z.string().min(1).optional(),data:z.record(z.string(),z.string()).optional(),metadata:z.record(z.string(),z.unknown()).optional()}).parse(req.body); if(body.name) credential.name=body.name; if(body.data) credential.encryptedData=encryptCredential(body.data); if(body.metadata) credential.metadata=body.metadata; await repo.save(credential); res.json({id:credential.id,name:credential.name,type:credential.type,metadata:credential.metadata,updatedAt:credential.updatedAt}); });
  app.delete('/api/v1/credentials/:id', async (request,res) => { const req=request as M2MRequest; const result=await db.getRepository(CredentialEntity).delete({id:req.params.id,workspaceId:req.auth.workspaceId}); if(!result.affected) throw new M2MError('NOT_FOUND','Credential not found'); res.status(204).end(); });
  app.post('/api/v1/credentials/:id/test', async (request,res) => {
    const req=request as M2MRequest;
    const credential=await db.getRepository(CredentialEntity).createQueryBuilder('c').addSelect('c.encryptedData').where('c.id = :id AND c.workspaceId = :workspaceId',{id:req.params.id,workspaceId:req.auth.workspaceId}).getOne();
    if(!credential) throw new M2MError('NOT_FOUND','Credential not found');
    const decryptedData = decryptCredential(credential.encryptedData);

    let reachable = true;
    let message = 'Credential configuration is valid';

    if (credential.type === 'comfyui') {
      try {
        const comfyProvider = mediaRouter.get('comfyui');
        const resolvedCredential = { type: credential.type, data: decryptedData };
        if (comfyProvider.diagnoseHealth) {
          const diagnosis = await comfyProvider.diagnoseHealth(resolvedCredential);
          reachable = diagnosis.healthy;
          message = diagnosis.message;
        } else {
          reachable = await comfyProvider.health(resolvedCredential);
          message = reachable ? 'ComfyUI local server is online and reachable' : 'Unable to connect to ComfyUI at specified Base URL';
        }
      } catch (error) {
        reachable = false;
        message = `Connection to ComfyUI failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else if (credential.type === 'huggingface') {
      try {
        const hfProvider = mediaRouter.get('huggingface');
        reachable = await hfProvider.health({ type: credential.type, data: decryptedData });
        message = reachable ? 'Hugging Face token is verified' : 'Invalid or expired Hugging Face token';
      } catch {
        reachable = false;
        message = 'Failed to verify Hugging Face token';
      }
    } else if (credential.type === 'black-forest-labs') {
      try {
        const bflProvider = mediaRouter.get('black-forest-labs');
        reachable = await bflProvider.health({ type: credential.type, data: decryptedData });
        message = reachable ? 'Black Forest Labs API connection verified' : 'Unable to authenticate with BFL API key';
      } catch {
        reachable = false;
        message = 'Failed to reach Black Forest Labs API';
      }
    }

    res.json({ valid: reachable, message });
  });

  const webhookHandler=async (request:express.Request,response:Response,next:NextFunction,test:boolean) => { try { const req=request as M2MRequest; const workflow=test?await db.getRepository(WorkflowEntity).findOneBy({id:req.params.workflowId,workspaceId:req.auth.workspaceId}):await db.getRepository(WorkflowEntity).findOneBy({id:req.params.workflowId,active:true}); if(!workflow || (!test&&!workflow.active)) throw new M2MError('NOT_FOUND',test?'Workflow not found':'Active webhook not found'); let webhookDefinition=workflow.definition; if(!test&&workflow.activeVersionId){const version=await db.getRepository(WorkflowVersionEntity).findOneBy({id:workflow.activeVersionId,workflowId:workflow.id,workspaceId:workflow.workspaceId});if(!version)throw new M2MError('NOT_FOUND','Active workflow version not found');webhookDefinition=version.definition;} const trigger=webhookDefinition.nodes.find(node=>node.type==='trigger.webhook'&&String(node.parameters.path)===req.params.path&&String(node.parameters.method??'POST')===req.method); if(!trigger) throw new M2MError('NOT_FOUND','Webhook endpoint not found'); const key=req.header('idempotency-key'); if(key){const existing=await db.getRepository(IdempotencyKeyEntity).findOneBy({workflowId:workflow.id,key});if(existing&&existing.expiresAt>new Date()){response.json({executionId:existing.executionId,duplicate:true});return;}} const triggerData={body:req.body,query:req.query,headers:Object.fromEntries(Object.entries(req.headers).filter(([name])=>!['authorization','cookie'].includes(name)))}; const execution=await enqueueWorkflow({db,queue,registry,workspaceId:workflow.workspaceId,userId:test?req.auth.userId:workflow.createdBy,workflow,mode:'webhook',triggerData}); if(key) await db.getRepository(IdempotencyKeyEntity).save({id:randomUUID(),workflowId:workflow.id,key,executionId:execution.id,expiresAt:new Date(Date.now()+24*60*60*1000)});const respondNode=webhookDefinition.nodes.find(node=>node.type==='core.respondWebhook');if(respondNode){const result=await waitForWebhookResult(execution.id,respondNode.id);if(result.completed){response.status(200).json(result.body);return;}}response.status(202).json({executionId:execution.id,status:execution.status}); } catch(error){next(error);} };
  app.all('/webhook-test/:workflowId/:path',(req,res,next)=>void webhookHandler(req,res,next,true));
  app.all('/webhook/:workflowId/:path',(req,res,next)=>void webhookHandler(req,res,next,false));

  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Route not found'}}));
  const errorHandler:ErrorRequestHandler=(error,request,response,_next)=>{const serialized=error instanceof z.ZodError?{code:'VALIDATION_ERROR',message:'Request validation failed',retryable:false,details:error.issues}:serializeError(error); if(process.env.NODE_ENV!=='test') console.error(JSON.stringify({level:'error',requestId:(request as M2MRequest).requestId,code:serialized.code,message:serialized.message})); const notFound=serialized.code==='NOT_FOUND'||serialized.code.endsWith('_NOT_FOUND'); const status=serialized.code==='UNAUTHORIZED'?401:serialized.code==='FORBIDDEN'?403:notFound?404:serialized.code==='MEDIA_ASSET_DELETED'?410:serialized.code==='CONFLICT'?409:serialized.code==='VALIDATION_ERROR'||serialized.code==='MEDIA_INVALID_INPUT'?400:serialized.code==='QUEUE_UNAVAILABLE'||serialized.code==='MEDIA_PROVIDER_UNAVAILABLE'?503:500; response.status(status).json({error:serialized});};
  app.use(errorHandler);
  return app;
}
