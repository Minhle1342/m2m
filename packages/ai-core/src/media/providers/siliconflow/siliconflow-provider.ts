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

const SF_IMAGE_MODELS: Record<string, string> = {
  // FLUX Series (Flagship & Available globally on .com and .cn)
  'siliconflow-flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'flux.1-schnell': 'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-schnell': 'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/flux.1-schnell': 'black-forest-labs/FLUX.1-schnell',

  'siliconflow-flux-dev': 'black-forest-labs/FLUX.1-dev',
  'flux-dev': 'black-forest-labs/FLUX.1-dev',
  'black-forest-labs/FLUX.1-dev': 'black-forest-labs/FLUX.1-dev',

  'siliconflow-flux2-pro': 'black-forest-labs/FLUX.2-pro',
  'black-forest-labs/FLUX.2-pro': 'black-forest-labs/FLUX.2-pro',

  'siliconflow-flux2-flex': 'black-forest-labs/FLUX.2-flex',
  'black-forest-labs/FLUX.2-flex': 'black-forest-labs/FLUX.2-flex',

  'siliconflow-flux-1.1-pro': 'black-forest-labs/FLUX-1.1-pro',
  'black-forest-labs/FLUX-1.1-pro': 'black-forest-labs/FLUX-1.1-pro',

  // Qwen & Tongyi Models
  'siliconflow-qwen-image': 'Qwen/Qwen-Image',
  'qwen-image': 'Qwen/Qwen-Image',
  'Qwen/Qwen-Image': 'Qwen/Qwen-Image',

  'siliconflow-z-image': 'Tongyi-MAI/Z-Image-Turbo',
  'z-image': 'Tongyi-MAI/Z-Image-Turbo',
  'Tongyi-MAI/Z-Image-Turbo': 'Tongyi-MAI/Z-Image-Turbo',

  // Kolors (available on CN)
  'siliconflow-kolors': 'Kwai-Kolors/Kolors',
  'kolors': 'Kwai-Kolors/Kolors',
  'kwai-kolors/kolors': 'Kwai-Kolors/Kolors',
  'Kwai-Kolors/Kolors': 'Kwai-Kolors/Kolors',

  // Stability AI (available on CN)
  'siliconflow-sd3.5': 'stabilityai/stable-diffusion-3-5-large',
  'sd3.5': 'stabilityai/stable-diffusion-3-5-large',
  'stabilityai/stable-diffusion-3-5-large': 'stabilityai/stable-diffusion-3-5-large',

  'siliconflow-sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'stabilityai/stable-diffusion-xl-base-1.0': 'stabilityai/stable-diffusion-xl-base-1.0',

  // Fallbacks for ComfyUI / default options
  'flux2-klein-4b': 'black-forest-labs/FLUX.1-schnell',
  'flux1-dev': 'black-forest-labs/FLUX.1-dev',
  'default': 'black-forest-labs/FLUX.1-schnell'
};

const SF_VIDEO_MODELS: Record<string, string> = {
  'siliconflow-wan2.2-i2v': 'Wan-AI/Wan2.2-I2V-A14B',
  'Wan-AI/Wan2.2-I2V-A14B': 'Wan-AI/Wan2.2-I2V-A14B',

  'siliconflow-wan2.1-i2v': 'Wan-AI/Wan2.2-I2V-A14B',
  'wan2.1-i2v': 'Wan-AI/Wan2.2-I2V-A14B',
  'Wan-AI/Wan2.1-I2V-14B-720P': 'Wan-AI/Wan2.2-I2V-A14B',

  'siliconflow-wan2.1-i2v-turbo': 'Wan-AI/Wan2.2-I2V-A14B',
  'Wan-AI/Wan2.1-I2V-14B-720P-Turbo': 'Wan-AI/Wan2.2-I2V-A14B',

  'siliconflow-wan2.2-t2v': 'Wan-AI/Wan2.2-T2V-A14B',
  'Wan-AI/Wan2.2-T2V-A14B': 'Wan-AI/Wan2.2-T2V-A14B',

  'siliconflow-wan2.1-t2v': 'Wan-AI/Wan2.2-T2V-A14B',
  'Wan-AI/Wan2.1-T2V-14B-720P': 'Wan-AI/Wan2.2-T2V-A14B',

  'siliconflow-cogvideox': 'Wan-AI/Wan2.2-I2V-A14B',
  'cogvideox': 'Wan-AI/Wan2.2-I2V-A14B',
  'cogvideox-5b': 'Wan-AI/Wan2.2-I2V-A14B',
  'THUDM/CogVideoX-5b': 'Wan-AI/Wan2.2-I2V-A14B',

  'siliconflow-hunyuan': 'Wan-AI/Wan2.2-I2V-A14B',
  'hunyuan': 'Wan-AI/Wan2.2-I2V-A14B',
  'tencent/HunyuanVideo': 'Wan-AI/Wan2.2-I2V-A14B',

  // Default video model on SiliconCloud (Wan 2.2 is the active supported model)
  'wan2.2-ti2v-5b': 'Wan-AI/Wan2.2-I2V-A14B',
  'default': 'Wan-AI/Wan2.2-I2V-A14B'
};

export class SiliconFlowMediaProvider implements MediaProviderAdapter {
  readonly id = 'siliconflow';

  constructor(private readonly storage: LocalMediaStorage) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'SiliconCloud (SiliconFlow)',
      category: 'cloud',
      executionMode: 'cloud',
      costBadge: 'FREE CREDIT',
      defaultBaseUrl: 'https://api.siliconflow.com/v1',
      requiresApiKey: true,
      documentationUrl: 'https://docs.siliconflow.com/en/userguide/introduction'
    };
  }

  get info(): MediaProviderInfo {
    return this.getProviderInfo();
  }

  private cleanApiKey(credential?: ResolvedMediaCredential): string {
    const raw = (credential?.data.apiKey || credential?.data.token || '').trim();
    return raw.replace(/^bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
  }

  private getCandidateBaseUrls(credential?: ResolvedMediaCredential): string[] {
    const custom = (credential?.data.baseUrl || '').trim();
    if (custom) {
      const normalized = custom.replace(/\/+$/, '');
      const secondary = normalized.includes('.com')
        ? normalized.replace('.com', '.cn')
        : normalized.replace('.cn', '.com');
      return [normalized, secondary];
    }
    return ['https://api.siliconflow.com/v1', 'https://api.siliconflow.cn/v1'];
  }

  private async fetchWithFallback(
    endpoint: string,
    init: RequestInit,
    credential?: ResolvedMediaCredential
  ): Promise<{ res: Response; baseUrl: string; usedUrl: string }> {
    const baseUrls = this.getCandidateBaseUrls(credential);
    let lastResponse: Response | undefined;
    let lastUrl = '';
    let lastBase = baseUrls[0];

    for (const base of baseUrls) {
      lastBase = base;
      lastUrl = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      try {
        const res = await fetch(lastUrl, init);
        if (res.status === 401 && baseUrls.length > 1 && base === baseUrls[0]) {
          lastResponse = res;
          continue;
        }
        return { res, baseUrl: lastBase, usedUrl: lastUrl };
      } catch (err) {
        if (base === baseUrls[baseUrls.length - 1] && !lastResponse) {
          throw err;
        }
      }
    }

    if (lastResponse) {
      return { res: lastResponse, baseUrl: lastBase, usedUrl: lastUrl };
    }
    throw new M2MError('PROVIDER_UNAVAILABLE', `All candidate endpoints failed for ${endpoint}`, false);
  }

  async health(credential?: ResolvedMediaCredential): Promise<boolean> {
    const apiKey = this.cleanApiKey(credential);
    if (!apiKey) return false;
    try {
      const { res } = await this.fetchWithFallback(
        '/models',
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(6000)
        },
        credential
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async testConnection(credential?: ResolvedMediaCredential): Promise<boolean> {
    return this.health(credential);
  }

  private resolveImageModel(model?: string): string {
    const key = (model || '').trim();
    if (SF_IMAGE_MODELS[key]) return SF_IMAGE_MODELS[key];
    if (SF_IMAGE_MODELS[key.toLowerCase()]) return SF_IMAGE_MODELS[key.toLowerCase()];
    if (key.includes('/')) return key;
    return 'black-forest-labs/FLUX.1-schnell';
  }

  private resolveVideoModel(model?: string): string {
    const key = (model || '').trim();
    if (SF_VIDEO_MODELS[key]) return SF_VIDEO_MODELS[key];
    if (SF_VIDEO_MODELS[key.toLowerCase()]) return SF_VIDEO_MODELS[key.toLowerCase()];
    if (key.includes('/')) return key;
    return 'Wan-AI/Wan2.2-I2V-A14B';
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
      throw new M2MError('CREDENTIAL_ERROR', 'SiliconFlow API key is required', false);
    }

    let modelName = this.resolveImageModel(request.model);
    const width = request.width || 1024;
    const height = request.height || 1024;
    const imageSize = `${width}x${height}`;

    onProgress?.(15);

    const body: Record<string, unknown> = {
      model: modelName,
      prompt: request.prompt,
      image_size: imageSize,
      batch_size: Math.min(4, Math.max(1, request.numberOfImages || 1)),
      seed: request.seed
    };

    if (request.negativePrompt && !modelName.includes('FLUX')) {
      body.negative_prompt = request.negativePrompt;
    }
    if (request.steps) {
      body.num_inference_steps = request.steps;
    }
    if (request.guidance && !modelName.includes('FLUX.1-schnell')) {
      body.guidance_scale = request.guidance;
    }

    let { res } = await this.fetchWithFallback(
      '/images/generations',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3 * 60_000)
      },
      credential
    );

    // Auto-fallback if model does not exist on this endpoint (code 20012)
    if (!res.ok && res.status === 400) {
      const errClone = res.clone();
      try {
        const errJson = (await errClone.json()) as { code?: number; message?: string };
        if (errJson?.code === 20012 && modelName !== 'black-forest-labs/FLUX.1-schnell') {
          body.model = 'black-forest-labs/FLUX.1-schnell';
          const retryRes = await this.fetchWithFallback(
            '/images/generations',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(3 * 60_000)
            },
            credential
          );
          if (retryRes.res.ok) {
            res = retryRes.res;
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new M2MError('MEDIA_GENERATION_FAILED', `SiliconFlow Image Error (${res.status}): ${errText}`, false);
    }

    const json = (await res.json()) as { images?: Array<{ url: string }>; data?: Array<{ url: string }> };
    const items = json.images || json.data || [];
    if (items.length === 0 || !items[0]?.url) {
      throw new M2MError('MEDIA_GENERATION_FAILED', 'SiliconFlow returned no image output', false);
    }

    onProgress?.(60);
    const savedFiles: MediaFile[] = [];
    for (let i = 0; i < items.length; i++) {
      const imgRes = await fetch(items[i].url, { signal: AbortSignal.timeout(60_000) });
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
      onProgress?.(60 + Math.round(((i + 1) / items.length) * 35));
    }

    if (savedFiles.length === 0) {
      throw new M2MError('MEDIA_GENERATION_FAILED', 'Failed to download generated images from SiliconFlow', false);
    }

    onProgress?.(100);
    return savedFiles;
  }

  async generateVideo(
    request: VideoGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile> {
    const apiKey = this.cleanApiKey(credential);
    if (!apiKey) {
      throw new M2MError('CREDENTIAL_ERROR', 'SiliconFlow API key is required', false);
    }

    const modelName = this.resolveVideoModel(request.model);
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

    let imageSize = '1280x720';
    if (typeof request.inputImage === 'object' && request.inputImage?.width && request.inputImage?.height) {
      const w = request.inputImage.width;
      const h = request.inputImage.height;
      if (Math.abs(w - h) < 120) {
        imageSize = '960x960';
      } else if (h > w) {
        imageSize = '720x1280';
      } else {
        imageSize = '1280x720';
      }
    }

    const submitBody: Record<string, unknown> = {
      model: modelName,
      prompt: request.prompt,
      image_size: imageSize
    };
    if (imageUrl) submitBody.image = imageUrl;
    if (request.negativePrompt) submitBody.negative_prompt = request.negativePrompt;
    if (request.seed) submitBody.seed = request.seed;

    let { res: submitRes, baseUrl: activeBaseUrl } = await this.fetchWithFallback(
      '/video/submit',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(submitBody),
        signal: AbortSignal.timeout(60_000)
      },
      credential
    );

    // Auto-fallback if model is disabled (30003) or missing (20012)
    if (!submitRes.ok && (submitRes.status === 403 || submitRes.status === 400)) {
      const errClone = submitRes.clone();
      try {
        const errJson = (await errClone.json()) as { code?: number; message?: string };
        if ((errJson?.code === 30003 || errJson?.code === 20012) && modelName !== 'Wan-AI/Wan2.1-I2V-14B-720P') {
          submitBody.model = 'Wan-AI/Wan2.1-I2V-14B-720P';
          const retryRes = await this.fetchWithFallback(
            '/video/submit',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify(submitBody),
              signal: AbortSignal.timeout(60_000)
            },
            credential
          );
          if (retryRes.res.ok) {
            submitRes = retryRes.res;
            activeBaseUrl = retryRes.baseUrl;
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      let detailedMessage = `SiliconFlow Video Submit Error (${submitRes.status}): ${errText}`;
      try {
        const errJson = JSON.parse(errText) as { code?: number; message?: string };
        if (errJson?.code === 30001) {
          detailedMessage = 'Tài khoản SiliconCloud của bạn chưa đủ số dư để tạo Video (Wan2.2-I2V có chi phí ~$0.29/video trên SiliconFlow). Bạn có thể nạp tiền tại cloud.siliconflow.com hoặc chuyển sang Provider Zhipu AI (CogVideoX-Flash) / ComfyUI Local để tạo video miễn phí.';
        } else if (errJson?.code === 30003) {
          detailedMessage = `Mô hình video "${modelName}" đang bị tạm ngưng trên SiliconFlow. Bạn có thể đổi sang nhà cung cấp Zhipu AI hoặc ComfyUI Local.`;
        }
      } catch {
        // use default detailedMessage
      }
      throw new M2MError('MEDIA_GENERATION_FAILED', detailedMessage, false);
    }

    const submitData = (await submitRes.json()) as { requestId: string };
    const requestId = submitData.requestId;
    if (!requestId) {
      throw new M2MError('MEDIA_GENERATION_FAILED', 'SiliconFlow returned no video requestId', false);
    }

    // Polling for video completion
    const startTime = Date.now();
    const timeoutMs = 10 * 60_000;
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 4000));
      const statusRes = await fetch(`${activeBaseUrl}/video/status`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ requestId }),
        signal: AbortSignal.timeout(30_000)
      });

      if (!statusRes.ok) continue;
      const statusData = (await statusRes.json()) as {
        status: string;
        results?: { videos?: Array<{ url: string }> };
        reason?: string;
      };

      if (statusData.status === 'Succeed') {
        const videoUrl = statusData.results?.videos?.[0]?.url;
        if (!videoUrl) throw new M2MError('MEDIA_GENERATION_FAILED', 'SiliconFlow video finished but no URL was returned', false);

        onProgress?.(85);
        const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
        if (!videoRes.ok) throw new M2MError('MEDIA_GENERATION_FAILED', 'Failed to download completed video', false);

        const buffer = Buffer.from(await videoRes.arrayBuffer());
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

      if (statusData.status === 'Failed') {
        throw new M2MError('MEDIA_GENERATION_FAILED', `SiliconFlow video generation failed: ${statusData.reason || 'Unknown error'}`, false);
      }

      onProgress?.(Math.min(80, 20 + Math.round(((Date.now() - startTime) / 60000) * 10)));
    }

    throw new M2MError('MEDIA_GENERATION_TIMEOUT', 'SiliconFlow video generation timed out after 10 minutes', false);
  }
}
