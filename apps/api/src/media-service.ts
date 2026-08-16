import { randomUUID } from 'node:crypto';
import { createReadStream, statSync, existsSync } from 'node:fs';
import type { Request, Response } from 'express';
import {
  MediaAssetEntity,
  MediaAssetReferenceEntity,
  MediaAssetVersionEntity,
  MediaGenerationJobEntity,
  type M2MDataSource
} from '@m2m/database';
import { createDefaultMediaRouter } from '@m2m/config';
import { M2MError, type MediaFile } from '@m2m/shared';

export class MediaService {
  public readonly mediaRouter = createDefaultMediaRouter();

  constructor(private readonly db: M2MDataSource) {}

  public getRouter() {
    return this.mediaRouter;
  }

  public async getAsset(workspaceId: string, assetId: string): Promise<MediaAssetEntity> {
    const asset = await this.db.getRepository(MediaAssetEntity).findOneBy({
      id: assetId,
      workspaceId
    });
    if (!asset) {
      throw new M2MError('MEDIA_ASSET_NOT_FOUND', 'Media asset not found', false);
    }
    return asset;
  }

  public async listAssets(workspaceId: string, type?: 'image' | 'video' | 'audio'): Promise<MediaAssetEntity[]> {
    const where: Record<string, unknown> = { workspaceId };
    if (type) where.type = type;
    return this.db.getRepository(MediaAssetEntity).find({
      where,
      order: { createdAt: 'DESC' },
      take: 100
    });
  }

  public streamAssetContent(req: Request, res: Response, asset: MediaAssetEntity): void {
    if (asset.deletedAt) {
      throw new M2MError('MEDIA_ASSET_DELETED', 'This media asset has been deleted', false);
    }

    let filePath: string;
    try {
      filePath = this.mediaRouter.storage.getFilePath(asset.localPath);
    } catch {
      throw new M2MError('MEDIA_OUTPUT_NOT_FOUND', 'Media file not found on storage disk', false);
    }

    if (!existsSync(filePath)) {
      throw new M2MError('MEDIA_OUTPUT_NOT_FOUND', 'Media file not found on disk', false);
    }

    const stat = statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Handle HTTP Range headers for seeking in HTML5 Video
    if (range && asset.type === 'video') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': asset.mimeType || 'video/mp4'
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/png'),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400'
      };
      res.writeHead(200, head);
      createReadStream(filePath).pipe(res);
    }
  }

  public async getVersions(assetId: string): Promise<MediaAssetVersionEntity[]> {
    return this.db.getRepository(MediaAssetVersionEntity).find({
      where: { assetId },
      order: { createdAt: 'DESC' }
    });
  }

  public async editAsset(input: {
    workspaceId: string;
    assetId: string;
    prompt: string;
    maskAssetId?: string;
    maskData?: string;
    operation?: 'replace-object' | 'remove-object' | 'inpaint' | 'edit';
    model?: string;
  }): Promise<{ asset: MediaAssetEntity; version: MediaAssetVersionEntity }> {
    const asset = await this.getAsset(input.workspaceId, input.assetId);
    if (asset.type !== 'image') {
      throw new M2MError('MEDIA_EDIT_UNSUPPORTED', 'Only image assets can be edited with prompt/mask', false);
    }

    const model = input.model || 'flux2-klein-4b';
    const { provider } = this.mediaRouter.resolveProviderForModel(model);
    if (!provider.editImage) {
      throw new M2MError('MEDIA_EDIT_UNSUPPORTED', `Provider '${provider.id}' does not support editing`, false);
    }

    // Save initial version if none exists
    const versionRepo = this.db.getRepository(MediaAssetVersionEntity);
    const existingVersions = await versionRepo.findBy({ assetId: asset.id });
    if (existingVersions.length === 0) {
      await versionRepo.save(
        versionRepo.create({
          id: randomUUID(),
          assetId: asset.id,
          operation: 'generated',
          prompt: asset.metadata?.prompt ? String(asset.metadata.prompt) : 'Original image',
          provider: asset.provider,
          model: asset.model,
          localPath: asset.localPath,
          mimeType: asset.mimeType
        })
      );
    }

    // Perform the edit
    const editedFile = await provider.editImage({
      prompt: input.prompt,
      model,
      sourceImage: asset.localPath,
      maskImage: input.maskData || (input.maskAssetId ? (await this.getAsset(input.workspaceId, input.maskAssetId)).localPath : undefined),
      operation: input.operation || 'replace-object'
    });

    // Create new version
    const newVersion = await versionRepo.save({
      id: randomUUID(),
      assetId: asset.id,
      parentVersionId: existingVersions[0]?.id || null,
      operation: input.operation || 'edit',
      prompt: input.prompt,
      provider: provider.id,
      model,
      localPath: editedFile.localPath || '',
      mimeType: editedFile.mimeType
    });

    // Update active asset pointing to new edited file
    asset.localPath = editedFile.localPath || asset.localPath;
    asset.mimeType = editedFile.mimeType;
    asset.provider = provider.id;
    asset.model = model;
    await this.db.getRepository(MediaAssetEntity).save(asset);

    return { asset, version: newVersion };
  }

  public async restoreVersion(input: {
    workspaceId: string;
    assetId: string;
    versionId: string;
  }): Promise<MediaAssetEntity> {
    const asset = await this.getAsset(input.workspaceId, input.assetId);
    const version = await this.db.getRepository(MediaAssetVersionEntity).findOneBy({
      id: input.versionId,
      assetId: asset.id
    });
    if (!version) {
      throw new M2MError('NOT_FOUND', 'Asset version not found', false);
    }

    asset.localPath = version.localPath;
    asset.mimeType = version.mimeType;
    if (version.provider) asset.provider = version.provider;
    if (version.model) asset.model = version.model;
    return this.db.getRepository(MediaAssetEntity).save(asset);
  }

  public async deleteAsset(workspaceId: string, assetId: string, force = false): Promise<{ softDeleted: boolean; warning?: string }> {
    const asset = await this.getAsset(workspaceId, assetId);

    // Check active references
    const references = await this.db.getRepository(MediaAssetReferenceEntity).findBy({ assetId });
    if (references.length > 0 && !force) {
      return {
        softDeleted: false,
        warning: `This media is referenced by ${references.length} active node execution(s) or workflows.`
      };
    }

    asset.deletedAt = new Date();
    await this.db.getRepository(MediaAssetEntity).save(asset);
    return { softDeleted: true };
  }
}
