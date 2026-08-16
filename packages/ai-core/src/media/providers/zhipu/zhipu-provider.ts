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

const ZHIPU_IMAGE_MODELS: Record<string, string> = {
  'zhipu-cogview-3-plus': 'cogview-3-plus',
  'zhipu-cogview-4': 'cogview-4'
};

const ZHIPU_VIDEO_MODELS: Record<string, string> = {
  'zhipu-cogvideox-flash': 'cogvideox-flash',
  'zhipu-cogvideox': 'cogvideox',
  'zhipu-cogvideox-2': 'cogvideox-2'
};

export class ZhipuMediaProvider implements MediaProviderAdapter {
  readonly id = 'zhipu';

  constructor(private readonly storage: LocalMediaStorage) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'Zhipu AI (BigModel / CogVideoX)',
      category: 'cloud',
      executionMode: 'cloud',
      costBadge: 'FREE CREDIT',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      requiresApiKey: true,
      documentationUrl: 'https://open.bigmodel.cn/dev/api'
    };
  }

  get info(): MediaProviderInfo {
    return this.getProviderInfo();
  }

  private cleanApiKey(credential?: ResolvedMediaCredential): string {
    const raw = credential?.data.apiKey || credential?.data.token;
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

  private getBaseUrl(credential?: ResolvedMediaCredential): string {
    return ((credential?.data.baseUrl as string) || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
  }

  async health(credential?: ResolvedMediaCredential): Promise<boolean> {
    const apiKey = this.cleanApiKey(credential);
    if (!apiKey) return false;
    try {
      const res = await fetch(`${this.getBaseUrl(credential)}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
      });
      return res.ok || res.status === 200 || res.status === 404;
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
    if (!apiKey) {
      throw new M2MError('CREDENTIAL_ERROR', 'Zhipu AI API key is required', false);
    }
    const modelName = ZHIPU_IMAGE_MODELS[request.model] || request.model || 'cogview-3-plus';
    const width = request.width || 1024;
    const height = request.height || 1024;
    const size = `${width}x${height}`;

    onProgress?.(20);

    const res = await fetch(`${this.getBaseUrl(credential)}/images/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        prompt: request.prompt,
        size
      }),
      signal: AbortSignal.timeout(3 * 60_000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new M2MError('MEDIA_GENERATION_FAILED', `Zhipu Image Error (${res.status}): ${errText}`, false);
    }

    const json = (await res.json()) as { data?: Array<{ url: string }> };
    const items = json.data || [];
    if (items.length === 0 || !items[0]?.url) {
      throw new M2MError('MEDIA_GENERATION_FAILED', 'Zhipu returned no image output', false);
    }

    onProgress?.(70);
    const imgRes = await fetch(items[0].url, { signal: AbortSignal.timeout(60_000) });
    if (!imgRes.ok) throw new M2MError('MEDIA_GENERATION_FAILED', 'Failed to download generated image from Zhipu', false);

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const saved = await this.storage.save({
      type: 'image',
      mimeType: 'image/png',
      buffer,
      provider: this.id,
      model: request.model,
      width,
      height,
      seed: request.seed
    });

    onProgress?.(100);
    return [saved];
  }

  async generateVideo(
    request: VideoGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile> {
    const apiKey = this.cleanApiKey(credential);
    if (!apiKey) throw new M2MError('CREDENTIAL_ERROR', 'Zhipu AI API Key is required', false);

    const modelName = ZHIPU_VIDEO_MODELS[request.model] || request.model || 'cogvideox-flash';
    onProgress?.(10);

    let imageUrl: string | undefined;
    if (request.inputImage) {
      if (typeof request.inputImage === 'string') {
        imageUrl = request.inputImage;
      } else if (typeof request.inputImage === 'object') {
        if (request.inputImage.localPath) {
          const filePath = this.storage.getFilePath(request.inputImage.localPath);
          const { readFileSync } = await import('node:fs');
          const mime = request.inputImage.mimeType || 'image/png';
          imageUrl = `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
        }
      }
    }

    const body: Record<string, unknown> = {
      model: modelName,
      prompt: request.prompt
    };
    if (imageUrl) body.image_url = imageUrl;

    const submitRes = await fetch(`${this.getBaseUrl(credential)}/videos/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000)
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new M2MError('MEDIA_GENERATION_FAILED', `Zhipu Video Submit Error (${submitRes.status}): ${errText}`, false);
    }

    const submitData = (await submitRes.json()) as { id: string };
    const taskId = submitData.id;
    if (!taskId) throw new M2MError('MEDIA_GENERATION_FAILED', 'Zhipu returned no task id', false);

    const startTime = Date.now();
    const timeoutMs = 10 * 60_000;
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 4000));
      const pollRes = await fetch(`${this.getBaseUrl(credential)}/async-result/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000)
      });
      if (!pollRes.ok) continue;

      const pollData = (await pollRes.json()) as {
        task_status: 'PROCESSING' | 'SUCCESS' | 'FAIL';
        video_result?: Array<{ url: string }>;
        msg?: string;
      };

      if (pollData.task_status === 'SUCCESS') {
        const videoUrl = pollData.video_result?.[0]?.url;
        if (!videoUrl) throw new M2MError('MEDIA_GENERATION_FAILED', 'Zhipu video completed but URL is missing', false);

        onProgress?.(85);
        const vRes = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
        if (!vRes.ok) throw new M2MError('MEDIA_GENERATION_FAILED', 'Failed to download Zhipu video', false);

        const buffer = Buffer.from(await vRes.arrayBuffer());
        const saved = await this.storage.save({
          type: 'video',
          mimeType: 'video/mp4',
          buffer,
          provider: this.id,
          model: request.model,
          seed: request.seed
        });
        onProgress?.(100);
        return saved;
      }

      if (pollData.task_status === 'FAIL') {
        throw new M2MError('MEDIA_GENERATION_FAILED', `Zhipu video failed: ${pollData.msg || 'Unknown failure'}`, false);
      }

      onProgress?.(Math.min(80, 20 + Math.round(((Date.now() - startTime) / 60000) * 10)));
    }

    throw new M2MError('MEDIA_GENERATION_TIMEOUT', 'Zhipu video generation timed out after 10 minutes', false);
  }
}
