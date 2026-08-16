import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaFile } from '@m2m/shared';
import { M2MError } from '@m2m/shared';

export interface SaveMediaOptions {
  workspaceId?: string;
  executionId?: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  buffer: Buffer;
  filename?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  provider?: string;
  model?: string;
  seed?: number;
  metadata?: Record<string, unknown>;
}

function findWorkspaceRoot(startPath: string): string {
  let current = resolve(startPath);
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startPath);
    current = parent;
  }
}

export class LocalMediaStorage {
  private readonly basePath: string;

  constructor(customBasePath?: string) {
    if (customBasePath) {
      this.basePath = resolve(customBasePath);
    } else if (process.env.MEDIA_STORAGE_PATH) {
      this.basePath = resolve(process.env.MEDIA_STORAGE_PATH);
    } else {
      this.basePath = join(findWorkspaceRoot(process.cwd()), 'data', 'media');
    }
    this.ensureDirs();
  }

  private ensureDirs() {
    const dirs = [
      this.basePath,
      join(this.basePath, 'executions'),
      join(this.basePath, 'assets'),
      join(this.basePath, 'temp')
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public async save(options: SaveMediaOptions): Promise<MediaFile> {
    return this.saveMedia(options);
  }

  public async saveMedia(options: SaveMediaOptions): Promise<MediaFile> {
    this.ensureDirs();
    const id = `media_${options.type.slice(0, 3)}_${randomUUID().slice(0, 12)}`;
    const ext = this.getExtensionForMime(options.mimeType, options.filename);
    const filename = options.filename || `${id}${ext}`;

    let targetDir = join(this.basePath, 'assets');
    if (options.executionId) {
      targetDir = join(this.basePath, 'executions', options.executionId, `${options.type}s`);
    }
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const localPath = join(targetDir, filename);
    writeFileSync(localPath, options.buffer);

    const stats = statSync(localPath);

    return {
      id,
      type: options.type,
      mimeType: options.mimeType,
      filename,
      localPath,
      previewUrl: `/api/v1/media/assets/${id}/content`,
      sizeBytes: stats.size,
      width: options.width,
      height: options.height,
      durationMs: options.durationMs,
      fps: options.fps,
      provider: options.provider,
      model: options.model,
      seed: options.seed,
      metadata: options.metadata,
      createdAt: new Date().toISOString()
    };
  }

  public getFilePath(localPath: string): string {
    if (!localPath?.trim()) {
      throw new M2MError('MEDIA_OUTPUT_NOT_FOUND', 'Media file path is empty', false);
    }

    const candidates = [
      resolve(localPath),
      join(this.basePath, localPath),
      join(this.basePath, 'assets', localPath),
      join(this.basePath, 'executions', localPath)
    ];
    const filePath = candidates.find((candidate) => {
      try {
        return existsSync(candidate) && statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (filePath) return filePath;

    throw new M2MError('MEDIA_OUTPUT_NOT_FOUND', `Media file not found on disk: ${localPath}`, false);
  }

  public deleteFile(localPath: string): boolean {
    try {
      const resolved = this.getFilePath(localPath);
      if (existsSync(resolved)) {
        unlinkSync(resolved);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  private getExtensionForMime(mimeType: string, filename?: string): string {
    if (filename && extname(filename)) {
      return extname(filename);
    }
    switch (mimeType.toLowerCase()) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'video/mp4':
        return '.mp4';
      case 'video/webm':
        return '.webm';
      case 'audio/mpeg':
      case 'audio/mp3':
        return '.mp3';
      case 'audio/wav':
        return '.wav';
      default:
        return '.bin';
    }
  }
}
