import { isDeepStrictEqual } from 'node:util';
import { M2MError, type WorkflowDefinition, type WorkflowEdge, type WorkflowNode } from '@m2m/shared';
import type {
  AssistantCredentialSummary,
  AssistantNodeType,
  AssistantProviderStatus,
  WorkflowAgentOperation,
  WorkflowAgentPlan
} from './types.js';

const MEDIA_PROVIDER_MODELS: Record<string, Record<string, string[]>> = {
  'm2m.media.generateImage': {
    comfyui: ['flux2-klein-4b', 'sdxl'],
    siliconflow: [
      'siliconflow-flux-schnell',
      'siliconflow-flux-dev',
      'siliconflow-qwen-image',
      'siliconflow-z-image',
      'siliconflow-kolors',
      'siliconflow-sd3.5',
      'siliconflow-sdxl'
    ],
    pollinations: ['pollinations-flux'],
    cloudflare: ['cf-flux-schnell', 'cf-sdxl-lightning'],
    zhipu: ['zhipu-cogview-3-plus', 'zhipu-cogview-4'],
    dashscope: ['dashscope-wanx2.1-turbo'],
    huggingface: ['hf-flux-schnell'],
    'black-forest-labs': ['bfl-flux-pro-1.1', 'bfl-flux-dev']
  },
  'm2m.media.imageToVideo': {
    comfyui: ['wan2.2-ti2v-5b', 'wan2.1-i2v', 'cogvideox-i2v', 'ltx-video', 'hunyuan-video-i2v'],
    siliconflow: [
      'siliconflow-wan2.2-i2v',
      'siliconflow-wan2.1-i2v',
      'siliconflow-wan2.1-i2v-turbo',
      'siliconflow-cogvideox'
    ],
    zhipu: ['zhipu-cogvideox-flash', 'zhipu-cogvideox'],
    dashscope: ['dashscope-wanx2.1-i2v'],
    huggingface: ['hf-ltx-video-i2v']
  },
  'm2m.media.editImage': {
    comfyui: ['flux2-klein-4b', 'sdxl']
  }
};

const REQUIRED_CLOUD_CREDENTIALS = new Set([
  'huggingface',
  'black-forest-labs',
  'siliconflow',
  'zhipu',
  'dashscope',
  'cloudflare',
  'gemini',
  'openai-compatible'
]);

const clone = <T>(value: T): T => structuredClone(value);

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefined(entry)])
    );
  }
  return value;
}

function normalizeAliases(parameters: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...parameters };
  const aliases: Array<[string, string]> = [
    ['image_url', 'image'],
    ['imageUrl', 'image'],
    ['input_image', 'image'],
    ['source_image', 'sourceImage'],
    ['input_media', 'inputMedia'],
    ['media_url', 'inputMedia'],
    ['script_text', 'script'],
    ['system_prompt', 'system'],
    ['model_name', 'model'],
    ['provider_name', 'provider']
  ];
  for (const [alias, canonical] of aliases) {
    if (normalized[canonical] === undefined && normalized[alias] !== undefined) {
      normalized[canonical] = normalized[alias];
    }
    delete normalized[alias];
  }
  return normalized;
}

const AI_PROVIDER_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  ollama: ['llama3.2', 'llama3.3', 'qwen2.5-coder', 'deepseek-r1'],
  'openai-compatible': ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'deepseek-reasoner']
};

function inferMediaProvider(type: string, model: string): string | undefined {
  const providers = MEDIA_PROVIDER_MODELS[type];
  return providers
    ? Object.entries(providers).find(([, models]) => models.includes(model))?.[0]
    : undefined;
}

function alignProviderAndModel(
  type: string,
  parameters: Record<string, unknown>,
  rawParameters: Record<string, unknown>,
  availableCredentials?: AssistantCredentialSummary[],
  providerStatuses?: AssistantProviderStatus[]
): void {
  const isMedia = Boolean(MEDIA_PROVIDER_MODELS[type]);
  const isAI = type.startsWith('ai.') && (
    type === 'ai.prompt' || type === 'ai.agent' || type === 'ai.chatModel' ||
    type === 'ai.structuredOutput' || type === 'ai.textClassification' ||
    type === 'ai.informationExtraction' || type === 'ai.embedding'
  );

  if (!isMedia && !isAI) return;

  const providers = isMedia ? MEDIA_PROVIDER_MODELS[type] : AI_PROVIDER_MODELS;
  const rawProvider = typeof rawParameters.provider === 'string' ? rawParameters.provider : undefined;
  const rawModel = typeof rawParameters.model === 'string' ? rawParameters.model : undefined;
  let provider = typeof parameters.provider === 'string' ? parameters.provider : undefined;
  let model = typeof parameters.model === 'string' ? parameters.model : undefined;

  if (isMedia && !rawProvider && rawModel) provider = inferMediaProvider(type, rawModel) ?? provider;
  if (rawProvider) provider = rawProvider;

  if (!rawProvider) {
    const credTypes = new Set((availableCredentials ?? []).map((c) => c.type));
    const matchedCredProvider = Object.keys(providers).find((p) => credTypes.has(p));
    if (matchedCredProvider) {
      provider = matchedCredProvider;
    } else if (isMedia && (providers as Record<string, string[]>).pollinations) {
      provider = 'pollinations';
    } else if (isAI && (process.env.GEMINI_API_KEY || credTypes.has('gemini'))) {
      provider = 'gemini';
    } else {
      provider = provider || Object.keys(providers)[0];
    }
  }

  if (!provider || !providers[provider]) provider = Object.keys(providers)[0];
  if (!model || !providers[provider].includes(model) || (rawProvider && !rawModel)) {
    model = providers[provider][0];
  }

  parameters.provider = provider;
  parameters.model = model;
}

function defaultParameters(nodeType: AssistantNodeType | undefined): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const property of nodeType?.properties ?? []) {
    if (property.default !== undefined) parameters[property.name] = clone(property.default);
  }
  return parameters;
}

function normalizeNode(
  raw: Partial<WorkflowNode> & Pick<WorkflowNode, 'id' | 'type' | 'name'>,
  index: number,
  catalog: Map<string, AssistantNodeType>,
  existing?: WorkflowNode,
  availableCredentials?: AssistantCredentialSummary[],
  providerStatuses?: AssistantProviderStatus[]
): WorkflowNode {
  const type = String(raw.type || existing?.type || '');
  const metadata = catalog.get(type);
  if (!metadata && !existing) {
    throw new M2MError('AI_STRUCTURED_OUTPUT_ERROR', `Gemini proposed unknown node type '${type}'`, false);
  }

  const rawParameters = normalizeAliases((raw.parameters ?? {}) as Record<string, unknown>);
  const parameters = {
    ...(existing ? {} : defaultParameters(metadata)),
    ...(existing?.parameters ?? {}),
    ...rawParameters
  };
  alignProviderAndModel(type, parameters, rawParameters, availableCredentials, providerStatuses);

  // Auto-fill optimal generation parameters & resilience policies for newly created nodes
  let defaultRetry = raw.retry ?? existing?.retry;
  let defaultTimeoutMs = raw.timeoutMs ?? existing?.timeoutMs;

  if (!existing) {
    // 1. Media Node Family
    if (type === 'm2m.media.generateImage') {
      const nodeNameText = (String(raw.name || '') + ' ' + String(parameters.prompt || '')).toLowerCase();
      const isComposite = /(?:hợp nhất|tổng thể|khung hình tổng thể|composite|scene composition|final composition|masterpiece)/i.test(nodeNameText);
      const isPortrait = !isComposite && /(?:nhân vật|người|cô gái|chàng trai|chân dung|phụ nữ|nam giới|chiến binh|character|portrait|person|girl|boy|woman|man|warrior|face)/i.test(nodeNameText);
      const isLandscape = !isComposite && /(?:cảnh|phong cảnh|bãi biển|thành phố|núi|rừng|không gian|scenery|landscape|background|beach|city|mountain|forest|view|panorama)/i.test(nodeNameText);

      if (!rawParameters.negativePrompt) {
        if (isComposite) {
          parameters.negativePrompt = 'floating objects, cut and paste look, inconsistent lighting, mismatched shadows, duplicate limbs, scale distortion, attribute bleeding, unnatural pose, visual noise, blurry, low quality, bad anatomy, deformed limbs, distorted, watermark, text';
        } else {
          parameters.negativePrompt = 'blurry, low quality, bad anatomy, deformed limbs, distorted, extra fingers, watermark, text, out of frame';
        }
      }
      if (!rawParameters.steps) parameters.steps = 25;
      if (!rawParameters.guidance) parameters.guidance = 7.5;
      if (!rawParameters.numberOfImages) parameters.numberOfImages = 1;

      if (!rawParameters.width || !rawParameters.height) {
        if (isPortrait) {
          parameters.width = rawParameters.width ? Number(rawParameters.width) : 832;
          parameters.height = rawParameters.height ? Number(rawParameters.height) : 1216;
        } else if (isLandscape || isComposite) {
          parameters.width = rawParameters.width ? Number(rawParameters.width) : 1280;
          parameters.height = rawParameters.height ? Number(rawParameters.height) : 720;
        } else {
          parameters.width = rawParameters.width ? Number(rawParameters.width) : 1024;
          parameters.height = rawParameters.height ? Number(rawParameters.height) : 1024;
        }
      }
      if (!defaultTimeoutMs) defaultTimeoutMs = 90_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'm2m.media.imageToVideo') {
      if (!rawParameters.negativePrompt) {
        parameters.negativePrompt = 'blurry, jitter, flickering, deformed, low quality, unstable';
      }
      if (!rawParameters.durationSeconds) parameters.durationSeconds = 5;
      if (!rawParameters.fps) parameters.fps = 24;
      if (!rawParameters.motionStrength) parameters.motionStrength = 1.0;
      if (!rawParameters.steps) parameters.steps = 30;
      if (!rawParameters.image) parameters.image = '{{ $json.media }}';
      if (!defaultTimeoutMs) defaultTimeoutMs = 180_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'm2m.media.editImage') {
      if (!rawParameters.strength) parameters.strength = 0.75;
      if (!rawParameters.image) parameters.image = '{{ $json.media }}';
      if (!rawParameters.prompt) parameters.prompt = 'enhance and refine details';
      if (!defaultTimeoutMs) defaultTimeoutMs = 90_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'm2m.media.storyboardSplitter') {
      if (!rawParameters.targetScenes) parameters.targetScenes = 4;
      if (!rawParameters.targetDuration) parameters.targetDuration = 15;
      if (!rawParameters.script) parameters.script = '{{ $json.text }}';
    } else if (type === 'm2m.media.saveMedia') {
      if (!rawParameters.folder) parameters.folder = 'output';
      if (!rawParameters.format) parameters.format = 'png';
    } else if (type === 'm2m.media.mergeVideo') {
      if (!rawParameters.mode) parameters.mode = 'concat';
      if (!rawParameters.transition) parameters.transition = 'fade';
    }

    // 2. AI Node Family
    else if (type === 'ai.prompt') {
      if (rawParameters.temperature === undefined) parameters.temperature = 0.2;
      if (rawParameters.maxTokens === undefined) parameters.maxTokens = 2048;
      if (!defaultTimeoutMs) defaultTimeoutMs = 60_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'ai.agent') {
      if (rawParameters.temperature === undefined) parameters.temperature = 0.1;
      if (rawParameters.maxTokens === undefined) parameters.maxTokens = 2048;
      if (rawParameters.maxSteps === undefined) parameters.maxSteps = 5;
      if (!rawParameters.system) {
        parameters.system = 'You are an intelligent workflow automation agent. Use tools strategically to fulfill the user request.';
      }
      if (!defaultTimeoutMs) defaultTimeoutMs = 90_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'ai.chatModel') {
      if (rawParameters.temperature === undefined) parameters.temperature = 0.2;
      if (rawParameters.maxTokens === undefined) parameters.maxTokens = 2048;
    } else if (type === 'ai.structuredOutput') {
      if (rawParameters.temperature === undefined) parameters.temperature = 0;
      if (rawParameters.maxTokens === undefined) parameters.maxTokens = 1024;
      if (!rawParameters.schema) {
        parameters.schema = { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] };
      }
      if (!defaultTimeoutMs) defaultTimeoutMs = 60_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'ai.textClassification') {
      if (!rawParameters.labels) parameters.labels = ['positive', 'neutral', 'negative'];
      if (!rawParameters.instructions) parameters.instructions = 'Classify the text into exactly one category with confidence score.';
      if (!defaultTimeoutMs) defaultTimeoutMs = 60_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'ai.informationExtraction') {
      if (!rawParameters.fields) parameters.fields = [{ name: 'summary', type: 'string', description: 'Brief summary' }];
      if (!defaultTimeoutMs) defaultTimeoutMs = 60_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'ai.simpleMemory') {
      if (!rawParameters.sessionKey) parameters.sessionKey = 'default';
      if (!rawParameters.operation) parameters.operation = 'append';
      if (rawParameters.maxMessages === undefined) parameters.maxMessages = 20;
    }

    // 3. Core & Data Transformation Family
    else if (type === 'core.httpRequest') {
      if (!rawParameters.method) parameters.method = 'GET';
      if (!rawParameters.headers) parameters.headers = {};
      if (!rawParameters.timeoutMs) parameters.timeoutMs = 30000;
      if (!defaultTimeoutMs) defaultTimeoutMs = 30_000;
      if (!defaultRetry) defaultRetry = { enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' };
    } else if (type === 'core.if') {
      if (!rawParameters.operator) parameters.operator = 'equals';
    } else if (type === 'core.switch') {
      if (!rawParameters.cases) {
        parameters.cases = [
          { output: 'case1', operator: 'equals', value: 'one' },
          { output: 'case2', operator: 'equals', value: 'two' }
        ];
      }
    } else if (type === 'core.delay') {
      if (rawParameters.durationMs === undefined) parameters.durationMs = 1000;
    } else if (type === 'core.forEach') {
      if (rawParameters.path === undefined) parameters.path = '';
      if (rawParameters.limit === undefined) parameters.limit = 1000;
    } else if (type === 'data.filter') {
      if (!rawParameters.operator) parameters.operator = 'equals';
    } else if (type === 'data.textParser') {
      if (!rawParameters.mode) parameters.mode = 'split';
      if (!rawParameters.pattern) parameters.pattern = ',';
    }
  }

  const oldProvider = String(existing?.parameters?.provider ?? '');
  const newProvider = String(parameters.provider ?? '');
  const providerChanged = Boolean(existing && oldProvider && newProvider && oldProvider !== newProvider);

  return {
    id: String(raw.id || existing?.id),
    type,
    name: String(raw.name || existing?.name || metadata?.displayName || type),
    position: raw.position ?? existing?.position ?? { x: 100 + index * 320, y: 200 },
    parameters,
    credentials: providerChanged ? undefined : existing?.credentials,
    disabled: raw.disabled ?? existing?.disabled,
    retry: defaultRetry,
    timeoutMs: defaultTimeoutMs
  };
}

function normalizeEdge(raw: Partial<WorkflowEdge> & Pick<WorkflowEdge, 'id' | 'source' | 'target'>): WorkflowEdge {
  return {
    id: String(raw.id),
    source: String(raw.source),
    target: String(raw.target),
    sourceHandle: raw.sourceHandle ? String(raw.sourceHandle) : undefined,
    targetHandle: raw.targetHandle ? String(raw.targetHandle) : undefined
  };
}

function describePatch(existing: WorkflowNode, patch: Partial<WorkflowNode>): string {
  const parts: string[] = [];
  if (patch.name && patch.name !== existing.name) {
    parts.push(`Đổi tên thành "${patch.name}"`);
  }
  if (patch.type && patch.type !== existing.type) {
    parts.push(`Đổi loại node thành ${patch.type}`);
  }
  if (patch.parameters) {
    const changedParams = Object.keys(patch.parameters).filter(
      (key) => !isDeepStrictEqual(patch.parameters![key], existing.parameters[key])
    );
    if (changedParams.length > 0) {
      parts.push(`Sửa tham số: ${changedParams.join(', ')}`);
    }
  }
  if (patch.disabled !== undefined && patch.disabled !== existing.disabled) {
    parts.push(patch.disabled ? 'Tắt node' : 'Bật node');
  }
  return parts.length > 0 ? parts.join('; ') : 'Cập nhật cấu hình';
}

function healEdgesAndHandles(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  catalog: Map<string, AssistantNodeType>
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outgoingBySource = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const list = outgoingBySource.get(edge.source) ?? [];
    list.push(edge);
    outgoingBySource.set(edge.source, list);
  }

  for (const [sourceId, outEdges] of outgoingBySource.entries()) {
    const sourceNode = nodeMap.get(sourceId);
    if (!sourceNode) continue;
    const metadata = catalog.get(sourceNode.type);

    if (sourceNode.type === 'core.if') {
      if (outEdges.length === 1 && !outEdges[0].sourceHandle) {
        outEdges[0].sourceHandle = 'true';
      } else if (outEdges.length >= 2) {
        if (!outEdges[0].sourceHandle) outEdges[0].sourceHandle = 'true';
        if (!outEdges[1].sourceHandle || outEdges[1].sourceHandle === outEdges[0].sourceHandle) {
          outEdges[1].sourceHandle = 'false';
        }
      }
    } else if (sourceNode.type === 'core.switch') {
      const allowedCases = ['case1', 'case2', 'case3', 'case4', 'default'];
      outEdges.forEach((edge, idx) => {
        if (!edge.sourceHandle || !allowedCases.includes(edge.sourceHandle)) {
          edge.sourceHandle = allowedCases[idx] || 'default';
        }
      });
    } else if (metadata?.outputNames && metadata.outputNames.length > 0) {
      outEdges.forEach((edge, idx) => {
        if (!edge.sourceHandle || !metadata.outputNames!.includes(edge.sourceHandle)) {
          edge.sourceHandle = metadata.outputNames![idx] || metadata.outputNames![0];
        }
      });
    }
  }
}

function injectDataExpressions(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incomingByTarget = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target, list);
  }

  for (const targetNode of nodes) {
    const inEdges = incomingByTarget.get(targetNode.id);
    if (!inEdges || inEdges.length === 0) continue;
    const firstSource = nodeMap.get(inEdges[0].source);
    if (!firstSource) continue;

    // AI Text producer -> downstream consumers
    if (firstSource.type.startsWith('ai.') && (firstSource.type === 'ai.prompt' || firstSource.type === 'ai.agent')) {
      const isPlaceholderPrompt =
        !targetNode.parameters.prompt ||
        targetNode.parameters.prompt === 'A cinematic photo of a cyberpunk city with neon reflections';
      if (targetNode.type === 'm2m.media.generateImage' && isPlaceholderPrompt) {
        targetNode.parameters.prompt = '{{ $json.text }}';
      } else if (targetNode.type === 'm2m.media.storyboardSplitter' && !targetNode.parameters.script) {
        targetNode.parameters.script = '{{ $json.text }}';
      } else if (targetNode.type === 'ai.textClassification' && !targetNode.parameters.text) {
        targetNode.parameters.text = '{{ $json.text }}';
      } else if (targetNode.type === 'ai.informationExtraction' && !targetNode.parameters.text) {
        targetNode.parameters.text = '{{ $json.text }}';
      }
    }

    // Media producer -> downstream consumers
    if (firstSource.type === 'm2m.media.generateImage') {
      if (targetNode.type === 'm2m.media.imageToVideo' && !targetNode.parameters.image) {
        targetNode.parameters.image = '{{ $json.media }}';
      } else if (targetNode.type === 'm2m.media.editImage' && !targetNode.parameters.image) {
        targetNode.parameters.image = '{{ $json.media }}';
      }
    }
  }
}

function applySugiyamaDAGLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  catalog: Map<string, AssistantNodeType>
): void {
  if (nodes.length <= 1) return;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];

  for (const node of nodes) {
    const isTrigger = catalog.get(node.type)?.category === 'trigger';
    if ((inDegree.get(node.id) ?? 0) === 0 || isTrigger) {
      rank.set(node.id, 0);
      queue.push(node.id);
    }
  }

  if (queue.length === 0 && nodes.length > 0) {
    rank.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currRank = rank.get(currId) ?? 0;
    const neighbors = adj.get(currId) ?? [];

    for (const nextId of neighbors) {
      const nextRank = Math.max(rank.get(nextId) ?? 0, currRank + 1);
      rank.set(nextId, nextRank);
      queue.push(nextId);
    }
  }

  for (const node of nodes) {
    if (!rank.has(node.id)) {
      rank.set(node.id, 1);
    }
  }

  const layers = new Map<number, WorkflowNode[]>();
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0;
    const list = layers.get(r) ?? [];
    list.push(node);
    layers.set(r, list);
  }

  const LAYER_X_GAP = 360;
  const NODE_Y_GAP = 180;
  const BASE_X = 80;
  const CENTER_Y = 320;

  for (const [layerIndex, layerNodes] of layers.entries()) {
    const count = layerNodes.length;
    const totalHeight = (count - 1) * NODE_Y_GAP;
    const startY = CENTER_Y - totalHeight / 2;

    layerNodes.forEach((node, i) => {
      node.position = {
        x: BASE_X + layerIndex * LAYER_X_GAP,
        y: Math.round(startY + i * NODE_Y_GAP)
      };
    });
  }
}

function shouldAutoLayout(nodes: WorkflowNode[]): boolean {
  if (nodes.length <= 1) return false;
  const positions = nodes.map((n) => `${n.position.x},${n.position.y}`);
  const uniquePositions = new Set(positions);
  return uniquePositions.size < nodes.length || nodes.every((n) => n.position.x === 0 && n.position.y === 0);
}

function bindCredentials(
  nodes: WorkflowNode[],
  touchedNodeIds: Set<string>,
  credentials: AssistantCredentialSummary[],
  providerStatuses: AssistantProviderStatus[],
  warnings: string[],
  manualSteps: string[]
): void {
  const credentialsById = new Map(credentials.map((credential) => [credential.id, credential]));
  const statusByProvider = new Map(providerStatuses.map((status) => [status.provider, status]));

  for (const node of nodes) {
    if (!touchedNodeIds.has(node.id)) continue;
    const provider = typeof node.parameters.provider === 'string' ? node.parameters.provider : undefined;
    if (!provider) continue;

    // Free providers like pollinations do not require any credential binding
    if (provider === 'pollinations') {
      node.credentials = undefined;
      continue;
    }

    const boundIds = Object.values(node.credentials ?? {});
    const validBound = boundIds.find((id) => credentialsById.get(id)?.type === provider);
    if (validBound) {
      node.credentials = { primary: validBound };
    } else {
      const matches = credentials.filter((credential) => credential.type === provider);
      if (matches.length > 0) {
        node.credentials = { primary: matches[0].id };
      } else {
        node.credentials = undefined;
        if (REQUIRED_CLOUD_CREDENTIALS.has(provider)) {
          manualSteps.push(`Thêm và chọn credential ${provider} cho node '${node.name}'.`);
        }
      }
    }

    const providerStatus = statusByProvider.get(provider);
    if (providerStatus && !providerStatus.available) {
      warnings.push(`Provider ${provider} của node '${node.name}' hiện không khả dụng${providerStatus.message ? `: ${providerStatus.message}` : '.'}`);
      manualSteps.push(`Khôi phục kết nối ${provider} hoặc đổi provider cho node '${node.name}'.`);
    }
  }
}

function validateReadiness(
  definition: WorkflowDefinition,
  catalog: Map<string, AssistantNodeType>,
  manualSteps: string[]
): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(definition.nodes.map((node) => node.id));
  const triggers = definition.nodes.filter((node) => catalog.get(node.type)?.category === 'trigger');
  if (triggers.length !== 1) errors.push(`Workflow cần đúng một trigger, hiện có ${triggers.length}.`);

  for (const node of definition.nodes) {
    const metadata = catalog.get(node.type);
    if (!metadata) {
      errors.push(`Node '${node.name}' dùng type không tồn tại: ${node.type}.`);
      continue;
    }
    for (const property of (metadata.properties ?? []).filter((item) => item.required)) {
      const value = node.parameters[property.name];
      if (value === undefined || value === null || value === '') {
        errors.push(`Node '${node.name}' thiếu tham số bắt buộc '${property.displayName || property.name}'.`);
      }
    }
    const provider = typeof node.parameters.provider === 'string' ? node.parameters.provider : undefined;
    if (provider && REQUIRED_CLOUD_CREDENTIALS.has(provider) && !Object.keys(node.credentials ?? {}).length) {
      if (!manualSteps.some((step) => step.includes(node.name))) {
        manualSteps.push(`Chọn credential ${provider} cho node '${node.name}'.`);
      }
    }
  }

  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`Kết nối '${edge.id}' trỏ tới node không tồn tại.`);
    }
  }
  return errors;
}

export function applyWorkflowAgentPlan(input: {
  workflow: WorkflowDefinition;
  plan: WorkflowAgentPlan;
  nodeTypes?: AssistantNodeType[];
  availableCredentials?: AssistantCredentialSummary[];
  providerStatuses?: AssistantProviderStatus[];
  allowReplaceWorkflow?: boolean;
}): {
  definition: WorkflowDefinition;
  changes: string[];
  warnings: string[];
  manualSteps: string[];
  canApply: boolean;
  readyToRun: boolean;
} {
  const definition = clone(input.workflow);
  const initialNodesMap = new Map(input.workflow.nodes.map((n) => [n.id, n]));
  const catalog = new Map((input.nodeTypes ?? []).map((nodeType) => [nodeType.type, nodeType]));
  const warnings: string[] = [...(input.plan.assumptions ?? [])];
  const manualSteps: string[] = [...(input.plan.manualSteps ?? [])];
  const changes: string[] = [];
  const touchedNodeIds = new Set<string>();

  for (const operation of input.plan.operations) {
    if (operation.op === 'replaceWorkflow') {
      if (definition.nodes.length > 0 && !input.allowReplaceWorkflow) {
        warnings.push('Đã chặn thao tác thay toàn bộ workflow vì người dùng không yêu cầu xây dựng lại từ đầu.');
        continue;
      }

      const oldNodes = [...definition.nodes];
      const newRawNodes = operation.nodes ?? [];
      const newIds = new Set(newRawNodes.map((n) => n.id));

      // 1. Hiển thị các node sẽ mất đi / bị loại bỏ
      const lostNodes = oldNodes.filter((n) => !newIds.has(n.id));
      for (const lost of lostNodes) {
        changes.push(`[-] Xóa node: "${lost.name}" (${lost.type})`);
      }

      // 2. Chuẩn hóa và gán danh sách nodes mới
      definition.nodes = newRawNodes.map((node, index) => {
        touchedNodeIds.add(node.id);
        return normalizeNode(node as WorkflowNode, index, catalog, undefined, input.availableCredentials, input.providerStatuses);
      });
      definition.edges = (operation.edges ?? []).map((edge) => normalizeEdge(edge as WorkflowEdge));

      // 3. Hiển thị các node được thêm mới hoặc giữ lại
      for (const node of definition.nodes) {
        if (!initialNodesMap.has(node.id)) {
          changes.push(`[+] Thêm node mới: "${node.name}" (${node.type})`);
        } else {
          changes.push(`[~] Cập nhật node: "${node.name}"`);
        }
      }

      // 4. Hiển thị các kết nối mới
      for (const edge of definition.edges) {
        const src = definition.nodes.find((n) => n.id === edge.source);
        const tgt = definition.nodes.find((n) => n.id === edge.target);
        changes.push(`[→] Nối kết nối: "${src?.name || edge.source}" → "${tgt?.name || edge.target}"`);
      }
      continue;
    }

    if (operation.op === 'addNode' && operation.node) {
      if (definition.nodes.some((node) => node.id === operation.node!.id)) {
        warnings.push(`Bỏ qua addNode vì ID '${operation.node.id}' đã tồn tại.`);
        continue;
      }
      const node = normalizeNode(operation.node as WorkflowNode, definition.nodes.length, catalog, undefined, input.availableCredentials, input.providerStatuses);
      definition.nodes.push(node);
      touchedNodeIds.add(node.id);
      changes.push(`[+] Thêm node mới: "${node.name}" (${node.type})`);
      continue;
    }

    if (operation.op === 'updateNode' && operation.nodeId && operation.patch) {
      const index = definition.nodes.findIndex((node) => node.id === operation.nodeId);
      if (index < 0) {
        warnings.push(`Không tìm thấy node '${operation.nodeId}' để cập nhật.`);
        continue;
      }
      const existing = definition.nodes[index];
      const patch = operation.patch as Partial<WorkflowNode>;
      const updated = normalizeNode({
        ...existing,
        ...patch,
        id: existing.id,
        type: patch.type ?? existing.type,
        name: patch.name ?? existing.name,
        parameters: { ...existing.parameters, ...(patch.parameters ?? {}) }
      }, index, catalog, existing, input.availableCredentials, input.providerStatuses);
      if (isDeepStrictEqual(omitUndefined(updated), omitUndefined(existing))) {
        warnings.push(`Bỏ qua cập nhật node '${existing.name}' vì patch không tạo ra thay đổi nào.`);
        continue;
      }
      const patchDetail = describePatch(existing, patch);
      definition.nodes[index] = updated;
      touchedNodeIds.add(existing.id);
      changes.push(`[~] Cập nhật node: "${existing.name}" (${patchDetail})`);
      continue;
    }

    if (operation.op === 'removeNode' && operation.nodeId) {
      const before = definition.nodes.length;
      const targetNode = definition.nodes.find((node) => node.id === operation.nodeId);
      const targetName = targetNode?.name || operation.nodeId;
      const targetType = targetNode?.type ? ` (${targetNode.type})` : '';

      definition.nodes = definition.nodes.filter((node) => node.id !== operation.nodeId);
      definition.edges = definition.edges.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId);
      if (definition.nodes.length === before) {
        warnings.push(`Không tìm thấy node '${operation.nodeId}' để xóa.`);
      } else {
        changes.push(`[-] Xóa node: "${targetName}"${targetType}`);
      }
      continue;
    }

    if (operation.op === 'addEdge' && operation.edge) {
      if (definition.edges.some((edge) => edge.id === operation.edge!.id)) {
        warnings.push(`Bỏ qua addEdge vì ID '${operation.edge.id}' đã tồn tại.`);
        continue;
      }
      const edge = normalizeEdge(operation.edge as WorkflowEdge);
      definition.edges.push(edge);
      const srcNode = definition.nodes.find((n) => n.id === edge.source);
      const tgtNode = definition.nodes.find((n) => n.id === edge.target);
      changes.push(`[→] Nối kết nối: "${srcNode?.name || edge.source}" → "${tgtNode?.name || edge.target}"`);
      continue;
    }

    if (operation.op === 'updateEdge' && operation.edgeId && operation.patch) {
      const index = definition.edges.findIndex((edge) => edge.id === operation.edgeId);
      if (index < 0) {
        warnings.push(`Không tìm thấy kết nối '${operation.edgeId}' để cập nhật.`);
        continue;
      }
      definition.edges[index] = normalizeEdge({
        ...definition.edges[index],
        ...(operation.patch as Partial<WorkflowEdge>),
        id: definition.edges[index].id
      });
      changes.push(`[~] Cập nhật kết nối ${operation.edgeId}`);
      continue;
    }

    if (operation.op === 'removeEdge' && operation.edgeId) {
      const before = definition.edges.length;
      const targetEdge = definition.edges.find((edge) => edge.id === operation.edgeId);
      const srcNode = definition.nodes.find((n) => n.id === targetEdge?.source);
      const tgtNode = definition.nodes.find((n) => n.id === targetEdge?.target);

      definition.edges = definition.edges.filter((edge) => edge.id !== operation.edgeId);
      if (definition.edges.length === before) {
        warnings.push(`Không tìm thấy kết nối '${operation.edgeId}' để xóa.`);
      } else {
        changes.push(`[✕] Xóa kết nối: "${srcNode?.name || targetEdge?.source}" → "${tgtNode?.name || targetEdge?.target}"`);
      }
    }
  }

  const validNodeIds = new Set(definition.nodes.map((node) => node.id));
  definition.edges = definition.edges.filter((edge) => {
    const valid = validNodeIds.has(edge.source) && validNodeIds.has(edge.target);
    if (!valid) warnings.push(`Đã loại kết nối '${edge.id}' vì node nguồn hoặc đích không tồn tại.`);
    return valid;
  });

  // 1. Apply Sugiyama DAG layout if nodes have unassigned or overlapping positions
  if (shouldAutoLayout(definition.nodes)) {
    applySugiyamaDAGLayout(definition.nodes, definition.edges, catalog);
  }

  // 2. Heal broken, mismatched, or missing edge handles (e.g. IF / Switch / multi-output handles)
  healEdgesAndHandles(definition.nodes, definition.edges, catalog);

  // 3. Type-safe dynamic expression injection (e.g. $json.text, $json.media)
  injectDataExpressions(definition.nodes, definition.edges);

  bindCredentials(
    definition.nodes,
    touchedNodeIds,
    input.availableCredentials ?? [],
    input.providerStatuses ?? [],
    warnings,
    manualSteps
  );

  const readinessErrors = validateReadiness(definition, catalog, manualSteps);
  warnings.push(...readinessErrors);
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

  return {
    definition,
    changes: unique(changes),
    warnings: unique(warnings),
    manualSteps: unique(manualSteps),
    canApply: changes.length > 0 && readinessErrors.length === 0,
    readyToRun: readinessErrors.length === 0 && manualSteps.length === 0
  };
}
