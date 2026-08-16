import { M2MError, type MediaFile, type MediaModel } from '@m2m/shared';
import type {
  ImageGenerationRequest,
  MediaProviderAdapter,
  MediaProviderInfo,
  ResolvedMediaCredential,
  VideoGenerationRequest
} from '../../types.js';
import { BUILTIN_MEDIA_MODELS } from '../../models/registry.js';
import type { LocalMediaStorage } from '../../storage/media-storage.js';

export class PollinationsMediaProvider implements MediaProviderAdapter {
  readonly id = 'pollinations';

  constructor(private readonly storage: LocalMediaStorage) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'Pollinations.ai (100% Free & Unlimited)',
      category: 'cloud',
      executionMode: 'cloud',
      costBadge: 'FREE CREDIT',
      defaultBaseUrl: 'https://image.pollinations.ai',
      requiresApiKey: false,
      documentationUrl: 'https://pollinations.ai/'
    };
  }

  get info(): MediaProviderInfo {
    return this.getProviderInfo();
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch('https://image.pollinations.ai/prompt/ping?nologo=true', {
        signal: AbortSignal.timeout(6000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<MediaModel[]> {
    return BUILTIN_MEDIA_MODELS.filter((m: MediaModel) => m.provider === this.id);
  }

  async generateImage(
    request: ImageGenerationRequest,
    _credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile[]> {
    onProgress?.(20);
    const width = request.width || 1024;
    const height = request.height || 1024;
    const seed = request.seed || Math.floor(Math.random() * 1_000_000);
    const model = request.model === 'pollinations-turbo' ? 'turbo' : 'flux';

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(request.prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true`;

    const res = await fetch(url, { signal: AbortSignal.timeout(3 * 60_000) });
    if (!res.ok) {
      throw new M2MError('MEDIA_GENERATION_FAILED', `Pollinations.ai Error (${res.status})`, false);
    }

    onProgress?.(70);
    const buffer = Buffer.from(await res.arrayBuffer());
    const saved = await this.storage.save({
      type: 'image',
      mimeType: 'image/png',
      buffer,
      provider: this.id,
      model: request.model,
      width,
      height,
      seed
    });

    onProgress?.(100);
    return [saved];
  }

  async generateVideo(): Promise<MediaFile> {
    throw new M2MError('NOT_SUPPORTED', 'Pollinations.ai does not currently support video generation', false);
  }
}
