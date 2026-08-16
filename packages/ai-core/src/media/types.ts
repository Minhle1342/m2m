import type {
  MediaFile,
  MediaModel,
  MediaModelCapabilities,
  MediaTask
} from '@m2m/shared';

export interface ResolvedMediaCredential {
  id?: string;
  name?: string;
  type: string;
  data: {
    apiKey?: string;
    token?: string;
    baseUrl?: string;
    [key: string]: unknown;
  };
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  numberOfImages?: number;
  outputFormat?: 'png' | 'jpeg' | 'webp';
  referenceImages?: string[];
  maskImage?: string;
}

export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  inputImage?: string | MediaFile;
  durationSeconds?: number;
  fps?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  seed?: number;
  steps?: number;
  motionStrength?: number;
  outputFormat?: 'mp4' | 'webm';
}

export interface ImageEditRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  sourceImage: string | MediaFile;
  maskImage?: string | MediaFile;
  operation?: 'replace-object' | 'remove-object' | 'inpaint' | 'edit';
  seed?: number;
  steps?: number;
  guidance?: number;
}

export interface MediaGenerationStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  message?: string;
  files?: MediaFile[];
  error?: string;
}

export interface MediaProviderInfo {
  id: string;
  displayName: string;
  category: 'local-inference' | 'image' | 'video' | 'cloud';
  executionMode: 'local' | 'cloud';
  costBadge: 'LOCAL' | 'OPEN-WEIGHT' | 'FREE CREDIT' | 'PAID' | 'BYOK';
  defaultBaseUrl?: string;
  requiresApiKey?: boolean;
  documentationUrl?: string;
}

export interface MediaProviderHealthResult {
  healthy: boolean;
  message: string;
  baseUrl?: string;
  endpoint?: string;
  statusCode?: number;
}

export interface MediaProviderAdapter {
  readonly id: string;
  getProviderInfo(): MediaProviderInfo;
  health(credential?: ResolvedMediaCredential): Promise<boolean>;
  diagnoseHealth?(credential?: ResolvedMediaCredential): Promise<MediaProviderHealthResult>;
  listModels(credential?: ResolvedMediaCredential): Promise<MediaModel[]>;
  generateImage(
    request: ImageGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile[]>;
  generateVideo(
    request: VideoGenerationRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile>;
  editImage?(
    request: ImageEditRequest,
    credential?: ResolvedMediaCredential,
    onProgress?: (progress: number) => void
  ): Promise<MediaFile>;
}
