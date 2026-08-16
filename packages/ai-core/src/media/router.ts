import { M2MError, type MediaModel } from '@m2m/shared';
import type { MediaProviderAdapter, MediaProviderInfo, ResolvedMediaCredential } from './types.js';
import { MediaModelRegistry, BUILTIN_MEDIA_MODELS } from './models/registry.js';
import { LocalMediaStorage } from './storage/media-storage.js';
import { ComfyUIMediaProvider } from './providers/comfyui/comfyui-provider.js';
import { HuggingFaceMediaProvider } from './providers/huggingface/huggingface-provider.js';
import { BlackForestLabsMediaProvider } from './providers/black-forest-labs/bfl-provider.js';

export class MediaRouter {
  private readonly providers = new Map<string, MediaProviderAdapter>();
  public readonly registry: MediaModelRegistry;
  public readonly storage: LocalMediaStorage;

  constructor(customStorage?: LocalMediaStorage, customRegistry?: MediaModelRegistry) {
    this.storage = customStorage || new LocalMediaStorage();
    this.registry = customRegistry || new MediaModelRegistry(BUILTIN_MEDIA_MODELS);

    // Register built-in providers
    this.register(new ComfyUIMediaProvider(this.storage));
    this.register(new HuggingFaceMediaProvider(this.storage));
    this.register(new BlackForestLabsMediaProvider(this.storage));
  }

  register(provider: MediaProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): MediaProviderAdapter {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new M2MError(
        'MEDIA_PROVIDER_UNAVAILABLE',
        `Media provider '${providerId}' is not registered or supported`,
        false
      );
    }
    return provider;
  }

  listProviders(): MediaProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.getProviderInfo());
  }

  resolveModel(modelId: string): { model: MediaModel; provider: MediaProviderAdapter } {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new M2MError(
        'MEDIA_MODEL_NOT_INSTALLED',
        `Media model '${modelId}' is not registered in m2m model registry`,
        false
      );
    }
    const provider = this.get(model.provider);
    return { model, provider };
  }

  resolveProviderForModel(modelId: string): { model: MediaModel; provider: MediaProviderAdapter } {
    return this.resolveModel(modelId);
  }
}

export function createDefaultMediaRouter(): MediaRouter {
  return new MediaRouter();
}
