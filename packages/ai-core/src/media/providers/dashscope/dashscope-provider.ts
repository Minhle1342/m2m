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

const DASHSCOPE_IMAGE_MODELS: Record<string, string> = {
  'dashscope-wanx2.1-turbo': 'wanx2.1-t2i-turbo',
  'dashscope-wanx2.1-plus': 'wanx2.1-t2i-plus',
  'dashscope-wanx-v1': 'wanx-v1'
};

const DASHSCOPE_VIDEO_MODELS: Record<string, string> = {
  'dashscope-wanx2.1-i2v': 'wanx2.1-i2v-turbo',
  'dashscope-wanx2.1-i2v-plus': 'wanx2.1-i2v-plus'
};

export class DashScopeMediaProvider implements MediaProviderAdapter {
  readonly id = 'dashscope';

  constructor(private readonly storage: LocalMediaStorage) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'Alibaba Cloud (DashScope / Wanx)',
      category: 'cloud',
      executionMode: 'cloud',
      costBadge: 'FREE CREDIT',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      requiresApiKey: true,
      documentationUrl: 'https://help.aliyun.com/zh/dashscope/'
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
    return ((credential?.data.baseUrl as string) || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '');
  }

  async health(credential?: ResolvedMediaCredential): Promise<boolean> {
    const apiKey = this.cleanApiKey(credential);
    if (!apiKey) return false;
    try {
      const res = await fetch(`${this.getBaseUrl(credential)}/tasks`, {
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
    if (!apiKey) throw new M2MError('CREDENTIAL_ERROR', 'Alibaba DashScope API Key is required', false);

    const modelName = DASHSCOPE_IMAGE_MODELS[request.model] || request.model || 'wanx2.1-t2i-turbo';
    const width = request.width || 1024;
    const height = request.height || 1024;
    const size = `${width}*${height}`;

    onProgress?.(15);

    const submitRes = await fetch(`${this.getBaseUrl(credential)}/services/aigc/text2image/image-synthesis`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-DashScope-Async': 'enable',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        input: {
          prompt: request.prompt,
          negative_prompt: request.negativePrompt
        },
        parameters: {
          size,
          n: Math.min(4, Math.max(1, request.numberOfImages || 1)),
          seed: request.seed
        }
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new M2MError('MEDIA_GENERATION_FAILED', `DashScope Image Error (${submitRes.status}): ${errText}`, false);
    }

    const submitData = (await submitRes.json()) as { output?: { task_id?: string } };
    const taskId = submitData.output?.task_id;
    if (!taskId) throw new M2MError('MEDIA_GENERATION_FAILED', 'DashScope did not return a task_id', false);

    const startTime = Date.now();
    const timeoutMs = 5 * 60_000;
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${this.getBaseUrl(credential)}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000)
      });
      if (!pollRes.ok) continue;

      const pollData = (await pollRes.json()) as {
        output?: {
          task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
          results?: Array<{ url: string }>;
          message?: string;
        };
      };

      if (pollData.output?.task_status === 'SUCCEEDED') {
        const results = pollData.output.results || [];
        if (results.length === 0 || !results[0]?.url) {
          throw new M2MError('MEDIA_GENERATION_FAILED', 'DashScope finished but returned no image results', false);
        }

        onProgress?.(70);
        const savedFiles: MediaFile[] = [];
        for (let i = 0; i < results.length; i++) {
          const imgRes = await fetch(results[i].url, { signal: AbortSignal.timeout(60_000) });
          if (!imgRes.ok) continue;
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
          savedFiles.push(saved);
          onProgress?.(70 + Math.round(((i + 1) / results.length) * 28));
        }

        onProgress?.(100);
        return savedFiles;
      }

      if (pollData.output?.task_status === 'FAILED') {
        throw new M2MError('MEDIA_GENERATION_FAILED', `DashScope task failed: ${pollData.output.message || 'Unknown error'}`, false);
      }

      onProgress?.(Math.min(65, 20 + Math.round(((Date.now() - startTime) / 30000) * 10)));
    }

    throw new M2MError('MEDIA_GENERATION_TIMEOUT', 'DashScope image generation timed out', false);
  }

  async generateVideo(
    request: VideoGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile> {
    const apiKey = this.cleanApiKey(credential);
    if (!apiKey) throw new M2MError('CREDENTIAL_ERROR', 'Alibaba DashScope API Key is required', false);

    const modelName = DASHSCOPE_VIDEO_MODELS[request.model] || request.model || 'wanx2.1-i2v-turbo';
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

    const inputData: Record<string, unknown> = { prompt: request.prompt };
    if (imageUrl) inputData.img_url = imageUrl;

    const submitRes = await fetch(`${this.getBaseUrl(credential)}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-DashScope-Async': 'enable',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        input: inputData
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new M2MError('MEDIA_GENERATION_FAILED', `DashScope Video Error (${submitRes.status}): ${errText}`, false);
    }

    const submitData = (await submitRes.json()) as { output?: { task_id?: string } };
    const taskId = submitData.output?.task_id;
    if (!taskId) throw new M2MError('MEDIA_GENERATION_FAILED', 'DashScope did not return video task_id', false);

    const startTime = Date.now();
    const timeoutMs = 10 * 60_000;
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 4000));
      const pollRes = await fetch(`${this.getBaseUrl(credential)}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000)
      });
      if (!pollRes.ok) continue;

      const pollData = (await pollRes.json()) as {
        output?: {
          task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
          video_url?: string;
          message?: string;
        };
      };

      if (pollData.output?.task_status === 'SUCCEEDED') {
        const videoUrl = pollData.output.video_url;
        if (!videoUrl) throw new M2MError('MEDIA_GENERATION_FAILED', 'DashScope video completed but video_url is missing', false);

        onProgress?.(85);
        const vRes = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
        if (!vRes.ok) throw new M2MError('MEDIA_GENERATION_FAILED', 'Failed to download DashScope video', false);

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

      if (pollData.output?.task_status === 'FAILED') {
        throw new M2MError('MEDIA_GENERATION_FAILED', `DashScope video failed: ${pollData.output.message || 'Unknown error'}`, false);
      }

      onProgress?.(Math.min(80, 20 + Math.round(((Date.now() - startTime) / 60000) * 10)));
    }

    throw new M2MError('MEDIA_GENERATION_TIMEOUT', 'DashScope video generation timed out', false);
  }
}
