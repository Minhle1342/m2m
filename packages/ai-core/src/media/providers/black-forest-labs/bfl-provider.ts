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

export class BlackForestLabsMediaProvider implements MediaProviderAdapter {
  readonly id = 'black-forest-labs';

  constructor(private readonly storage: LocalMediaStorage) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'Black Forest Labs (FLUX Cloud API)',
      category: 'image',
      executionMode: 'cloud',
      costBadge: 'PAID',
      defaultBaseUrl: 'https://api.bfl.ml',
      requiresApiKey: true,
      documentationUrl: 'https://docs.bfl.ai/'
    };
  }

  get info(): MediaProviderInfo {
    return this.getProviderInfo();
  }

  private getBaseUrl(credential?: ResolvedMediaCredential): string {
    return ((credential?.data.baseUrl as string) || 'https://api.bfl.ml').replace(/\/+$/, '');
  }

  async health(credential?: ResolvedMediaCredential): Promise<boolean> {
    const apiKey = credential?.data.apiKey;
    if (!apiKey) return false;
    try {
      const res = await fetch(`${this.getBaseUrl(credential)}/v1/get_result?id=test`, {
        headers: { 'x-key': apiKey },
        signal: AbortSignal.timeout(4000)
      });
      // 404 means the endpoint & key auth reached BFL successfully
      return res.status === 404 || res.status === 200;
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
    const apiKey = credential?.data.apiKey;
    if (!apiKey) {
      throw new M2MError('CREDENTIAL_ERROR', 'Black Forest Labs API Key is required', false);
    }

    const endpoint = request.model.includes('dev')
      ? `${this.getBaseUrl(credential)}/v1/flux-dev`
      : `${this.getBaseUrl(credential)}/v1/flux-pro-1.1`;

    const body = {
      prompt: request.prompt,
      width: request.width || 1024,
      height: request.height || 1024,
      steps: request.steps || 28,
      guidance: request.guidance || 3.0,
      seed: request.seed,
      output_format: 'png'
    };

    onProgress?.(10);
    const submitRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new M2MError('MEDIA_PROVIDER_UNAVAILABLE', `BFL API Error: ${errText}`, false);
    }

    const submitData = (await submitRes.json()) as { id: string; polling_url?: string };
    const pollingUrl =
      submitData.polling_url || `${this.getBaseUrl(credential)}/v1/get_result?id=${submitData.id}`;

    // Poll until ready
    let resultUrl = '';
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      onProgress?.(15 + Math.min(80, Math.floor((i / maxPolls) * 80)));

      const pollRes = await fetch(pollingUrl, {
        headers: { 'x-key': apiKey }
      });
      if (!pollRes.ok) continue;

      const pollData = (await pollRes.json()) as {
        status: 'Pending' | 'Ready' | 'Error' | 'Task not found';
        result?: { sample: string };
      };

      if (pollData.status === 'Ready' && pollData.result?.sample) {
        resultUrl = pollData.result.sample;
        break;
      } else if (pollData.status === 'Error') {
        throw new M2MError('MEDIA_GENERATION_FAILED', 'BFL generation failed', false);
      }
    }

    if (!resultUrl) {
      throw new M2MError('MEDIA_GENERATION_FAILED', 'BFL generation timed out', true);
    }

    onProgress?.(95);
    const imgRes = await fetch(resultUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const saved = await this.storage.save({
      type: 'image',
      mimeType: 'image/png',
      buffer,
      filename: `bfl_${Date.now()}.png`,
      width: request.width || 1024,
      height: request.height || 1024,
      provider: this.id,
      model: request.model,
      seed: request.seed
    });

    onProgress?.(100);
    return [saved];
  }

  async generateVideo(
    _request: VideoGenerationRequest,
    _credential?: ResolvedMediaCredential
  ): Promise<MediaFile> {
    throw new M2MError(
      'NOT_SUPPORTED',
      'Video generation is not currently supported by Black Forest Labs direct adapter. Use ComfyUI Wan2.2.',
      false
    );
  }
}
