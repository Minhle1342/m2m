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
    huggingface: ['hf-flux-schnell'],
    'black-forest-labs': ['bfl-flux-pro-1.1', 'bfl-flux-dev']
  },
  'm2m.media.imageToVideo': {
    comfyui: ['wan2.2-ti2v-5b', 'wan2.1-i2v', 'cogvideox-i2v', 'ltx-video', 'hunyuan-video-i2v'],
    huggingface: ['hf-ltx-video-i2v']
  }
};

const REQUIRED_CLOUD_CREDENTIALS = new Set(['huggingface', 'black-forest-labs', 'gemini', 'openai-compatible']);

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

function inferMediaProvider(type: string, model: string): string | undefined {
  const providers = MEDIA_PROVIDER_MODELS[type];
  return providers
    ? Object.entries(providers).find(([, models]) => models.includes(model))?.[0]
    : undefined;
}

function alignProviderAndModel(
  type: string,
  parameters: Record<string, unknown>,
  rawParameters: Record<string, unknown>
): void {
  const providers = MEDIA_PROVIDER_MODELS[type];
  if (!providers) return;

  const rawProvider = typeof rawParameters.provider === 'string' ? rawParameters.provider : undefined;
  const rawModel = typeof rawParameters.model === 'string' ? rawParameters.model : undefined;
  let provider = typeof parameters.provider === 'string' ? parameters.provider : undefined;
  let model = typeof parameters.model === 'string' ? parameters.model : undefined;

  if (!rawProvider && rawModel) provider = inferMediaProvider(type, rawModel) ?? provider;
  if (rawProvider) provider = rawProvider;
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
  existing?: WorkflowNode
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
  alignProviderAndModel(type, parameters, rawParameters);

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
    retry: raw.retry ?? existing?.retry,
    timeoutMs: raw.timeoutMs ?? existing?.timeoutMs
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

function describeOperation(operation: WorkflowAgentOperation): string {
  if (operation.op === 'addNode') return `Thêm node ${operation.node?.name || operation.node?.id}`;
  if (operation.op === 'updateNode') return `Cập nhật node ${operation.nodeId}`;
  if (operation.op === 'removeNode') return `Xóa node ${operation.nodeId}`;
  if (operation.op === 'addEdge') return `Nối ${operation.edge?.source} → ${operation.edge?.target}`;
  if (operation.op === 'updateEdge') return `Cập nhật kết nối ${operation.edgeId}`;
  if (operation.op === 'removeEdge') return `Xóa kết nối ${operation.edgeId}`;
  return 'Xây dựng lại workflow theo yêu cầu';
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

    const boundIds = Object.values(node.credentials ?? {});
    const validBound = boundIds.find((id) => credentialsById.get(id)?.type === provider);
    if (validBound) {
      node.credentials = { primary: validBound };
    } else {
      const matches = credentials.filter((credential) => credential.type === provider);
      if (matches.length === 1) {
        node.credentials = { primary: matches[0].id };
      } else {
        node.credentials = undefined;
        if (matches.length > 1) {
          manualSteps.push(`Chọn một credential ${provider} cho node '${node.name}'.`);
        } else if (REQUIRED_CLOUD_CREDENTIALS.has(provider)) {
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
  const catalog = new Map((input.nodeTypes ?? []).map((nodeType) => [nodeType.type, nodeType]));
  const warnings: string[] = [...input.plan.assumptions];
  const manualSteps: string[] = [...input.plan.manualSteps];
  const changes: string[] = [];
  const touchedNodeIds = new Set<string>();

  for (const operation of input.plan.operations) {
    if (operation.op === 'replaceWorkflow') {
      if (definition.nodes.length > 0 && !input.allowReplaceWorkflow) {
        warnings.push('Đã chặn thao tác thay toàn bộ workflow vì người dùng không yêu cầu xây dựng lại từ đầu.');
        continue;
      }
      definition.nodes = (operation.nodes ?? []).map((node, index) => {
        touchedNodeIds.add(node.id);
        return normalizeNode(node as WorkflowNode, index, catalog);
      });
      definition.edges = (operation.edges ?? []).map((edge) => normalizeEdge(edge as WorkflowEdge));
      changes.push(describeOperation(operation));
      continue;
    }

    if (operation.op === 'addNode' && operation.node) {
      if (definition.nodes.some((node) => node.id === operation.node!.id)) {
        warnings.push(`Bỏ qua addNode vì ID '${operation.node.id}' đã tồn tại.`);
        continue;
      }
      const node = normalizeNode(operation.node as WorkflowNode, definition.nodes.length, catalog);
      definition.nodes.push(node);
      touchedNodeIds.add(node.id);
      changes.push(describeOperation(operation));
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
      }, index, catalog, existing);
      if (isDeepStrictEqual(omitUndefined(updated), omitUndefined(existing))) {
        warnings.push(`Bỏ qua cập nhật node '${existing.name}' vì patch không tạo ra thay đổi nào.`);
        continue;
      }
      definition.nodes[index] = updated;
      touchedNodeIds.add(existing.id);
      changes.push(describeOperation(operation));
      continue;
    }

    if (operation.op === 'removeNode' && operation.nodeId) {
      const before = definition.nodes.length;
      definition.nodes = definition.nodes.filter((node) => node.id !== operation.nodeId);
      definition.edges = definition.edges.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId);
      if (definition.nodes.length === before) warnings.push(`Không tìm thấy node '${operation.nodeId}' để xóa.`);
      else changes.push(describeOperation(operation));
      continue;
    }

    if (operation.op === 'addEdge' && operation.edge) {
      if (definition.edges.some((edge) => edge.id === operation.edge!.id)) {
        warnings.push(`Bỏ qua addEdge vì ID '${operation.edge.id}' đã tồn tại.`);
        continue;
      }
      definition.edges.push(normalizeEdge(operation.edge as WorkflowEdge));
      changes.push(describeOperation(operation));
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
      changes.push(describeOperation(operation));
      continue;
    }

    if (operation.op === 'removeEdge' && operation.edgeId) {
      const before = definition.edges.length;
      definition.edges = definition.edges.filter((edge) => edge.id !== operation.edgeId);
      if (definition.edges.length === before) warnings.push(`Không tìm thấy kết nối '${operation.edgeId}' để xóa.`);
      else changes.push(describeOperation(operation));
    }
  }

  const validNodeIds = new Set(definition.nodes.map((node) => node.id));
  definition.edges = definition.edges.filter((edge) => {
    const valid = validNodeIds.has(edge.source) && validNodeIds.has(edge.target);
    if (!valid) warnings.push(`Đã loại kết nối '${edge.id}' vì node nguồn hoặc đích không tồn tại.`);
    return valid;
  });

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
