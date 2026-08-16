import type { MediaModel, MediaTask } from '@m2m/shared';

export const BUILTIN_MEDIA_MODELS: MediaModel[] = [
  // Local Image Models (ComfyUI)
  {
    id: 'flux2-klein-4b',
    provider: 'comfyui',
    displayName: 'FLUX.2 [klein] 4B',
    task: 'text-to-image',
    tasks: ['text-to-image', 'image-to-image', 'image-edit', 'inpainting'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Fast, high-fidelity open-weight 4B image generation model from Black Forest Labs.',
    license: {
      name: 'Apache 2.0',
      url: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://docs.bfl.ai/flux_2',
    capabilities: {
      textToImage: true,
      imageToImage: true,
      imageEdit: true,
      inpainting: true,
      negativePrompt: false,
      seed: true,
      steps: true,
      guidance: true,
      customResolution: true,
      aspectRatio: true,
      minWidth: 512,
      maxWidth: 2048,
      minHeight: 512,
      maxHeight: 2048
    }
  },
  {
    id: 'sdxl',
    provider: 'comfyui',
    displayName: 'Stable Diffusion XL (SDXL 1.0)',
    task: 'text-to-image',
    tasks: ['text-to-image', 'image-to-image', 'image-edit', 'inpainting'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Battle-tested local image generator with wide checkpoint & LoRA ecosystem.',
    license: {
      name: 'CreativeML Open RAIL++-M',
      url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://github.com/Stability-AI/generative-models',
    capabilities: {
      textToImage: true,
      imageToImage: true,
      imageEdit: true,
      inpainting: true,
      negativePrompt: true,
      seed: true,
      steps: true,
      guidance: true,
      customResolution: true,
      aspectRatio: true,
      minWidth: 512,
      maxWidth: 1536,
      minHeight: 512,
      maxHeight: 1536
    }
  },

  // Local Video Models (ComfyUI)
  {
    id: 'wan2.2-ti2v-5b',
    provider: 'comfyui',
    displayName: 'Wan2.2 TI2V-5B',
    task: 'image-to-video',
    tasks: ['image-to-video', 'text-to-video'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'State-of-the-art open video foundation model with exceptional motion consistency.',
    license: {
      name: 'Apache 2.0',
      url: 'https://github.com/Wan-Video/Wan2.2',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://github.com/Wan-Video/Wan2.2',
    capabilities: {
      imageToVideo: true,
      textToVideo: true,
      negativePrompt: true,
      seed: true,
      steps: true,
      guidance: true,
      duration: true,
      fps: true,
      motionStrength: true,
      minDurationSeconds: 2,
      maxDurationSeconds: 10,
      customResolution: true,
      aspectRatio: true,
      minWidth: 480,
      maxWidth: 1280,
      minHeight: 480,
      maxHeight: 1280
    }
  },
  {
    id: 'wan2.1-i2v',
    provider: 'comfyui',
    displayName: 'Wan2.1 I2V 14B / 1.3B',
    task: 'image-to-video',
    tasks: ['image-to-video'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Robust open-source image-to-video model for cinematic camera and object motions.',
    license: {
      name: 'Apache 2.0',
      url: 'https://github.com/Wan-Video/Wan2.1',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://github.com/Wan-Video/Wan2.1',
    capabilities: {
      imageToVideo: true,
      seed: true,
      steps: true,
      guidance: true,
      duration: true,
      fps: true,
      motionStrength: true
    }
  },
  {
    id: 'cogvideox-i2v',
    provider: 'comfyui',
    displayName: 'CogVideoX-5B I2V',
    task: 'image-to-video',
    tasks: ['image-to-video', 'text-to-video'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'High-density 3D VAE video generation model from THUDM / Zhipu AI.',
    license: {
      name: 'CogVideoX License',
      url: 'https://github.com/zai-org/CogVideo',
      commercialUse: 'restricted'
    },
    documentationUrl: 'https://github.com/zai-org/CogVideo',
    capabilities: {
      imageToVideo: true,
      textToVideo: true,
      seed: true,
      steps: true,
      guidance: true,
      duration: true,
      fps: true
    }
  },
  {
    id: 'ltx-video',
    provider: 'comfyui',
    displayName: 'LTX-Video 0.9.5',
    task: 'image-to-video',
    tasks: ['image-to-video', 'text-to-video'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Ultra-fast real-time DiT video architecture by Lightricks.',
    license: {
      name: 'OpenRAIL License',
      url: 'https://github.com/Lightricks/LTX-Video',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://github.com/Lightricks/LTX-Video',
    capabilities: {
      imageToVideo: true,
      textToVideo: true,
      seed: true,
      steps: true,
      guidance: true,
      duration: true,
      fps: true
    }
  },
  {
    id: 'hunyuan-video-i2v',
    provider: 'comfyui',
    displayName: 'HunyuanVideo I2V',
    task: 'image-to-video',
    tasks: ['image-to-video'],
    executionMode: 'local',
    costTier: 'local-free',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Tencent Hunyuan 13B multimodal video generator for high-res video.',
    license: {
      name: 'Tencent Hunyuan Community License',
      url: 'https://github.com/Tencent-Hunyuan/HunyuanVideo',
      commercialUse: 'restricted'
    },
    documentationUrl: 'https://github.com/Tencent-Hunyuan/HunyuanVideo',
    capabilities: {
      imageToVideo: true,
      seed: true,
      steps: true,
      guidance: true,
      duration: true,
      fps: true
    }
  },

  // Hosted / Cloud Models
  {
    id: 'hf-flux-schnell',
    provider: 'huggingface',
    displayName: 'FLUX.1 [schnell] (Hugging Face)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Hosted 4-step distilled FLUX model on Hugging Face Inference Providers with monthly free credits.',
    license: {
      name: 'Apache 2.0',
      url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://huggingface.co/docs/inference-providers/pricing',
    capabilities: {
      textToImage: true,
      seed: true,
      steps: true,
      guidance: true,
      customResolution: true
    }
  },
  {
    id: 'hf-ltx-video-i2v',
    provider: 'huggingface',
    displayName: 'LTX-Video 0.9.8 13B Distilled (Hugging Face Cloud)',
    task: 'image-to-video',
    tasks: ['image-to-video'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Cloud image-to-video through Hugging Face Inference Providers and fal.ai; optimized for machines without a discrete GPU.',
    documentationUrl: 'https://huggingface.co/Lightricks/LTX-Video-0.9.8-13B-distilled',
    capabilities: {
      imageToVideo: true,
      negativePrompt: true,
      seed: true,
      steps: true,
      duration: true,
      fps: true,
      aspectRatio: true,
      minDurationSeconds: 1,
      maxDurationSeconds: 10
    }
  },
  {
    id: 'bfl-flux-pro-1.1',
    provider: 'black-forest-labs',
    displayName: 'FLUX 1.1 [pro] (BFL Cloud API)',
    task: 'text-to-image',
    tasks: ['text-to-image', 'image-to-image'],
    executionMode: 'cloud',
    costTier: 'paid',
    badges: ['PAID', 'BYOK'],
    description: 'Official enterprise flagship image generation API directly from Black Forest Labs.',
    license: {
      name: 'Commercial API Terms',
      url: 'https://bfl.ml/terms',
      commercialUse: 'allowed'
    },
    documentationUrl: 'https://docs.bfl.ai/',
    capabilities: {
      textToImage: true,
      imageToImage: true,
      seed: true,
      guidance: true,
      aspectRatio: true,
      customResolution: true
    }
  },
  {
    id: 'bfl-flux-dev',
    provider: 'black-forest-labs',
    displayName: 'FLUX.1 [dev] (BFL Cloud API)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'paid',
    badges: ['PAID', 'BYOK'],
    description: 'Guidance-distilled 12B parameter model for non-commercial and commercial evaluation via API.',
    license: {
      name: 'FLUX.1-dev Non-Commercial / API terms',
      url: 'https://bfl.ml/terms',
      commercialUse: 'restricted'
    },
    documentationUrl: 'https://docs.bfl.ai/',
    capabilities: {
      textToImage: true,
      seed: true,
      guidance: true,
      aspectRatio: true
    }
  },

  // SiliconFlow (SiliconCloud) Models
  {
    id: 'siliconflow-flux-schnell',
    provider: 'siliconflow',
    displayName: 'FLUX.1 [schnell] (SiliconCloud)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'High-speed state-of-the-art 12B rectified flow transformer model from Black Forest Labs.',
    capabilities: { textToImage: true, seed: true, steps: true }
  },
  {
    id: 'siliconflow-flux-dev',
    provider: 'siliconflow',
    displayName: 'FLUX.1 [dev] (SiliconCloud)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Full-fidelity 12B parameter open-weight guidance-distilled model from Black Forest Labs.',
    capabilities: { textToImage: true, seed: true, steps: true, guidance: true }
  },
  {
    id: 'siliconflow-qwen-image',
    provider: 'siliconflow',
    displayName: 'Qwen-Image (SiliconCloud)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Alibaba high-resolution text-to-image foundation model.',
    capabilities: { textToImage: true, negativePrompt: true, seed: true, steps: true, guidance: true }
  },
  {
    id: 'siliconflow-z-image',
    provider: 'siliconflow',
    displayName: 'Z-Image Turbo (SiliconCloud)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Tongyi ultra-fast image generation model.',
    capabilities: { textToImage: true, negativePrompt: true, seed: true }
  },
  {
    id: 'siliconflow-kolors',
    provider: 'siliconflow',
    displayName: 'Kolors (Kwai Text-to-Image)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'High-quality photorealistic diffusion model with superior East Asian rendering.',
    capabilities: { textToImage: true, negativePrompt: true, seed: true, steps: true, guidance: true }
  },
  {
    id: 'siliconflow-sd3.5',
    provider: 'siliconflow',
    displayName: 'Stable Diffusion 3.5 Large',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Flagship open-weight 8B image generation model by Stability AI.',
    capabilities: { textToImage: true, negativePrompt: true, seed: true, steps: true, guidance: true }
  },
  {
    id: 'siliconflow-wan2.2-i2v',
    provider: 'siliconflow',
    displayName: 'Wan2.2 Image-to-Video A14B (SiliconCloud)',
    task: 'image-to-video',
    tasks: ['image-to-video'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Latest Wan2.2 state-of-the-art image-to-video foundation model on SiliconFlow.',
    capabilities: { imageToVideo: true, seed: true }
  },
  {
    id: 'siliconflow-wan2.1-i2v',
    provider: 'siliconflow',
    displayName: 'Wan2.1 Image-to-Video 14B (720P)',
    task: 'image-to-video',
    tasks: ['image-to-video'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Alibaba open-source video foundation model with cinematic motion.',
    capabilities: { imageToVideo: true, seed: true }
  },
  {
    id: 'siliconflow-cogvideox',
    provider: 'siliconflow',
    displayName: 'CogVideoX 5B',
    task: 'text-to-video',
    tasks: ['text-to-video', 'image-to-video'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'High-coherence video generation model by Zhipu AI / THUDM.',
    capabilities: { textToVideo: true, imageToVideo: true, seed: true }
  },

  // Zhipu AI Models
  {
    id: 'zhipu-cogview-3-plus',
    provider: 'zhipu',
    displayName: 'CogView-3 Plus',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Zhipu BigModel text-to-image model with high text-image semantic alignment.',
    capabilities: { textToImage: true }
  },
  {
    id: 'zhipu-cogvideox-flash',
    provider: 'zhipu',
    displayName: 'CogVideoX-Flash (Free/Fast Video)',
    task: 'image-to-video',
    tasks: ['image-to-video', 'text-to-video'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Fast and cost-effective video generation on Zhipu AI platform.',
    capabilities: { imageToVideo: true, textToVideo: true }
  },

  // Alibaba Cloud DashScope Wanx Models
  {
    id: 'dashscope-wanx2.1-turbo',
    provider: 'dashscope',
    displayName: 'Wanx 2.1 T2I Turbo',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Alibaba Tongyi Wanxiang high-speed photorealistic image generation.',
    capabilities: { textToImage: true, negativePrompt: true, seed: true }
  },
  {
    id: 'dashscope-wanx2.1-i2v',
    provider: 'dashscope',
    displayName: 'Wanx 2.1 I2V Turbo',
    task: 'image-to-video',
    tasks: ['image-to-video'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Alibaba Tongyi Wanxiang Image-to-Video generation.',
    capabilities: { imageToVideo: true }
  },

  // Cloudflare Workers AI Models
  {
    id: 'cf-flux-schnell',
    provider: 'cloudflare',
    displayName: 'FLUX.1 [schnell] (Cloudflare 10k Neurons Free)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Ultra-fast FLUX inference using Cloudflare Workers AI free daily quota.',
    capabilities: { textToImage: true, steps: true }
  },
  {
    id: 'cf-sdxl-lightning',
    provider: 'cloudflare',
    displayName: 'SDXL Lightning (Cloudflare Free)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Sub-second image generation powered by ByteDance SDXL-Lightning on Cloudflare.',
    capabilities: { textToImage: true, steps: true }
  },

  // Pollinations.ai Models
  {
    id: 'pollinations-flux',
    provider: 'pollinations',
    displayName: 'FLUX (Pollinations.ai Free & Unlimited)',
    task: 'text-to-image',
    tasks: ['text-to-image'],
    executionMode: 'cloud',
    costTier: 'free-credit',
    badges: ['FREE CREDIT'],
    description: 'Instant free unlimited FLUX generation without API key.',
    capabilities: { textToImage: true, seed: true }
  }
];

export class MediaModelRegistry {
  private readonly models = new Map<string, MediaModel>();

  constructor(initialModels: MediaModel[] = BUILTIN_MEDIA_MODELS) {
    for (const model of initialModels) {
      this.models.set(model.id, model);
    }
  }

  register(model: MediaModel): void {
    this.models.set(model.id, model);
  }

  get(id: string): MediaModel | undefined {
    return this.models.get(id);
  }

  getAll(): MediaModel[] {
    return Array.from(this.models.values());
  }

  findByTask(task: MediaTask): MediaModel[] {
    return this.getAll().filter(
      (model) => model.task === task || (model.tasks && model.tasks.includes(task))
    );
  }

  findByProvider(provider: string): MediaModel[] {
    return this.getAll().filter((model) => model.provider === provider);
  }

  filter(criteria: { task?: MediaTask; provider?: string; executionMode?: 'local' | 'cloud' }): MediaModel[] {
    return this.getAll().filter((model) => {
      if (criteria.task) {
        const matchesTask = model.task === criteria.task || (model.tasks && model.tasks.includes(criteria.task));
        if (!matchesTask) return false;
      }
      if (criteria.provider && model.provider !== criteria.provider) {
        return false;
      }
      if (criteria.executionMode && model.executionMode !== criteria.executionMode) {
        return false;
      }
      return true;
    });
  }
}
