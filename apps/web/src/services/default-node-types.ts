import type { NodeType } from '../types';

export const DEFAULT_NODE_TYPES: NodeType[] = [
  // 1. Triggers
  {
    type: 'trigger.manual',
    version: 1,
    displayName: 'Manual Trigger',
    category: 'trigger',
    icon: 'play',
    inputs: 0,
    outputs: 1,
    description: 'Start execution manually with custom input.',
    properties: []
  },
  {
    type: 'trigger.webhook',
    version: 1,
    displayName: 'Webhook Trigger',
    category: 'trigger',
    icon: 'globe',
    inputs: 0,
    outputs: 1,
    description: 'Trigger workflow via incoming HTTP request.',
    properties: [
      { name: 'path', displayName: 'Webhook Path', type: 'string', required: true, default: 'my-webhook' },
      {
        name: 'method',
        displayName: 'HTTP Method',
        type: 'select',
        required: true,
        default: 'POST',
        options: [
          { label: 'POST', value: 'POST' },
          { label: 'GET', value: 'GET' }
        ]
      }
    ]
  },
  {
    type: 'trigger.schedule',
    version: 1,
    displayName: 'Schedule Trigger',
    category: 'trigger',
    icon: 'clock',
    inputs: 0,
    outputs: 1,
    description: 'Run workflow on a recurring schedule or cron.',
    properties: [
      { name: 'interval', displayName: 'Interval', type: 'number', required: true, default: 1 },
      {
        name: 'unit',
        displayName: 'Unit',
        type: 'select',
        required: true,
        default: 'days',
        options: [
          { label: 'Minutes', value: 'minutes' },
          { label: 'Hours', value: 'hours' },
          { label: 'Days', value: 'days' },
          { label: 'Weeks', value: 'weeks' }
        ]
      },
      { name: 'cron', displayName: 'Cron Expression (Optional)', type: 'string' }
    ]
  },

  // 2. Media Generation (FLUX & Wan)
  {
    type: 'm2m.media.generateImage',
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
          { label: 'FLUX.1 [schnell] (Hugging Face Free Credit)', value: 'hf-flux-schnell' },
          { label: 'FLUX 1.1 [pro] (BFL Cloud API)', value: 'bfl-flux-pro-1.1' },
          { label: 'FLUX.1 [dev] (BFL Cloud API)', value: 'bfl-flux-dev' }
        ]
      },
      { name: 'prompt', displayName: 'Image Prompt', type: 'string', required: true, default: 'A cinematic photo of a futuristic cyberpunk city with neon reflections and volumetric fog' },
      { name: 'negativePrompt', displayName: 'Negative Prompt', type: 'string', default: 'blurry, distorted, low quality' },
      { name: 'width', displayName: 'Width', type: 'number', default: 1024 },
      { name: 'height', displayName: 'Height', type: 'number', default: 1024 },
      { name: 'steps', displayName: 'Steps', type: 'number', default: 4 },
      { name: 'guidance', displayName: 'Guidance Scale / CFG', type: 'number', default: 3.5 },
      { name: 'numberOfImages', displayName: 'Number of Images', type: 'number', default: 1 },
      { name: 'seed', displayName: 'Seed', type: 'number' }
    ]
  },
  {
    type: 'm2m.media.imageToVideo',
    version: 1,
    displayName: 'Image To Video',
    category: 'media',
    icon: 'video',
    inputs: 1,
    outputs: 1,
    description: 'Animate and generate cinematic video from an input image using Wan2.2 TI2V-5B or CogVideoX.',
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        required: true,
        default: 'comfyui',
        options: [
          { label: 'ComfyUI Local (Wan2.2 / CogVideoX / LTX)', value: 'comfyui' }
        ]
      },
      {
        name: 'model',
        displayName: 'Video Model',
        type: 'select',
        required: true,
        default: 'wan2.2-ti2v-5b',
        options: [
          { label: 'Wan2.2 TI2V-5B (Local Open-Weight)', value: 'wan2.2-ti2v-5b' },
          { label: 'Wan2.1 I2V (Local)', value: 'wan2.1-i2v' },
          { label: 'CogVideoX-5B I2V (Local)', value: 'cogvideox-i2v' },
          { label: 'LTX-Video (Local Real-time DiT)', value: 'ltx-video' },
          { label: 'HunyuanVideo I2V (Local)', value: 'hunyuan-video-i2v' }
        ]
      },
      { name: 'image', displayName: 'Input Image', type: 'string', required: false, default: '{{ $json.media }}' },
      { name: 'prompt', displayName: 'Video Motion Prompt', type: 'string', required: true, default: 'Smooth camera forward zoom, dynamic lighting, fluid motion' },
      { name: 'negativePrompt', displayName: 'Negative Prompt', type: 'string', default: 'blurry, jitter, flickering, deformed' },
      { name: 'durationSeconds', displayName: 'Duration (Seconds)', type: 'number', default: 5 },
      { name: 'fps', displayName: 'FPS', type: 'number', default: 24 },
      { name: 'motionStrength', displayName: 'Motion Strength', type: 'number', default: 1.0 },
      { name: 'steps', displayName: 'Steps', type: 'number', default: 30 },
      { name: 'seed', displayName: 'Seed', type: 'number' }
    ]
  },
  {
    type: 'm2m.media.editImage',
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
      { name: 'prompt', displayName: 'Edit Prompt', type: 'string', required: true, default: 'Replace object with a blue vintage sports car' },
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
  },
  {
    type: 'm2m.media.saveMedia',
    version: 1,
    displayName: 'Save Media',
    category: 'media',
    icon: 'hard-drive',
    inputs: 1,
    outputs: 1,
    description: 'Persist generated images and videos to local media directory.',
    properties: [
      { name: 'media', displayName: 'Media Object / ID', type: 'string', required: true, default: '{{ $json.media }}' },
      {
        name: 'destination',
        displayName: 'Destination',
        type: 'select',
        default: 'local-storage',
        options: [{ label: 'Local Storage (./data/media/)', value: 'local-storage' }]
      },
      { name: 'customFilename', displayName: 'Custom Filename (Optional)', type: 'string' }
    ]
  },
  {
    type: 'm2m.media.storyboardSplitter',
    version: 1,
    displayName: 'Storyboard Splitter',
    category: 'media',
    icon: 'film',
    inputs: 1,
    outputs: 1,
    description: 'Break a creative story or video script into structured scene prompts for image & video generation.',
    properties: [
      { name: 'script', displayName: 'Video Script / Story', type: 'string', required: true, default: 'Scene 1: Robot wakes up in a neon lab. Scene 2: Robot looks out window into futuristic city.' },
      { name: 'sceneCount', displayName: 'Target Scene Count', type: 'number', default: 3 },
      { name: 'style', displayName: 'Visual Style', type: 'string', default: 'cinematic 8k, photorealistic lighting' }
    ]
  },
  {
    type: 'm2m.ai.mediaPromptBuilder',
    version: 1,
    displayName: 'Media Prompt Builder',
    category: 'media',
    icon: 'wand',
    inputs: 1,
    outputs: 1,
    description: 'Optimize high-quality prompts and camera directions for FLUX and Wan2.2.',
    properties: [
      { name: 'sceneDescription', displayName: 'Scene Description', type: 'string', required: true, default: 'A sleek cybernetic drone exploring ancient neon ruins' },
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
  },
  {
    type: 'm2m.media.mergeVideo',
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
  },

  // 3. AI & LLM
  {
    type: 'ai.prompt',
    version: 1,
    displayName: 'AI Prompt',
    category: 'ai',
    icon: 'sparkles',
    inputs: 1,
    outputs: 1,
    description: 'Generate text or answers using LLM models.',
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        required: true,
        default: 'ollama',
        options: [
          { label: 'Ollama (local)', value: 'ollama' },
          { label: 'Google Gemini', value: 'gemini' },
          { label: 'OpenAI-compatible', value: 'openai-compatible' }
        ]
      },
      { name: 'model', displayName: 'Model', type: 'string', required: true, default: 'llama3.2' },
      { name: 'system', displayName: 'System Prompt', type: 'string' },
      { name: 'prompt', displayName: 'Prompt', type: 'string', required: true, default: 'Hãy viết một đoạn kịch bản ngắn' },
      { name: 'temperature', displayName: 'Temperature', type: 'number', default: 0.2 },
      { name: 'maxTokens', displayName: 'Max Tokens', type: 'number', default: 1024 }
    ]
  },
  {
    type: 'ai.agent',
    version: 1,
    displayName: 'AI Agent',
    category: 'ai',
    icon: 'bot',
    inputs: 1,
    outputs: 1,
    description: 'Autonomous multi-step reasoning agent with tools.',
    properties: [
      { name: 'prompt', displayName: 'Agent Goal Prompt', type: 'string', required: true }
    ]
  },
  {
    type: 'ai.chatModel',
    version: 1,
    displayName: 'Chat Model',
    category: 'ai',
    icon: 'message-circle',
    inputs: 1,
    outputs: 1,
    description: 'Provide reusable model config to AI agents.',
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        required: true,
        default: 'gemini',
        options: [
          { label: 'Google Gemini', value: 'gemini' },
          { label: 'Ollama (local)', value: 'ollama' },
          { label: 'OpenAI-compatible', value: 'openai-compatible' }
        ]
      },
      { name: 'model', displayName: 'Model', type: 'string', required: true, default: 'gemini-2.0-flash' },
      { name: 'temperature', displayName: 'Temperature', type: 'number', default: 0.2 },
      { name: 'maxTokens', displayName: 'Max Tokens', type: 'number', default: 2048 }
    ]
  },
  {
    type: 'ai.structuredOutput',
    version: 1,
    displayName: 'Structured Output',
    category: 'ai',
    icon: 'braces',
    inputs: 1,
    outputs: 1,
    description: 'Enforce strict JSON schema on LLM generation.',
    properties: [
      { name: 'prompt', displayName: 'Prompt', type: 'string', required: true },
      { name: 'schema', displayName: 'JSON Schema', type: 'json', required: true }
    ]
  },
  {
    type: 'ai.textClassification',
    version: 1,
    displayName: 'Text Classification',
    category: 'ai',
    icon: 'tag',
    inputs: 1,
    outputs: 1,
    description: 'Categorize text into predefined labels.',
    properties: [
      { name: 'text', displayName: 'Text', type: 'string', required: true },
      { name: 'labels', displayName: 'Labels', type: 'json', required: true, default: ['positive', 'neutral', 'negative'] }
    ]
  },
  {
    type: 'ai.informationExtraction',
    version: 1,
    displayName: 'Information Extraction',
    category: 'ai',
    icon: 'scan-text',
    inputs: 1,
    outputs: 1,
    description: 'Extract structured entity fields from text.',
    properties: [
      { name: 'text', displayName: 'Source text', type: 'string', required: true },
      { name: 'fields', displayName: 'Fields', type: 'json', required: true }
    ]
  },
  {
    type: 'ai.embedding',
    version: 1,
    displayName: 'Text Embedding',
    category: 'ai',
    icon: 'binary',
    inputs: 1,
    outputs: 1,
    description: 'Convert text into vector representations.',
    properties: [
      { name: 'text', displayName: 'Text', type: 'string', required: true },
      { name: 'model', displayName: 'Embedding Model', type: 'string', default: 'nomic-embed-text' }
    ]
  },
  {
    type: 'ai.simpleMemory',
    version: 1,
    displayName: 'Simple Memory',
    category: 'ai',
    icon: 'database',
    inputs: 1,
    outputs: 1,
    description: 'Store and retrieve cross-execution state.',
    properties: [
      { name: 'sessionKey', displayName: 'Session Key', type: 'string', required: true, default: 'default' },
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'append',
        options: [
          { label: 'Append', value: 'append' },
          { label: 'Get', value: 'get' },
          { label: 'Set', value: 'set' },
          { label: 'Clear', value: 'clear' }
        ]
      }
    ]
  },

  // 4. Core Logic & Actions
  {
    type: 'core.setData',
    version: 1,
    displayName: 'Set Data',
    category: 'core',
    icon: 'database',
    inputs: 1,
    outputs: 1,
    description: 'Set or modify variables and payload.',
    properties: [
      { name: 'data', displayName: 'Data Object', type: 'json', required: true, default: { key: 'value' } }
    ]
  },
  {
    type: 'core.if',
    version: 1,
    displayName: 'IF Condition',
    category: 'core',
    icon: 'git-branch',
    inputs: 1,
    outputs: 2,
    description: 'Route execution based on condition.',
    properties: [
      { name: 'field', displayName: 'Field to evaluate', type: 'string', required: true, default: '{{ $json.status }}' },
      {
        name: 'operator',
        displayName: 'Operator',
        type: 'select',
        required: true,
        default: 'equals',
        options: [
          { label: 'Equals', value: 'equals' },
          { label: 'Not Equals', value: 'notEquals' },
          { label: 'Contains', value: 'contains' },
          { label: 'Greater Than', value: 'greaterThan' },
          { label: 'Less Than', value: 'lessThan' }
        ]
      },
      { name: 'value', displayName: 'Compare Value', type: 'string', required: true, default: 'success' }
    ]
  },
  {
    type: 'core.httpRequest',
    version: 1,
    displayName: 'HTTP Request',
    category: 'core',
    icon: 'send',
    inputs: 1,
    outputs: 1,
    description: 'Call external REST APIs with custom headers & auth.',
    properties: [
      { name: 'url', displayName: 'URL', type: 'string', required: true, default: 'https://api.example.com/data' },
      {
        name: 'method',
        displayName: 'Method',
        type: 'select',
        required: true,
        default: 'GET',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'DELETE', value: 'DELETE' },
          { label: 'PATCH', value: 'PATCH' }
        ]
      },
      { name: 'headers', displayName: 'Headers', type: 'json' },
      { name: 'body', displayName: 'Body', type: 'json' }
    ]
  },
  {
    type: 'core.code',
    version: 1,
    displayName: 'JavaScript Code',
    category: 'core',
    icon: 'code',
    inputs: 1,
    outputs: 1,
    description: 'Execute custom JavaScript code transformations.',
    properties: [
      { name: 'code', displayName: 'JavaScript Code', type: 'string', required: true, default: 'return $input.all().map(item => ({ json: item.json }));' }
    ]
  },
  {
    type: 'core.switch',
    version: 1,
    displayName: 'Switch Router',
    category: 'core',
    icon: 'shuffle',
    inputs: 1,
    outputs: 4,
    description: 'Route to multiple branches based on value.',
    properties: [
      { name: 'rules', displayName: 'Routing Rules', type: 'json', default: [] }
    ]
  },
  {
    type: 'core.loop',
    version: 1,
    displayName: 'Loop',
    category: 'core',
    icon: 'repeat',
    inputs: 1,
    outputs: 1,
    description: 'Iterate over array items sequentially.',
    properties: [
      { name: 'arrayField', displayName: 'Array Field', type: 'string', required: true, default: 'items' },
      { name: 'batchSize', displayName: 'Batch Size', type: 'number', default: 1 }
    ]
  },
  {
    type: 'core.delay',
    version: 1,
    displayName: 'Delay Pause',
    category: 'core',
    icon: 'pause',
    inputs: 1,
    outputs: 1,
    description: 'Pause workflow execution for a duration.',
    properties: [
      { name: 'durationSeconds', displayName: 'Duration (Seconds)', type: 'number', required: true, default: 5 }
    ]
  },
  {
    type: 'core.respondWebhook',
    version: 1,
    displayName: 'Respond Webhook',
    category: 'core',
    icon: 'corner-down-left',
    inputs: 1,
    outputs: 1,
    description: 'Send custom HTTP response back to caller.',
    properties: [
      { name: 'statusCode', displayName: 'Status Code', type: 'number', default: 200 },
      { name: 'body', displayName: 'Response Body', type: 'json', default: { success: true } }
    ]
  }
];
