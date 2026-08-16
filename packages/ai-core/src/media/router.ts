import { M2MError, type MediaModel } from '@m2m/shared';
import type { MediaProviderAdapter, MediaProviderInfo, ResolvedMediaCredential } from './types.js';
import { MediaModelRegistry, BUILTIN_MEDIA_MODELS } from './models/registry.js';
import { LocalMediaStorage } from './storage/media-storage.js';
import { ComfyUIMediaProvider } from './providers/comfyui/comfyui-provider.js';
import { HuggingFaceMediaProvider } from './providers/huggingface/huggingface-provider.js';
import { BlackForestLabsMediaProvider } from './providers/black-forest-labs/bfl-provider.js';
import { SiliconFlowMediaProvider } from './providers/siliconflow/siliconflow-provider.js';
import { ZhipuMediaProvider } from './providers/zhipu/zhipu-provider.js';
import { DashScopeMediaProvider } from './providers/dashscope/dashscope-provider.js';
import { CloudflareMediaProvider } from './providers/cloudflare/cloudflare-provider.js';
import { PollinationsMediaProvider } from './providers/pollinations/pollinations-provider.js';

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
    this.register(new SiliconFlowMediaProvider(this.storage));
    this.register(new ZhipuMediaProvider(this.storage));
    this.register(new DashScopeMediaProvider(this.storage));
    this.register(new CloudflareMediaProvider(this.storage));
    this.register(new PollinationsMediaProvider(this.storage));
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

  resolveModel(modelId: string, providerHint?: string): { model: MediaModel; provider: MediaProviderAdapter } {
    let model = this.registry.get(modelId);
    if (!model) {
      if (providerHint && this.providers.has(providerHint)) {
        const provider = this.get(providerHint);
        const dynamicModel: MediaModel = {
          id: modelId,
          provider: providerHint,
          displayName: modelId,
          task: 'text-to-image',
          executionMode: provider.getProviderInfo().executionMode,
          costTier: 'free-credit',
          badges: ['FREE CREDIT', 'BYOK'],
          capabilities: { textToImage: true }
        };
        return { model: dynamicModel, provider };
      }

      for (const [pid, provider] of this.providers.entries()) {
        if (modelId.startsWith(`${pid}-`) || modelId.startsWith(`${pid}/`) || modelId.startsWith(pid)) {
          const dynamicModel: MediaModel = {
            id: modelId,
            provider: pid,
            displayName: modelId,
            task: 'text-to-image',
            executionMode: provider.getProviderInfo().executionMode,
            costTier: 'free-credit',
            badges: ['FREE CREDIT', 'BYOK'],
            capabilities: { textToImage: true }
          };
          return { model: dynamicModel, provider };
        }
      }

      throw new M2MError(
        'MEDIA_MODEL_NOT_INSTALLED',
        `Media model '${modelId}' is not registered in m2m model registry`,
        false
      );
    }
    const provider = this.get(model.provider);
    return { model, provider };
  }

  resolveProviderForModel(modelId: string, providerHint?: string): { model: MediaModel; provider: MediaProviderAdapter } {
    return this.resolveModel(modelId, providerHint);
  }
}

export function createDefaultMediaRouter(): MediaRouter {
  return new MediaRouter();
}
