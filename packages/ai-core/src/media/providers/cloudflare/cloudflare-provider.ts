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

const CF_IMAGE_MODELS: Record<string, string> = {
  'cf-flux-schnell': '@cf/black-forest-labs/flux-1-schnell',
  'cf-sdxl-lightning': '@cf/bytedance/stable-diffusion-xl-lightning'
};

export class CloudflareMediaProvider implements MediaProviderAdapter {
  readonly id = 'cloudflare';

  constructor(private readonly storage: LocalMediaStorage) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'Cloudflare Workers AI (10k Neurons/Day Free)',
      category: 'cloud',
      executionMode: 'cloud',
      costBadge: 'FREE CREDIT',
      defaultBaseUrl: 'https://api.cloudflare.com/client/v4/accounts',
      requiresApiKey: true,
      documentationUrl: 'https://developers.cloudflare.com/workers-ai/'
    };
  }

  get info(): MediaProviderInfo {
    return this.getProviderInfo();
  }

  private cleanApiKey(credential?: ResolvedMediaCredential): string {
    const raw = credential?.data.apiKey || credential?.data.apiToken || credential?.data.token;
    if (typeof raw !== 'string') return '';
    let key = raw.trim();
    if (key.toLowerCase().startsWith('bearer ')) {
      key = key.slice(7).trim();
    }
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  }

  async health(credential?: ResolvedMediaCredential): Promise<boolean> {
    const apiKey = this.cleanApiKey(credential);
    const accountId = (credential?.data.accountId as string)?.trim().replace(/["']/g, '');
    if (!apiKey || !accountId) return false;
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
      });
      return res.ok || res.status === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<MediaModel[]> {
    return BUILTIN_MEDIA_MODELS.filter((m: MediaModel) => m.provider === this.id);
  }

  async generateImage(
    request: ImageGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile[]> {
    const apiKey = this.cleanApiKey(credential);
    const accountId = (credential?.data.accountId as string)?.trim().replace(/["']/g, '');
    if (!apiKey || !accountId) {
      throw new M2MError('CREDENTIAL_ERROR', 'Cloudflare Account ID and API Token are required', false);
    }

    const modelName = CF_IMAGE_MODELS[request.model] || request.model || '@cf/black-forest-labs/flux-1-schnell';
    onProgress?.(20);

    const steps = typeof request.steps === 'number' && request.steps >= 1 && request.steps <= 8 ? Math.round(request.steps) : 4;
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelName}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: request.prompt,
        num_steps: steps
      }),
      signal: AbortSignal.timeout(2 * 60_000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new M2MError('MEDIA_GENERATION_FAILED', `Cloudflare Workers AI Error (${res.status}): ${errText}`, false);
    }

    onProgress?.(70);
    const contentType = res.headers.get('content-type') || 'image/png';
    let buffer: Buffer;

    if (contentType.includes('application/json')) {
      const json = (await res.json()) as { result?: { image?: string } };
      if (!json.result?.image) throw new M2MError('MEDIA_GENERATION_FAILED', 'Cloudflare returned empty JSON image response', false);
      buffer = Buffer.from(json.result.image, 'base64');
    } else {
      buffer = Buffer.from(await res.arrayBuffer());
    }

    const saved = await this.storage.save({
      type: 'image',
      mimeType: 'image/png',
      buffer,
      provider: this.id,
      model: request.model,
      width: request.width || 1024,
      height: request.height || 1024,
      seed: request.seed
    });

    onProgress?.(100);
    return [saved];
  }

  async generateVideo(): Promise<MediaFile> {
    throw new M2MError('NOT_SUPPORTED', 'Cloudflare Workers AI does not currently support video generation models', false);
  }
}
