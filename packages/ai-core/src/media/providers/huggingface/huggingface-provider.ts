import { M2MError, type MediaFile, type MediaModel } from '@m2m/shared';
import { InferenceClient } from '@huggingface/inference';
import { readFile } from 'node:fs/promises';
import type {
  ImageGenerationRequest,
  MediaProviderAdapter,
  MediaProviderInfo,
  ResolvedMediaCredential,
  VideoGenerationRequest
} from '../../types.js';
import { BUILTIN_MEDIA_MODELS } from '../../models/registry.js';
import type { LocalMediaStorage } from '../../storage/media-storage.js';

type HuggingFaceInferenceClient = Pick<InferenceClient, 'textToImage' | 'imageToVideo'>;

const HF_MODEL_IDS: Record<string, string> = {
  'hf-flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'hf-ltx-video-i2v': 'Lightricks/LTX-Video-0.9.8-13B-distilled'
};

export class HuggingFaceMediaProvider implements MediaProviderAdapter {
  readonly id = 'huggingface';

  constructor(
    private readonly storage: LocalMediaStorage,
    private readonly clientFactory: (token: string) => HuggingFaceInferenceClient = (token) => new InferenceClient(token)
  ) {}

  getProviderInfo(): MediaProviderInfo {
    return {
      id: this.id,
      displayName: 'Hugging Face (Inference Providers)',
      category: 'cloud',
      executionMode: 'cloud',
      costBadge: 'FREE CREDIT',
      defaultBaseUrl: 'https://router.huggingface.co',
      requiresApiKey: true,
      documentationUrl: 'https://huggingface.co/docs/inference-providers/pricing'
    };
  }

  get info(): MediaProviderInfo {
    return this.getProviderInfo();
  }

  async health(credential?: ResolvedMediaCredential): Promise<boolean> {
    const token = credential?.data.apiKey || credential?.data.token;
    if (!token) return false;
    try {
      const res = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000)
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
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile[]> {
    const token = credential?.data.apiKey || credential?.data.token;
    if (!token) {
      throw new M2MError('CREDENTIAL_ERROR', 'Hugging Face access token is required', false);
    }

    onProgress?.(20);
    const modelId = HF_MODEL_IDS[request.model] || request.model;
    let image: Blob;
    try {
      image = await this.clientFactory(String(token)).textToImage(
        {
          model: modelId,
          provider: 'auto',
          inputs: request.prompt,
          parameters: {
            guidance_scale: request.guidance || 3.5,
            num_inference_steps: request.steps || 4,
            seed: request.seed,
            width: request.width,
            height: request.height
          }
        },
        { signal: AbortSignal.timeout(5 * 60_000) }
      );
    } catch (error) {
      throw this.toGenerationError('image', error);
    }

    onProgress?.(80);
    const buffer = Buffer.from(await image.arrayBuffer());
    const mimeType = image.type || 'image/png';

    const saved = await this.storage.save({
      type: 'image',
      mimeType,
      buffer,
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
    request: VideoGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile> {
    const token = credential?.data.apiKey || credential?.data.token;
    if (!token) {
      throw new M2MError('CREDENTIAL_ERROR', 'Hugging Face access token is required', false);
    }
    if (!request.inputImage) {
      throw new M2MError('MEDIA_INVALID_INPUT', 'Hugging Face image-to-video requires an input image', false);
    }

    onProgress?.(10);
    const inputImage = await this.resolveInputImage(request.inputImage);
    const fps = Math.max(1, Math.round(request.fps || 24));
    const durationSeconds = Math.max(1, request.durationSeconds || 5);
    const requestedFrames = Math.max(1, Math.round(durationSeconds * fps));
    // LTX requires 8n+1 frames. Round down so a nominal five-second request
    // stays below the $0.10 monthly free credit at fal.ai's $0.02/second rate.
    const numFrames = Math.max(9, Math.floor((requestedFrames - 1) / 8) * 8 + 1);
    const modelId = HF_MODEL_IDS[request.model] || request.model;

    onProgress?.(30);
    let video: Blob;
    try {
      video = await this.clientFactory(String(token)).imageToVideo(
        {
          model: modelId,
          provider: 'fal-ai',
          inputs: inputImage,
          parameters: {
            prompt: request.prompt,
            negative_prompt: request.negativePrompt,
            num_frames: numFrames,
            seed: request.seed,
            resolution: '480p',
            aspect_ratio: this.normalizeAspectRatio(request.aspectRatio),
            frame_rate: fps,
            first_pass_num_inference_steps: request.steps || 8,
            enable_detail_pass: false,
            expand_prompt: false
          }
        },
        { signal: AbortSignal.timeout(10 * 60_000) }
      );
    } catch (error) {
      throw this.toGenerationError('video', error);
    }

    onProgress?.(85);
    const saved = await this.storage.save({
      type: 'video',
      mimeType: video.type || 'video/mp4',
      buffer: Buffer.from(await video.arrayBuffer()),
      durationMs: Math.round((numFrames / fps) * 1000),
      fps,
      provider: this.id,
      model: request.model,
      seed: request.seed,
      metadata: { inferenceProvider: 'fal-ai', resolution: '480p', numFrames }
    });
    onProgress?.(100);
    return saved;
  }

  private async resolveInputImage(input: string | MediaFile): Promise<Blob> {
    if (typeof input === 'object') {
      const storedPath = input.localPath || input.filename;
      if (!storedPath) {
        throw new M2MError('MEDIA_INPUT_UNAVAILABLE', 'Input image does not contain a local file path', false);
      }
      const filePath = this.storage.getFilePath(storedPath);
      const buffer = await readFile(filePath);
      return new Blob([Uint8Array.from(buffer)], { type: input.mimeType || 'image/png' });
    }

    if (/^(https?:|data:)/i.test(input)) {
      const response = await fetch(input, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        throw new M2MError('MEDIA_INPUT_UNAVAILABLE', `Unable to load input image: HTTP ${response.status}`, true);
      }
      return response.blob();
    }

    const filePath = this.storage.getFilePath(input);
    const buffer = await readFile(filePath);
    return new Blob([Uint8Array.from(buffer)], { type: 'image/png' });
  }

  private normalizeAspectRatio(value?: string): '9:16' | '1:1' | '16:9' | 'auto' {
    return value === '9:16' || value === '1:1' || value === '16:9' ? value : 'auto';
  }

  private toGenerationError(mediaType: 'image' | 'video', error: unknown): M2MError {
    if (error instanceof M2MError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const billingHint = /credit|billing|payment|quota|402/i.test(message)
      ? ' Check the monthly Inference Providers credit or add prepaid credit in Hugging Face.'
      : '';
    return new M2MError(
      'MEDIA_GENERATION_FAILED',
      `Hugging Face ${mediaType} inference failed: ${message}.${billingHint}`,
      /timeout|429|503|temporar/i.test(message),
      message
    );
  }
}
