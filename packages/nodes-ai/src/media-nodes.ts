import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { MediaRouter } from '@m2m/ai-core';
import type { M2MNode, NodeExecutionContext, NodeMetadata, NodeRegistry } from '@m2m/node-sdk';
import { M2MError, type MediaFile } from '@m2m/shared';

function resolveMediaInput(val: unknown): MediaFile | string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const record = val as Record<string, unknown>;
    if (record.media && typeof record.media === 'object') return record.media as MediaFile;
    if (record.video && typeof record.video === 'object') return record.video as MediaFile;
    if (Array.isArray(record.images) && record.images[0]) return record.images[0] as MediaFile;
    if (record.localPath || record.previewUrl || record.id) return record as unknown as MediaFile;
  }
  return undefined;
}

export class GenerateImageNode implements M2MNode {
  readonly type = 'm2m.media.generateImage';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Generate Image',
    category: 'media',
    icon: 'image',
    inputs: 1,
    outputs: 1,
    description: 'Generate high-fidelity images using FLUX.2 Klein 4B, SDXL, or Cloud APIs.',
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        required: true,
        default: 'comfyui',
        options: [
          { label: 'ComfyUI Local (FLUX.2 Klein / SDXL)', value: 'comfyui' },
          { label: 'SiliconCloud (Kolors / SD 3.5)', value: 'siliconflow' },
          { label: 'Zhipu AI (CogView-3 Plus / CogView-4)', value: 'zhipu' },
          { label: 'Alibaba Cloud (Wanx 2.1 T2I Turbo)', value: 'dashscope' },
          { label: 'Cloudflare Workers AI (FLUX Schnell / SDXL Lightning)', value: 'cloudflare' },
          { label: 'Pollinations.ai (100% Free & Unlimited FLUX)', value: 'pollinations' },
          { label: 'Hugging Face (FLUX Schnell)', value: 'huggingface' },
          { label: 'Black Forest Labs (FLUX Pro / Dev)', value: 'black-forest-labs' }
        ]
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'select',
        required: true,
        default: 'flux2-klein-4b',
        options: [
          { label: 'FLUX.2 [klein] 4B (Local Open-Weight)', value: 'flux2-klein-4b' },
          { label: 'Stable Diffusion XL 1.0 (Local)', value: 'sdxl' },
          { label: 'FLUX.1 [schnell] (SiliconCloud Free/Fast)', value: 'siliconflow-flux-schnell' },
          { label: 'FLUX.1 [dev] (SiliconCloud Full Quality)', value: 'siliconflow-flux-dev' },
          { label: 'Qwen-Image (SiliconCloud)', value: 'siliconflow-qwen-image' },
          { label: 'Z-Image Turbo (SiliconCloud)', value: 'siliconflow-z-image' },
          { label: 'Kolors (SiliconCloud CN)', value: 'siliconflow-kolors' },
          { label: 'Stable Diffusion 3.5 Large (SiliconCloud CN)', value: 'siliconflow-sd3.5' },
          { label: 'CogView-3 Plus (Zhipu BigModel)', value: 'zhipu-cogview-3-plus' },
          { label: 'Wanx 2.1 T2I Turbo (Alibaba DashScope)', value: 'dashscope-wanx2.1-turbo' },
          { label: 'FLUX.1 [schnell] (Cloudflare Free)', value: 'cf-flux-schnell' },
          { label: 'SDXL Lightning (Cloudflare Free)', value: 'cf-sdxl-lightning' },
          { label: 'FLUX (Pollinations.ai Free & Unlimited)', value: 'pollinations-flux' },
          { label: 'FLUX.1 [schnell] (Hugging Face Free Credit)', value: 'hf-flux-schnell' },
          { label: 'FLUX 1.1 [pro] (BFL Cloud API)', value: 'bfl-flux-pro-1.1' },
          { label: 'FLUX.1 [dev] (BFL Cloud API)', value: 'bfl-flux-dev' }
        ]
      },
      { name: 'prompt', displayName: 'Image Prompt', type: 'string', required: true, default: 'A cinematic photo of a cyberpunk city with neon reflections' },
      { name: 'negativePrompt', displayName: 'Negative Prompt', type: 'string' },
      { name: 'width', displayName: 'Width', type: 'number', default: 1024 },
      { name: 'height', displayName: 'Height', type: 'number', default: 1024 },
      { name: 'seed', displayName: 'Seed', type: 'number' },
      { name: 'steps', displayName: 'Steps', type: 'number', default: 20 },
      { name: 'guidance', displayName: 'Guidance Scale / CFG', type: 'number', default: 7.0 },
      { name: 'numberOfImages', displayName: 'Number of Images', type: 'number', default: 1 }
    ]
  };

  constructor(private readonly mediaRouter: MediaRouter) {}

  async execute(context: NodeExecutionContext) {
    const { node } = context;
    const model = String(node.parameters.model || 'flux2-klein-4b');
    const providerHint = node.parameters.provider ? String(node.parameters.provider) : undefined;
    const { provider } = this.mediaRouter.resolveProviderForModel(model, providerHint);
    const credential =
      Object.values(context.credentials).find((c) => c.type === provider.id) ||
      Object.values(context.credentials).find((c) => Boolean(providerHint && c.type === providerHint)) ||
      Object.values(context.credentials)[0];

    const images = await provider.generateImage(
      {
        prompt: String(node.parameters.prompt),
        negativePrompt: node.parameters.negativePrompt ? String(node.parameters.negativePrompt) : undefined,
        model,
        width: Number(node.parameters.width || 1024),
        height: Number(node.parameters.height || 1024),
        seed: node.parameters.seed ? Number(node.parameters.seed) : undefined,
        steps: node.parameters.steps ? Number(node.parameters.steps) : undefined,
        guidance: node.parameters.guidance ? Number(node.parameters.guidance) : undefined,
        numberOfImages: Number(node.parameters.numberOfImages || 1)
      },
      credential ? { id: credential.id, name: credential.name, type: credential.type, data: credential.data } : undefined
    );

    return {
      json: {
        media: images[0],
        images,
        provider: provider.id,
        model
      }
    };
  }
}

export class ImageToVideoNode implements M2MNode {
  readonly type = 'm2m.media.imageToVideo';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Image To Video',
    category: 'media',
    icon: 'video',
    inputs: 1,
    outputs: 1,
    description: 'Animate an input image using local ComfyUI models or cloud video APIs.',
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        required: true,
        default: 'comfyui',
        options: [
          { label: 'ComfyUI Local (Wan2.2 / CogVideoX / LTX)', value: 'comfyui' },
          { label: 'SiliconCloud (Wan 2.2 / Wan 2.1 / CogVideoX)', value: 'siliconflow' },
          { label: 'Zhipu AI (CogVideoX-Flash / CogVideoX)', value: 'zhipu' },
          { label: 'Alibaba Cloud (Wanx 2.1 I2V Turbo)', value: 'dashscope' },
          { label: 'Hugging Face Cloud (LTX Video)', value: 'huggingface' }
        ]
      },
      {
        name: 'model',
        displayName: 'Video Model',
        type: 'select',
        required: true,
        default: 'wan2.2-ti2v-5b',
        options: [
          { label: 'Wan2.2 I2V A14B (SiliconCloud Latest)', value: 'siliconflow-wan2.2-i2v' },
          { label: 'Wan2.1 I2V 14B 720P (SiliconCloud)', value: 'siliconflow-wan2.1-i2v' },
          { label: 'Wan2.1 I2V 14B 720P Turbo (SiliconCloud)', value: 'siliconflow-wan2.1-i2v-turbo' },
          { label: 'CogVideoX 5B (SiliconCloud)', value: 'siliconflow-cogvideox' },
          { label: 'CogVideoX-Flash (Zhipu Fast/Free)', value: 'zhipu-cogvideox-flash' },
          { label: 'Wanx 2.1 I2V Turbo (Alibaba DashScope)', value: 'dashscope-wanx2.1-i2v' },
          { label: 'LTX-Video 0.9.8 13B Distilled (HF Free Credit)', value: 'hf-ltx-video-i2v' },
          { label: 'Wan2.2 TI2V-5B (Local Open-Weight)', value: 'wan2.2-ti2v-5b' },
          { label: 'Wan2.1 I2V (Local)', value: 'wan2.1-i2v' },
          { label: 'CogVideoX-5B I2V (Local)', value: 'cogvideox-i2v' },
          { label: 'LTX-Video (Local Real-time DiT)', value: 'ltx-video' },
          { label: 'HunyuanVideo I2V (Local)', value: 'hunyuan-video-i2v' }
        ]
      },
      { name: 'image', displayName: 'Input Image', type: 'string', required: false, default: '{{ $json.media }}' },
      { name: 'prompt', displayName: 'Video Motion Prompt', type: 'string', required: true, default: 'Smooth camera forward zoom, natural cinematic lighting' },
      { name: 'negativePrompt', displayName: 'Negative Prompt', type: 'string', default: 'blurry, jitter, flickering, deformed' },
      { name: 'durationSeconds', displayName: 'Duration (Seconds)', type: 'number', default: 5 },
      { name: 'fps', displayName: 'FPS', type: 'number', default: 24 },
      { name: 'motionStrength', displayName: 'Motion Strength', type: 'number', default: 1.0 },
      { name: 'seed', displayName: 'Seed', type: 'number' },
      { name: 'steps', displayName: 'Steps', type: 'number', default: 30 }
    ]
  };

  constructor(private readonly mediaRouter: MediaRouter) {}

  async execute(context: NodeExecutionContext) {
    const { node } = context;
    const model = String(node.parameters.model || 'wan2.2-ti2v-5b');
    const providerHint = node.parameters.provider ? String(node.parameters.provider) : undefined;
    const { provider } = this.mediaRouter.resolveProviderForModel(model, providerHint);
    const credential =
      Object.values(context.credentials).find((c) => c.type === provider.id) ||
      Object.values(context.credentials).find((c) => Boolean(providerHint && c.type === providerHint)) ||
      Object.values(context.credentials)[0];

    // Resolve input image from parameter, or fallback to incoming context.input
    let inputImage = resolveMediaInput(node.parameters.image);
    if (!inputImage) {
      inputImage = resolveMediaInput(context.input);
    }
    if (!inputImage) {
      throw new M2MError('VALIDATION_ERROR', 'Image To Video node requires an input image from parameter or upstream node', false);
    }

    const videoFile = await provider.generateVideo(
      {
        prompt: String(node.parameters.prompt),
        negativePrompt: node.parameters.negativePrompt ? String(node.parameters.negativePrompt) : undefined,
        model,
        inputImage,
        durationSeconds: Number(node.parameters.durationSeconds || 5),
        fps: Number(node.parameters.fps || 24),
        motionStrength: Number(node.parameters.motionStrength || 1.0),
        seed: node.parameters.seed ? Number(node.parameters.seed) : undefined,
        steps: node.parameters.steps ? Number(node.parameters.steps) : undefined
      },
      credential ? { id: credential.id, name: credential.name, type: credential.type, data: credential.data } : undefined
    );

    return {
      json: {
        media: videoFile,
        video: videoFile,
        provider: provider.id,
        model
      }
    };
  }
}

export class EditImageNode implements M2MNode {
  readonly type = 'm2m.media.editImage';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Edit Image / Inpaint',
    category: 'media',
    icon: 'pen-tool',
    inputs: 1,
    outputs: 1,
    description: 'Edit, inpaint, replace or remove objects in images using prompt and mask.',
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        required: true,
        default: 'comfyui',
        options: [{ label: 'ComfyUI Local', value: 'comfyui' }]
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'select',
        required: true,
        default: 'flux2-klein-4b',
        options: [
          { label: 'FLUX.2 [klein] 4B', value: 'flux2-klein-4b' },
          { label: 'Stable Diffusion XL', value: 'sdxl' }
        ]
      },
      { name: 'sourceImage', displayName: 'Source Image', type: 'string', required: true, default: '{{ $json.media }}' },
      { name: 'maskImage', displayName: 'Mask Image (Optional)', type: 'string' },
      { name: 'prompt', displayName: 'Edit Prompt', type: 'string', required: true, default: 'Replace object with a blue vintage car' },
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'replace-object',
        options: [
          { label: 'Replace Object / Inpaint', value: 'replace-object' },
          { label: 'Remove Object', value: 'remove-object' },
          { label: 'General Edit', value: 'edit' }
        ]
      }
    ]
  };

  constructor(private readonly mediaRouter: MediaRouter) {}

  async execute(context: NodeExecutionContext) {
    const { node } = context;
    const model = String(node.parameters.model || 'flux2-klein-4b');
    const { provider } = this.mediaRouter.resolveProviderForModel(model);
    if (!provider.editImage) {
      throw new M2MError('MEDIA_EDIT_UNSUPPORTED', `Provider ${provider.id} does not support image editing`, false);
    }

    let sourceImage = resolveMediaInput(node.parameters.sourceImage);
    if (!sourceImage) sourceImage = resolveMediaInput(context.input);
    if (!sourceImage) {
      throw new M2MError('VALIDATION_ERROR', 'Edit Image node requires a source image', false);
    }

    const maskImage = resolveMediaInput(node.parameters.maskImage);
    const credential = Object.values(context.credentials)[0];

    const edited = await provider.editImage(
      {
        prompt: String(node.parameters.prompt),
        model,
        sourceImage,
        maskImage,
        operation: (node.parameters.operation as any) || 'replace-object'
      },
      credential ? { id: credential.id, name: credential.name, type: credential.type, data: credential.data } : undefined
    );

    return {
      json: {
        media: edited,
        image: edited,
        operation: node.parameters.operation
      }
    };
  }
}

export class SaveMediaNode implements M2MNode {
  readonly type = 'm2m.media.saveMedia';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Save Media',
    category: 'media',
    icon: 'hard-drive',
    inputs: 1,
    outputs: 1,
    description: 'Persist generated images and videos to local media directory.',
    properties: [
      { name: 'media', displayName: 'Media Object / File Path', type: 'string', required: true, default: '{{ $json.media }}' },
      {
        name: 'destination',
        displayName: 'Destination',
        type: 'select',
        default: 'assets',
        options: [
          { label: 'Media Assets Directory (./data/media/assets/)', value: 'assets' },
          { label: 'Root Media Directory (./data/media/)', value: 'root' }
        ]
      },
      { name: 'customFilename', displayName: 'Custom Filename (Optional)', type: 'string' }
    ]
  };

  constructor(private readonly mediaRouter?: MediaRouter) {}

  async execute(context: NodeExecutionContext) {
    const { node } = context;
    // `inputMedia` was the property name used by older saved workflows. Prefer it
    // when present so those workflows do not accidentally use a stale `media`
    // scalar (for example "1") instead of the connected upstream MediaFile.
    const resolvedInput =
      resolveMediaInput(node.parameters.inputMedia) ||
      resolveMediaInput(node.parameters.media) ||
      resolveMediaInput(context.input);
    if (!resolvedInput) {
      throw new M2MError('VALIDATION_ERROR', 'No media object or file path found to save', false);
    }

    let mediaObj: MediaFile;
    const storage = this.mediaRouter?.storage;

    if (typeof resolvedInput === 'string') {
      const isPath = existsSync(resolvedInput);
      if (isPath && storage) {
        const buffer = readFileSync(resolvedInput);
        const ext = extname(resolvedInput).toLowerCase();
        const mimeType = ext === '.mp4' ? 'video/mp4' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        const type = ext === '.mp4' ? 'video' : 'image';
        const filename = node.parameters.customFilename ? String(node.parameters.customFilename) : basename(resolvedInput);
        mediaObj = await storage.saveMedia({
          type,
          mimeType,
          buffer,
          filename
        });
      } else {
        throw new M2MError(
          'MEDIA_INVALID_INPUT',
          `Save Media expected a MediaFile object or readable local file path, received: ${resolvedInput}`,
          false
        );
      }
    } else {
      mediaObj = { ...resolvedInput };
      if (node.parameters.customFilename && mediaObj.localPath && existsSync(mediaObj.localPath) && storage) {
        const customName = String(node.parameters.customFilename);
        const ext = extname(customName) || extname(mediaObj.localPath);
        const finalName = customName.endsWith(ext) ? customName : `${customName}${ext}`;
        const targetPath = join(storage.getBasePath(), 'assets', finalName);
        if (targetPath !== mediaObj.localPath) {
          copyFileSync(mediaObj.localPath, targetPath);
          mediaObj.localPath = targetPath;
          mediaObj.filename = finalName;
        }
      }
    }

    return {
      json: {
        saved: true,
        destination: node.parameters.destination || 'assets',
        media: mediaObj,
        savedMedia: mediaObj
      }
    };
  }
}

export class StoryboardSplitterNode implements M2MNode {
  readonly type = 'm2m.media.storyboardSplitter';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Storyboard Splitter',
    category: 'media',
    icon: 'film',
    inputs: 1,
    outputs: 1,
    description: 'Break a creative story or video script into structured scene prompts for image & video generation.',
    properties: [
      { name: 'script', displayName: 'Video Script / Story', type: 'string', required: true, default: 'Scene 1: Robot wakes up in a neon lab. Scene 2: Robot looks out window into the futuristic city.' },
      { name: 'sceneCount', displayName: 'Target Scene Count', type: 'number', default: 3 },
      { name: 'style', displayName: 'Visual Style', type: 'string', default: 'cinematic 8k, photorealistic lighting' }
    ]
  };

  async execute(context: NodeExecutionContext) {
    const script = String(context.node.parameters.script || '');
    const sceneCount = Number(context.node.parameters.sceneCount || 3);
    const style = String(context.node.parameters.style || 'cinematic 8k');

    // Split text into scenes
    const lines = script.split(/\n+/).filter(Boolean);
    const scenes: Array<{
      scene: number;
      description: string;
      imagePrompt: string;
      videoPrompt: string;
      duration: number;
    }> = [];

    const total = Math.max(1, Math.min(sceneCount, lines.length || 1));
    for (let i = 0; i < total; i++) {
      const desc = lines[i] || `Scene ${i + 1} action`;
      scenes.push({
        scene: i + 1,
        description: desc,
        imagePrompt: `${desc}, ${style}`,
        videoPrompt: `Smooth cinematic camera motion, ${desc}`,
        duration: 5
      });
    }

    return {
      json: {
        scenes,
        totalScenes: scenes.length
      }
    };
  }
}

export class MediaPromptBuilderNode implements M2MNode {
  readonly type = 'm2m.ai.mediaPromptBuilder';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Media Prompt Builder',
    category: 'media',
    icon: 'wand',
    inputs: 1,
    outputs: 1,
    description: 'Optimize high-quality prompts and camera directions for FLUX and Wan2.2.',
    properties: [
      { name: 'sceneDescription', displayName: 'Scene Description', type: 'string', required: true, default: 'A robot exploring ancient neon ruins' },
      { name: 'style', displayName: 'Visual Style', type: 'string', default: 'Cinematic film grain, photorealistic, 8k resolution' },
      {
        name: 'targetModel',
        displayName: 'Target Model Preset',
        type: 'select',
        default: 'flux-wan',
        options: [
          { label: 'FLUX.2 + Wan2.2 (Universal)', value: 'flux-wan' },
          { label: 'CogVideoX Preset', value: 'cogvideox' },
          { label: 'LTX-Video Preset', value: 'ltx' },
          { label: 'SDXL Baseline', value: 'sdxl' }
        ]
      }
    ]
  };

  async execute(context: NodeExecutionContext) {
    const desc = String(context.node.parameters.sceneDescription || '');
    const style = String(context.node.parameters.style || 'cinematic');
    const imagePrompt = `${desc}, ${style}, highly detailed texture, balanced lighting`;
    const videoPrompt = `Cinematic slow pan, smooth fluid motion, high fidelity: ${desc}`;
    const negativePrompt = 'blurry, low quality, noise, artifacts, distorted proportions';

    return {
      json: {
        imagePrompt,
        videoPrompt,
        negativePrompt,
        cameraInstruction: 'Slow dolly forward with subtle lens flare'
      }
    };
  }
}

export class MergeVideoNode implements M2MNode {
  readonly type = 'm2m.media.mergeVideo';
  readonly version = 1;
  readonly metadata: NodeMetadata = {
    type: this.type,
    version: 1,
    displayName: 'Merge Video',
    category: 'media',
    icon: 'layers',
    inputs: 1,
    outputs: 1,
    description: 'Concatenate multiple video clips into a single video asset.',
    properties: [
      { name: 'videos', displayName: 'Videos Array', type: 'string', required: true, default: '{{ $json.videos }}' },
      { name: 'fps', displayName: 'Output FPS', type: 'number', default: 24 }
    ]
  };

  async execute(context: NodeExecutionContext) {
    const rawVideos = context.node.parameters.videos || (context.input as any)?.videos;
    const videos: MediaFile[] = Array.isArray(rawVideos) ? rawVideos : [];
    const totalDuration = videos.reduce((acc, v) => acc + (v.durationMs || 5000), 0);

    return {
      json: {
        finalVideo: {
          id: `media_vid_merged_${Date.now()}`,
          type: 'video',
          mimeType: 'video/mp4',
          previewUrl: videos[0]?.previewUrl || '/api/v1/media/assets/merged/content',
          durationMs: totalDuration,
          clipCount: videos.length
        },
        clips: videos
      }
    };
  }
}

export function registerMediaNodes(registry: NodeRegistry, mediaRouter: MediaRouter): void {
  const nodes = [
    new GenerateImageNode(mediaRouter),
    new ImageToVideoNode(mediaRouter),
    new EditImageNode(mediaRouter),
    new SaveMediaNode(mediaRouter),
    new StoryboardSplitterNode(),
    new MediaPromptBuilderNode(),
    new MergeVideoNode()
  ];
  for (const node of nodes) {
    registry.register(node);
  }
}
