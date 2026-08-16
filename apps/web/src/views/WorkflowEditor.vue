<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueFlow, type Connection, type NodeMouseEvent } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import FlowNode from '../components/FlowNode.vue';
import MediaInspectorModal from '../components/MediaInspectorModal.vue';
import ImageEditorModal from '../components/ImageEditorModal.vue';
import { api, getSession, json } from '../services/api';
import { GEMINI_MODELS, type GeminiModelSpec } from '../services/gemini-models';
import { DEFAULT_NODE_TYPES } from '../services/default-node-types';
import { useAppStore } from '../stores/app';
import { useI18n } from '../services/i18n';
import type { Credential, Execution, NodeType, Workflow, WorkflowDefinition, MediaFile } from '../types';

interface FlowData {
  name: string;
  nodeType: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, string>;
  metadata?: NodeType;
  status?: string;
  disabled?: boolean;
  retry?: unknown;
  timeoutMs?: number;
  media?: MediaFile;
  mediaDeleted?: boolean;
}
interface EditorNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: FlowData;
}
interface EditorEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
}
interface Snapshot {
  nodes: EditorNode[];
  edges: EditorEdge[];
}
interface WorkflowAssistantResult {
  explanation: string;
  definition: WorkflowDefinition;
  mutationsCount: number;
  changes: string[];
  warnings: string[];
  manualSteps: string[];
  canApply: boolean;
  readyToRun: boolean;
}
const route = useRoute(),
  router = useRouter(),
  app = useAppStore();
const { t, locale, tCategory, tNodeName, tNodeDesc, tPropName } = useI18n();
const isVi = computed(() => locale.value === 'vi');

export interface ClientValidationIssue {
  code?: string;
  category?: 'trigger' | 'node_config' | 'topology' | 'edge' | 'expression';
  nodeId?: string;
  nodeName?: string;
  field?: string;
  fieldDisplayName?: string;
  message: string;
  messageVi?: string;
}

const workflow = ref<Workflow>(),
  nodeTypes = ref<NodeType[]>([...DEFAULT_NODE_TYPES]),
  credentials = ref<Credential[]>([]),
  nodes = ref<EditorNode[]>([]),
  edges = ref<EditorEdge[]>([]),
  selectedId = ref(''),
  saveState = ref<'Saved' | 'Saving…' | 'Unsaved' | 'Save failed'>('Saved'),
  validationErrors = ref<string[]>([]),
  validationIssues = ref<ClientValidationIssue[]>([]),
  jsonDrafts = ref<Record<string, string>>({}),
  executionId = ref(''),
  history = ref<Snapshot[]>([]),
  future = ref<Snapshot[]>([]),
  hydrating = ref(true),
  saveTimer = ref<number>(),
  eventSource = ref<EventSource>();

// Media Inspection & Editing Modals State
const inspectorMedia = ref<MediaFile | null>(null);
const isInspectorOpen = ref(false);
const editorMedia = ref<MediaFile | null>(null);
const isImageEditorOpen = ref(false);
const deleteConfirmMedia = ref<{ node: EditorNode; media: MediaFile } | null>(null);

// Canvas Gemini AI Assistant Bar State
const aiPrompt = ref('');
const isAiProcessing = ref(false);
const aiExplanation = ref('');
const aiExplanationTimer = ref<number>();
const pendingAiResult = ref<WorkflowAssistantResult | null>(null);

const selectedGeminiModelId = ref<string>('gemini-3.6-flash');
const currentModelSpec = computed<GeminiModelSpec>(() =>
  GEMINI_MODELS.find((m) => m.id === selectedGeminiModelId.value) || GEMINI_MODELS[0]
);
const aiMaxTokens = ref<number>(4096);
const tokenOptions = computed(() => currentModelSpec.value.tokenTiers);

const isModelMenuOpen = ref(false);
const modelMenuRef = ref<HTMLElement | null>(null);

function selectModel(modelId: string) {
  selectedGeminiModelId.value = modelId;
}

function selectTokens(tokens: number) {
  aiMaxTokens.value = tokens;
}

function toggleModelMenu() {
  isModelMenuOpen.value = !isModelMenuOpen.value;
}

function handleAiBarClickOutside(event: MouseEvent) {
  if (isModelMenuOpen.value && modelMenuRef.value && !modelMenuRef.value.contains(event.target as Node)) {
    isModelMenuOpen.value = false;
  }
}

watch(selectedGeminiModelId, (newModelId) => {
  const spec = GEMINI_MODELS.find((m) => m.id === newModelId) || GEMINI_MODELS[0];
  const hasMatchingTier = spec.tokenTiers.some((t) => t.value === aiMaxTokens.value);
  if (!hasMatchingTier || aiMaxTokens.value > spec.maxOutputTokens) {
    aiMaxTokens.value = spec.defaultTokens;
  }
});

async function sendAiCommand() {
  const text = aiPrompt.value.trim();
  if (!text || isAiProcessing.value) return;

  isAiProcessing.value = true;
  aiExplanation.value = '';
  pendingAiResult.value = null;
  window.clearTimeout(aiExplanationTimer.value);

  try {
    const currentDef = toDefinition();
    const res = await api<WorkflowAssistantResult>(
      `/workflows/${workflow.value?.id || 'temp'}/assistant`,
      json('POST', {
        prompt: text,
        workflow: currentDef,
        selectedNodeId: selected.value?.id || undefined,
        model: selectedGeminiModelId.value,
        maxTokens: aiMaxTokens.value,
      })
    );

    if (res && res.definition) {
      pendingAiResult.value = res;
      aiPrompt.value = '';
      aiExplanation.value = res.explanation;
    }
  } catch (err: any) {
    app.fail(err);
    aiExplanation.value = `❌ ${err.message || 'Lỗi xử lý yêu cầu AI'}`;
  } finally {
    isAiProcessing.value = false;
  }
}

function applyPendingAiResult() {
  const result = pendingAiResult.value;
  if (!result?.canApply || !workflow.value) return;

  checkpoint();
  fromWorkflow({ ...workflow.value, definition: result.definition });
  pendingAiResult.value = null;
  aiExplanation.value = result.readyToRun
    ? `Đã áp dụng ${result.mutationsCount} thay đổi. Workflow đã sẵn sàng để chạy.`
    : `Đã áp dụng ${result.mutationsCount} thay đổi. Hãy hoàn tất các bước thủ công trước khi chạy.`;
  app.notify(`✦ ${aiExplanation.value}`);

  window.clearTimeout(aiExplanationTimer.value);
  aiExplanationTimer.value = window.setTimeout(() => {
    aiExplanation.value = '';
  }, 9000);
}

function discardPendingAiResult() {
  pendingAiResult.value = null;
  aiExplanation.value = '';
}

let flowApi:
  | { screenToFlowCoordinate(position: { x: number; y: number }): { x: number; y: number } }
  | undefined;
const canvas = ref<HTMLElement>();
const nodeComponents = { m2m: FlowNode as never };
const selected = computed(() => nodes.value.find((node) => node.id === selectedId.value));
const selectedMeta = computed(() =>
  nodeTypes.value.find((type) => type.type === selected.value?.data.nodeType),
);
const grouped = computed(() =>
  nodeTypes.value.reduce<Record<string, NodeType[]>>((result, type) => {
    (result[type.category] ??= []).push(type);
    return result;
  }, {}),
);

const matchingCredentials = computed(() => {
  if (!selected.value) return [];
  const currentProvider = String(selected.value.data.parameters?.provider || '');
  if (!currentProvider) return [];
  return credentials.value.filter((c) => c.type === currentProvider);
});

const otherCredentials = computed(() => {
  if (!selected.value) return credentials.value;
  const currentProvider = String(selected.value.data.parameters?.provider || '');
  if (!currentProvider) return credentials.value;
  return credentials.value.filter((c) => c.type !== currentProvider);
});

const modelSuggestions = computed(() => {
  if (!selected.value) return [];
  const provider = String(selected.value.data.parameters?.provider || 'ollama');
  if (provider === 'gemini') {
    return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  }
  if (provider === 'openai-compatible') {
    return ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'deepseek-reasoner', 'llama-3.3-70b-versatile'];
  }
  if (provider === 'ollama') {
    return ['llama3.2', 'llama3.3', 'qwen2.5-coder', 'deepseek-r1', 'mistral', 'smollm2'];
  }
  return [];
});

function getPropertyOptions(property: { name: string; options?: Array<{ label: string; value: unknown }> }) {
  if (property.name === 'model' && selected.value?.data.nodeType === 'm2m.media.generateImage') {
    const provider = String(selected.value.data.parameters?.provider || 'comfyui');
    if (provider === 'comfyui') {
      return property.options?.filter((o) => ['flux2-klein-4b', 'sdxl'].includes(String(o.value))) || property.options;
    }
    if (provider === 'huggingface') {
      return property.options?.filter((o) => ['hf-flux-schnell'].includes(String(o.value))) || property.options;
    }
    if (provider === 'black-forest-labs') {
      return property.options?.filter((o) => ['bfl-flux-pro-1.1', 'bfl-flux-dev'].includes(String(o.value))) || property.options;
    }
  }
  return property.options;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function cloneSnapshot(): Snapshot {
  return { nodes: cloneValue(nodes.value), edges: cloneValue(edges.value) };
}
function checkpoint() {
  history.value.push(cloneSnapshot());
  if (history.value.length > 50) history.value.shift();
  future.value = [];
}
function undo() {
  const state = history.value.pop();
  if (!state) return;
  future.value.push(cloneSnapshot());
  nodes.value = state.nodes;
  edges.value = state.edges;
}
function redo() {
  const state = future.value.pop();
  if (!state) return;
  history.value.push(cloneSnapshot());
  nodes.value = state.nodes;
  edges.value = state.edges;
}
function toDefinition(): WorkflowDefinition {
  return {
    nodes: nodes.value.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      name: node.data.name,
      position: node.position,
      parameters: node.data.parameters,
      credentials: node.data.credentials,
      disabled: node.data.disabled,
      retry: node.data.retry as never,
      timeoutMs: node.data.timeoutMs,
    })),
    edges: edges.value.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    })),
    settings: workflow.value?.definition.settings ?? {
      timeoutMs: 300000,
      saveExecutionProgress: true,
    },
  };
}
function fromWorkflow(value: Workflow) {
  nodes.value = value.definition.nodes.map((node) => ({
    id: node.id,
    type: 'm2m',
    position: node.position,
    data: {
      name: node.name,
      nodeType: node.type,
      parameters: node.parameters,
      credentials: node.credentials,
      disabled: node.disabled,
      retry: node.retry,
      timeoutMs: node.timeoutMs,
      metadata: nodeTypes.value.find((type) => type.type === node.type),
    },
  }));
  edges.value = value.definition.edges.map((edge) => ({ ...edge, type: 'default' }));
}

function extractMediaFromOutput(output: any): MediaFile | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const jsonOutput = output.json || output;
  let target: any = undefined;
  if (jsonOutput.media && typeof jsonOutput.media === 'object') target = jsonOutput.media;
  else if (Array.isArray(jsonOutput.images) && jsonOutput.images[0]) target = jsonOutput.images[0];
  else if (jsonOutput.image && typeof jsonOutput.image === 'object') target = jsonOutput.image;
  else if (jsonOutput.video && typeof jsonOutput.video === 'object') target = jsonOutput.video;
  else if (jsonOutput.savedMedia && typeof jsonOutput.savedMedia === 'object') target = jsonOutput.savedMedia;
  else if (jsonOutput.finalVideo && typeof jsonOutput.finalVideo === 'object') target = jsonOutput.finalVideo;
  else if (typeof jsonOutput === 'object' && (jsonOutput.previewUrl || (jsonOutput.id && jsonOutput.type))) target = jsonOutput;

  if (target && typeof target === 'object') {
    const res: MediaFile = { ...target };
    if (!res.previewUrl && res.id) {
      res.previewUrl = `/api/v1/media/assets/${res.id}/content`;
    }
    return res;
  }
  return undefined;
}

function onMediaAction(e: Event) {
  const custom = e as CustomEvent<{ action: string; nodeId: string; media?: MediaFile; file?: File }>;
  const node = nodes.value.find((n) => n.id === custom.detail.nodeId);
  const media = custom.detail.media || node?.data.media;

  if (custom.detail.action === 'upload' && node && custom.detail.file) {
    void uploadImageToNode(node, custom.detail.file);
    return;
  }

  if (!media) return;

  if (custom.detail.action === 'view') {
    inspectorMedia.value = media;
    isInspectorOpen.value = true;
  } else if (custom.detail.action === 'edit') {
    editorMedia.value = media;
    isImageEditorOpen.value = true;
  } else if (custom.detail.action === 'download') {
    const a = document.createElement('a');
    a.href = media.previewUrl || `/api/v1/media/assets/${media.id}/content`;
    a.download = media.filename || `media_${media.id}.${media.type === 'video' ? 'mp4' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else if (custom.detail.action === 'delete-media' && node) {
    deleteConfirmMedia.value = { node, media };
  } else if (custom.detail.action === 'regenerate') {
    run();
  }
}

async function uploadImageToNode(node: EditorNode, file: File) {
  try {
    node.data.status = 'uploading';
    const formData = new FormData();
    formData.append('file', file);
    const uploaded = await api.upload<MediaFile>('/media/upload', formData);
    node.data.media = uploaded;
    node.data.mediaDeleted = false;
    node.data.status = undefined;
    app.notify(isVi.value ? 'Tải ảnh lên thành công' : 'Image uploaded successfully');
  } catch (err: any) {
    node.data.status = undefined;
    app.fail(err);
  }
}

async function confirmDeleteMedia() {
  if (!deleteConfirmMedia.value) return;
  const { node, media } = deleteConfirmMedia.value;
  try {
    await api.delete(`/media/assets/${media.id}?force=true`);
    node.data.media = undefined;
    node.data.mediaDeleted = true;
    if (inspectorMedia.value?.id === media.id) isInspectorOpen.value = false;
    if (editorMedia.value?.id === media.id) isImageEditorOpen.value = false;
    app.notify(t('media.deleteSuccess') || 'Media asset deleted');
  } catch (err: any) {
    app.fail(err);
  } finally {
    deleteConfirmMedia.value = null;
  }
}

function onImageEdited(updated: MediaFile) {
  for (const node of nodes.value) {
    if (node.data.media?.id === updated.id) {
      node.data.media = { ...updated };
      node.data.mediaDeleted = false;
    }
  }
  if (inspectorMedia.value?.id === updated.id) {
    inspectorMedia.value = { ...updated };
  }
  app.notify(t('media.applyVersion') || 'Updated canvas media version');
}

async function load() {
  try {
    const [typeList, workflowValue, credentialList] = await Promise.all([
      api<NodeType[]>('/node-types').catch(() => []),
      api<Workflow>(`/workflows/${route.params.id}`),
      api<Credential[]>('/credentials').catch(() => []),
    ]);
    const mergedTypes = Array.isArray(typeList) && typeList.length ? [...typeList] : [];
    const existingTypeSet = new Set(mergedTypes.map((t) => t.type));
    for (const defaultType of DEFAULT_NODE_TYPES) {
      if (!existingTypeSet.has(defaultType.type)) {
        mergedTypes.push(defaultType);
      }
    }
    nodeTypes.value = mergedTypes;
    workflow.value = workflowValue;
    credentials.value = Array.isArray(credentialList) ? credentialList : [];
    fromWorkflow(workflowValue);

    // Restore latest execution statuses & generated media previews on canvas
    try {
      const executions = await api<Execution[]>(`/executions?workflowId=${workflowValue.id}`).catch(() => []);
      if (executions && executions.length > 0 && executions[0].id) {
        const latestExec = await api<Execution>(`/executions/${executions[0].id}`).catch(() => null);
        if (latestExec && Array.isArray((latestExec as any).nodes)) {
          for (const nodeResult of (latestExec as any).nodes) {
            const targetNode = nodes.value.find((n) => n.id === nodeResult.nodeId);
            if (targetNode) {
              targetNode.data.status = nodeResult.status;
              if (nodeResult.output) {
                const media = extractMediaFromOutput(nodeResult.output);
                if (media) {
                  targetNode.data.media = media;
                  targetNode.data.mediaDeleted = false;
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    history.value = [];
    await nextTick();
    hydrating.value = false;
  } catch (e) {
    app.fail(e);
  }
}
async function save(manual = false) {
  if (!workflow.value) return;
  window.clearTimeout(saveTimer.value);
  saveState.value = 'Saving…';
  try {
    workflow.value = await api(
      `/workflows/${workflow.value.id}`,
      json('PATCH', { name: workflow.value.name, definition: toDefinition() }),
    );
    saveState.value = 'Saved';
    if (manual) app.notify(t('editor.workflowSaved'));
  } catch (e) {
    saveState.value = 'Save failed';
    app.fail(e);
  }
}
function scheduleSave() {
  if (hydrating.value) return;
  saveState.value = 'Unsaved';
  window.clearTimeout(saveTimer.value);
  saveTimer.value = window.setTimeout(() => void save(), 800);
}
watch([nodes, edges], scheduleSave, { deep: true });
watch(
  () => selected.value?.id,
  () => {
    jsonDrafts.value = {};
    for (const property of selectedMeta.value?.properties ?? []) {
      if (property.type === 'json')
        jsonDrafts.value[property.name] = JSON.stringify(
          selected.value?.data.parameters[property.name] ?? property.default ?? {},
          null,
          2,
        );
    }
  },
);
function addNode(
  type: NodeType,
  position = { x: 180 + Math.random() * 300, y: 120 + Math.random() * 300 },
) {
  checkpoint();
  const parameters = Object.fromEntries(
    type.properties
      .filter((p) => p.default !== undefined)
      .map((p) => [p.name, cloneValue(p.default)]),
  );
  const id = `${type.type.replace(/\W/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  nodes.value.push({
    id,
    type: 'm2m',
    position,
    data: { name: type.displayName, nodeType: type.type, parameters, metadata: type },
  });
  selectedId.value = id;
}
function dragStart(event: DragEvent, type: NodeType) {
  event.dataTransfer?.setData('application/m2m-node', type.type);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function drop(event: DragEvent) {
  const type = nodeTypes.value.find(
    (item) => item.type === event.dataTransfer?.getData('application/m2m-node'),
  );
  if (!type) return;
  const rect = canvas.value?.getBoundingClientRect();
  const raw = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  addNode(type, flowApi?.screenToFlowCoordinate({ x: event.clientX, y: event.clientY }) ?? raw);
}
function onInit(instance: unknown) {
  flowApi = instance as typeof flowApi;
}
function connect(connection: Connection) {
  checkpoint();
  edges.value.push({ ...connection, id: crypto.randomUUID() });
}
function choose(event: NodeMouseEvent) {
  selectedId.value = event.node.id;
}
function duplicate() {
  if (!selected.value) return;
  checkpoint();
  const copy = cloneValue(selected.value);
  copy.id = `${copy.data.nodeType.replace(/\W/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  copy.position = { x: copy.position.x + 40, y: copy.position.y + 40 };
  copy.data.name = `${copy.data.name} copy`;
  nodes.value.push(copy);
  selectedId.value = copy.id;
}
function removeSelected() {
  if (!selected.value) return;
  checkpoint();
  const id = selected.value.id;
  nodes.value = nodes.value.filter((node) => node.id !== id);
  edges.value = edges.value.filter((edge) => edge.source !== id && edge.target !== id);
  selectedId.value = '';
}
function setParameter(name: string, value: unknown) {
  if (!selected.value) return;
  selected.value.data.parameters[name] = value;

  if (name === 'provider' && typeof value === 'string') {
    const nodeType = selected.value.data.nodeType;
    if (nodeType === 'm2m.media.generateImage') {
      if (value === 'comfyui') {
        selected.value.data.parameters.model = 'flux2-klein-4b';
      } else if (value === 'huggingface') {
        selected.value.data.parameters.model = 'hf-flux-schnell';
      } else if (value === 'black-forest-labs') {
        selected.value.data.parameters.model = 'bfl-flux-pro-1.1';
      }
    } else if (selectedMeta.value?.category === 'ai') {
      if (value === 'ollama') {
        selected.value.data.parameters.model = 'llama3.2';
      } else if (value === 'gemini') {
        selected.value.data.parameters.model = 'gemini-2.0-flash';
      } else if (value === 'openai-compatible') {
        selected.value.data.parameters.model = 'gpt-4o-mini';
      }
    }
  }
}
function setJson(name: string, value: string) {
  jsonDrafts.value[name] = value;
  try {
    setParameter(name, JSON.parse(value));
    validationErrors.value = validationErrors.value.filter((item) => !item.startsWith(`${name}:`));
  } catch {
    validationErrors.value = [
      ...validationErrors.value.filter((item) => !item.startsWith(`${name}:`)),
      `${name}: ${t('editor.invalidJson')}`,
    ];
  }
}
async function validate(silent = false): Promise<boolean> {
  if (!workflow.value) return true;
  await save();
  try {
    const result = await api<{
      valid: boolean;
      errors: ClientValidationIssue[];
      summary?: string;
      summaryVi?: string;
    }>(
      `/workflows/${workflow.value.id}/validate`,
      json('POST'),
    );
    validationIssues.value = result.errors || [];
    validationErrors.value = (result.errors || []).map((err) =>
      isVi.value ? (err.messageVi || err.message) : err.message
    );

    if (result.valid) {
      if (!silent) app.notify(t('editor.workflowValid'));
      return true;
    } else {
      const topError = result.errors[0];
      const categoryTag = topError?.category === 'trigger'
        ? '🔴 [Trigger] '
        : topError?.category === 'node_config'
        ? '🟡 [Cấu hình] '
        : topError?.category === 'topology'
        ? '🟠 [Sơ đồ] '
        : topError?.category === 'edge'
        ? '🟣 [Dây nối] '
        : topError?.category === 'expression'
        ? '🔵 [Biểu thức] '
        : '⚠️ ';
      const errorMsg = isVi.value
        ? (result.summaryVi || topError?.messageVi || topError?.message || t('editor.workflowInvalid'))
        : (result.summary || topError?.message || t('editor.workflowInvalid'));
      if (!silent) app.fail(new Error(`${categoryTag}${errorMsg}`));
      return false;
    }
  } catch (err: any) {
    if (!silent) app.fail(err);
    return false;
  }
}

async function onValidateClick() {
  await validate(false);
}

const activeValidationList = computed<ClientValidationIssue[]>(() => {
  if (validationIssues.value.length > 0) return validationIssues.value;
  return validationErrors.value.map((msg) => ({
    code: 'VALIDATION_ERROR',
    category: 'node_config',
    message: msg,
    messageVi: msg,
  }));
});
function listenExecution(id: string) {
  eventSource.value?.close();
  const session = getSession();
  const query = session?.accessToken
    ? `?access_token=${encodeURIComponent(session.accessToken)}&workspace_id=${encodeURIComponent(session.workspaceId)}`
    : '';
  eventSource.value = new EventSource(
    `/api/v1/executions/${id}/events${query}`,
  );
  const setStatus = (event: MessageEvent, status: string) => {
    const payload = JSON.parse(event.data);
    const node = nodes.value.find((item) => item.id === payload.nodeId);
    if (node) {
      node.data.status = status;
      if (payload.data?.output) {
        const media = extractMediaFromOutput(payload.data.output);
        if (media) {
          node.data.media = media;
          node.data.mediaDeleted = false;
        }
      }
    }
  };
  eventSource.value.addEventListener('snapshot', (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    for (const result of payload.nodes ?? []) {
      const node = nodes.value.find((item) => item.id === result.nodeId);
      if (node) {
        node.data.status = result.status;
        if (result.output) {
          const media = extractMediaFromOutput(result.output);
          if (media) {
            node.data.media = media;
            node.data.mediaDeleted = false;
          }
        }
      }
    }
    if (['success', 'failed', 'cancelled'].includes(payload.status)) eventSource.value?.close();
  });
  eventSource.value.addEventListener('node.started', (event) =>
    setStatus(event as MessageEvent, 'running'),
  );
  eventSource.value.addEventListener('node.completed', (event) =>
    setStatus(event as MessageEvent, 'success'),
  );
  eventSource.value.addEventListener('node.skipped', (event) =>
    setStatus(event as MessageEvent, 'skipped'),
  );
  eventSource.value.addEventListener('node.failed', (event) =>
    setStatus(event as MessageEvent, 'failed'),
  );
  for (const name of ['execution.completed', 'execution.failed'])
    eventSource.value.addEventListener(name, () => eventSource.value?.close());
}
async function run() {
  const current = workflow.value;
  if (!current) return;
  try {
    const isValid = await validate(true);
    if (!isValid) {
      const topError = validationIssues.value[0];
      const categoryTag = topError?.category === 'trigger'
        ? '🔴 [Lỗi Trigger] '
        : topError?.category === 'node_config'
        ? '🟡 [Lỗi Cấu hình] '
        : topError?.category === 'topology'
        ? '🟠 [Lỗi Sơ đồ] '
        : topError?.category === 'edge'
        ? '🟣 [Lỗi Dây nối] '
        : topError?.category === 'expression'
        ? '🔵 [Lỗi Biểu thức] '
        : '⚠️ ';
      const msg = isVi.value
        ? (topError?.messageVi || topError?.message || 'Không thể chạy: Quy trình có lỗi cần sửa')
        : (topError?.message || 'Cannot run: Workflow has validation errors');
      app.fail(new Error(`${categoryTag}${msg}`));
      if (topError?.nodeId) selectedId.value = topError.nodeId;
      return;
    }

    nodes.value.forEach((node) => (node.data.status = undefined));
    const execution = await api<Execution>(`/workflows/${current.id}/run`, json('POST', {}));
    executionId.value = execution.id;
    listenExecution(execution.id);
    app.notify(t('editor.executionQueued'));
  } catch (e: any) {
    app.fail(e);
  }
}
async function toggleActive() {
  const current = workflow.value;
  if (!current) return;
  try {
    if (!current.active) {
      const isValid = await validate(true);
      if (!isValid) {
        const topError = validationIssues.value[0];
        const categoryTag = topError?.category === 'trigger'
          ? '🔴 [Trigger] '
          : topError?.category === 'node_config'
          ? '🟡 [Cấu hình] '
          : topError?.category === 'topology'
          ? '🟠 [Sơ đồ] '
          : '⚠️ ';
        const msg = isVi.value
          ? (topError?.messageVi || topError?.message || 'Không thể kích hoạt: Quy trình có lỗi')
          : (topError?.message || 'Cannot activate: Workflow has validation errors');
        app.fail(new Error(`${categoryTag}${msg}`));
        if (topError?.nodeId) selectedId.value = topError.nodeId;
        return;
      }
    }
    const updated = await api<Workflow>(
      `/workflows/${current.id}/${current.active ? 'deactivate' : 'activate'}`,
      json('POST'),
    );
    workflow.value = updated;
    app.notify(
      updated.active ? t('editor.workflowActivated') : t('editor.workflowDeactivated'),
    );
  } catch (e: any) {
    app.fail(e);
  }
}
function onKey(event: KeyboardEvent) {
  const meta = event.ctrlKey || event.metaKey;
  if (meta && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (meta && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save(true);
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.value) {
    const tag = (event.target as HTMLElement).tagName;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
      event.preventDefault();
      removeSelected();
    }
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('flow-node-media-action', onMediaAction);
  window.addEventListener('click', handleAiBarClickOutside);
  void load();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('flow-node-media-action', onMediaAction);
  window.removeEventListener('click', handleAiBarClickOutside);
  eventSource.value?.close();
  window.clearTimeout(saveTimer.value);
});
</script>

<template>
  <div v-if="workflow" class="editor">
    <header class="editor-bar">
      <button class="back" :title="t('editor.back')" @click="router.push('/workflows')">←</button>
      <div class="editor-title">
        <input v-model="workflow.name" @change="save(true)" />
        <span
          class="save-state"
          :class="{
            saved: saveState === 'Saved',
            'save-failed': saveState === 'Save failed',
          }"
        >
          {{
            saveState === 'Saved'
              ? t('editor.saved')
              : saveState === 'Saving…'
                ? t('editor.saving')
                : saveState === 'Unsaved'
                  ? t('editor.unsaved')
                  : t('editor.saveFailed')
          }}
        </span>
      </div>
      <div class="editor-actions">
        <button :title="t('editor.undo')" :disabled="!history.length" @click="undo">↶</button>
        <button :title="t('editor.redo')" :disabled="!future.length" @click="redo">↷</button>
        <button @click="onValidateClick">{{ t('editor.validate') }}</button>
        <button @click="save(true)">{{ t('editor.save') }}</button>
        <button class="activate" :class="{ on: workflow.active }" @click="toggleActive">
          {{ workflow.active ? `● ${t('editor.active')}` : t('editor.activate') }}
        </button>
        <button class="primary run" @click="run">{{ t('editor.run') }}</button>
      </div>
    </header>
    <div class="editor-body">
      <aside class="palette">
        <div class="panel-heading">
          <strong>{{ t('editor.nodes') }}</strong>
          <small>{{ t('editor.dragToCanvas') }}</small>
        </div>
        <div v-for="(types, category) in grouped" :key="category" class="palette-group">
          <label>{{ tCategory(String(category)) }}</label>
          <button
            v-for="type in types"
            :key="type.type"
            draggable="true"
            @dragstart="dragStart($event, type)"
            @click="addNode(type)"
          >
            <span>{{
              type.category === 'trigger'
                ? '▶'
                : type.category === 'ai'
                  ? '✦'
                  : type.category === 'media'
                    ? '🎬'
                    : type.category === 'data'
                      ? '{}'
                      : '⌁'
            }}</span>
            <div>
              <strong>{{ tNodeName(type.type, type.displayName) }}</strong>
              <small :title="tNodeDesc(type.type, type.description)">{{
                tNodeDesc(type.type, type.description)
              }}</small>
            </div>
          </button>
        </div>
      </aside>
      <div ref="canvas" class="canvas" @dragover.prevent @drop="drop">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeComponents"
          fit-view-on-init
          multi-selection-key-code="Shift"
          @init="onInit"
          @connect="connect"
          @node-click="choose"
          @node-drag-start="checkpoint"
        >
          <Background pattern-color="#242936" :gap="22" />
          <MiniMap pannable zoomable />
          <Controls />
        </VueFlow>
        <div v-if="executionId" class="execution-chip">
          {{ t('editor.execution') }}
          <RouterLink :to="`/executions/${executionId}`">
            {{ executionId.slice(0, 8) }} ↗
          </RouterLink>
        </div>

        <!-- Floating Canvas AI Assistant Bar (Bottom-Center) -->
        <div ref="modelMenuRef" class="canvas-ai-copilot-container">
          <!-- AI Explanation Bubble -->
          <transition name="fade">
            <div v-if="aiExplanation" class="ai-explanation-bubble">
              <span class="ai-sparkle">✦</span>
              <div class="bubble-text">
                <strong>{{ pendingAiResult ? (isVi ? 'Xem trước thay đổi' : 'Review changes') : aiExplanation }}</strong>
                <p v-if="pendingAiResult">{{ aiExplanation }}</p>
                <ul v-if="pendingAiResult?.changes.length" class="ai-result-list changes">
                  <li v-for="change in pendingAiResult.changes" :key="change">{{ change }}</li>
                </ul>
                <ul v-if="pendingAiResult?.warnings.length" class="ai-result-list warnings">
                  <li v-for="warning in pendingAiResult.warnings" :key="warning">⚠ {{ warning }}</li>
                </ul>
                <div v-if="pendingAiResult?.manualSteps.length" class="ai-manual-steps">
                  <b>{{ isVi ? 'Cần làm thủ công:' : 'Manual steps:' }}</b>
                  <ol>
                    <li v-for="step in pendingAiResult.manualSteps" :key="step">{{ step }}</li>
                  </ol>
                </div>
                <div v-if="pendingAiResult" class="ai-review-actions">
                  <button type="button" @click="discardPendingAiResult">{{ isVi ? 'Hủy' : 'Discard' }}</button>
                  <button
                    type="button"
                    class="primary"
                    :disabled="!pendingAiResult.canApply"
                    @click="applyPendingAiResult"
                  >
                    {{ pendingAiResult.readyToRun
                      ? (isVi ? 'Áp dụng' : 'Apply')
                      : (isVi ? 'Áp dụng bản nháp' : 'Apply draft') }}
                  </button>
                </div>
              </div>
              <button class="bubble-close" :title="isVi ? 'Đóng' : 'Close'" @click="discardPendingAiResult">×</button>
            </div>
          </transition>

          <!-- Gemini Model & Output Token Settings Popover Menu -->
          <transition name="popover-slide">
            <div v-if="isModelMenuOpen" class="ai-settings-popover">
              <div class="ai-popover-header">
                <div class="ai-popover-title-row">
                  <div class="ai-popover-title">
                    <svg class="gemini-sparkle-svg" viewBox="0 0 24 24" width="16" height="16" fill="none">
                      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#pop-grad)" />
                      <defs>
                        <linearGradient id="pop-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                          <stop stop-color="#70a1ff" />
                          <stop offset="0.5" stop-color="#b8ff6b" />
                          <stop offset="1" stop-color="#a55eea" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <strong>{{ isVi ? 'Cấu hình Mô hình & Token' : 'Gemini Model & Token Settings' }}</strong>
                  </div>
                  <button class="ai-popover-close" :title="isVi ? 'Đóng' : 'Close'" @click="isModelMenuOpen = false">×</button>
                </div>
                <small class="ai-popover-sub">
                  {{ isVi ? 'Đang chọn:' : 'Active:' }} <span class="highlight-model">{{ currentModelSpec.name }}</span> ({{ aiMaxTokens.toLocaleString() }} tokens)
                </small>
              </div>

              <div class="ai-popover-body">
                <!-- Section 1: Models Selection -->
                <div class="ai-popover-section">
                  <div class="ai-section-label">
                    <span>{{ isVi ? '1. Chọn Mô hình Gemini' : '1. Select Gemini Model' }}</span>
                  </div>
                  <div class="ai-model-list">
                    <button
                      v-for="m in GEMINI_MODELS"
                      :key="m.id"
                      type="button"
                      class="ai-model-item"
                      :class="{ active: selectedGeminiModelId === m.id }"
                      @click="selectModel(m.id)"
                    >
                      <div class="ai-model-info">
                        <div class="ai-model-name-row">
                          <span class="ai-model-name">{{ m.name }}</span>
                          <span class="ai-model-tag" :class="m.badgeColor">{{ m.tag }}</span>
                        </div>
                        <p class="ai-model-desc">{{ isVi ? m.descriptionVi : m.description }}</p>
                      </div>
                      <span v-if="selectedGeminiModelId === m.id" class="ai-model-check">✓</span>
                    </button>
                  </div>
                </div>

                <!-- Section 2: Output Token Budget -->
                <div class="ai-popover-section">
                  <div class="ai-section-label">
                    <span>{{ isVi ? '2. Giới hạn Token đầu ra' : '2. Output Token Limit' }}</span>
                    <small class="token-hint">{{ isVi ? `Tối đa ${currentModelSpec.maxOutputTokens.toLocaleString()} tokens` : `Up to ${currentModelSpec.maxOutputTokens.toLocaleString()} tokens` }}</small>
                  </div>
                  <div class="ai-token-chips">
                    <button
                      v-for="opt in tokenOptions"
                      :key="opt.value"
                      type="button"
                      class="ai-token-chip"
                      :class="{ active: aiMaxTokens === opt.value }"
                      @click="selectTokens(opt.value)"
                    >
                      <span class="chip-icon">{{ opt.icon }}</span>
                      <span class="chip-text">{{ isVi ? opt.label : opt.labelEn }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </transition>

          <!-- Floating Prompt Bar -->
          <div class="canvas-ai-bar" :class="{ processing: isAiProcessing }">
            <!-- Compact Gemini Icon Trigger Button -->
            <button
              type="button"
              class="ai-model-trigger-btn"
              :class="{ active: isModelMenuOpen }"
              :title="isVi ? `Đang dùng: ${currentModelSpec.name} (${aiMaxTokens.toLocaleString()} tokens) - Nhấn để đổi mô hình & token` : `Active: ${currentModelSpec.name} (${aiMaxTokens.toLocaleString()} tokens) - Click to change model & token`"
              @click.stop="toggleModelMenu"
            >
              <svg class="gemini-sparkle-svg" viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#btn-gem-grad)" />
                <defs>
                  <linearGradient id="btn-gem-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#70a1ff" />
                    <stop offset="0.5" stop-color="#b8ff6b" />
                    <stop offset="1" stop-color="#a55eea" />
                  </linearGradient>
                </defs>
              </svg>
              <span class="ai-glow-dot"></span>
              <span class="ai-dropdown-caret">▾</span>
            </button>

            <input
              v-model="aiPrompt"
              type="text"
              :placeholder="
                isVi
                  ? 'Yêu cầu Gemini tạo, cấu hình, nối hoặc xóa node trên Canvas… (Nhấn Enter)'
                  : 'Ask Gemini to create, configure, wire, or delete canvas nodes… (Press Enter)'
              "
              :disabled="isAiProcessing"
              @keydown.enter.prevent="sendAiCommand"
            />
            <button
              class="ai-send-btn"
              :disabled="!aiPrompt.trim() || isAiProcessing"
              :title="isVi ? 'Gửi yêu cầu đến Gemini' : 'Send command to Gemini'"
              @click="sendAiCommand"
            >
              <span v-if="isAiProcessing" class="ai-spinner"></span>
              <span v-else>➤</span>
            </button>
          </div>
        </div>
      </div>
      <aside class="settings">
        <template v-if="selected">
          <div class="panel-heading">
            <div>
              <strong>{{ selected.data.name }}</strong>
              <small>{{ tNodeName(selected.data.nodeType, selected.data.nodeType) }}</small>
            </div>
            <button class="icon-danger" :title="t('editor.deleteNode')" @click="removeSelected">×</button>
          </div>
          <label class="field">
            {{ t('editor.nodeName') }}
            <input v-model="selected.data.name" />
          </label>
          <template v-for="property in selectedMeta?.properties" :key="property.name">
            <label class="field">
              <span>{{ tPropName(property.name, property.displayName) }} <b v-if="property.required">*</b></span>
              <select
                v-if="property.type === 'select'"
                :value="selected.data.parameters[property.name]"
                @change="setParameter(property.name, ($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="option in getPropertyOptions(property)"
                  :key="String(option.value)"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <input
                v-else-if="property.type === 'boolean'"
                type="checkbox"
                :checked="Boolean(selected.data.parameters[property.name])"
                @change="setParameter(property.name, ($event.target as HTMLInputElement).checked)"
              />
              <input
                v-else-if="property.type === 'number'"
                type="number"
                :value="selected.data.parameters[property.name] as number"
                @input="
                  setParameter(property.name, Number(($event.target as HTMLInputElement).value))
                "
              />
              <textarea
                v-else-if="property.type === 'json'"
                :value="jsonDrafts[property.name]"
                rows="7"
                @input="setJson(property.name, ($event.target as HTMLTextAreaElement).value)"
              />
              <textarea
                v-else-if="['prompt', 'system', 'script', 'sceneDescription'].includes(property.name)"
                :value="selected.data.parameters[property.name] as string"
                rows="5"
                @input="setParameter(property.name, ($event.target as HTMLTextAreaElement).value)"
              />
              <input
                v-else-if="property.name === 'model' && modelSuggestions.length"
                :value="selected.data.parameters[property.name] as string"
                list="ai-model-datalist"
                @input="setParameter(property.name, ($event.target as HTMLInputElement).value)"
              />
              <input
                v-else
                :value="selected.data.parameters[property.name] as string"
                @input="setParameter(property.name, ($event.target as HTMLInputElement).value)"
              />
              <small>{{ property.description }}</small>
            </label>
          </template>

          <datalist id="ai-model-datalist">
            <option v-for="sug in modelSuggestions" :key="sug" :value="sug" />
          </datalist>

          <label
            v-if="
              selectedMeta?.category === 'ai' ||
              selectedMeta?.category === 'media' ||
              selected.data.nodeType === 'core.httpRequest'
            "
            class="field"
          >
            <span>{{ t('editor.credential') }}</span>
            <select
              :value="selected.data.credentials?.primary ?? ''"
              @change="
                selected.data.credentials = ($event.target as HTMLSelectElement).value
                  ? { primary: ($event.target as HTMLSelectElement).value }
                  : undefined
              "
            >
              <option value="">{{ t('editor.noneEnvironment') }}</option>
              <optgroup v-if="matchingCredentials.length" :label="t('editor.matchingCredentials')">
                <option v-for="credential in matchingCredentials" :key="credential.id" :value="credential.id">
                  ⚡ {{ credential.name }} ({{ credential.type }})
                </option>
              </optgroup>
              <optgroup v-if="otherCredentials.length" :label="t('editor.allCredentials')">
                <option v-for="credential in otherCredentials" :key="credential.id" :value="credential.id">
                  {{ credential.name }} · {{ credential.type }}
                </option>
              </optgroup>
            </select>
          </label>
          <div class="setting-row">
            <button @click="duplicate">{{ t('editor.duplicate') }}</button>
            <label>
              <input v-model="selected.data.disabled" type="checkbox" /> {{ t('editor.disabled') }}
            </label>
          </div>
        </template>
        <div v-else class="panel-empty">
          <span>◇</span>
          <p>{{ t('editor.emptySettings') }}</p>
        </div>
        <div v-if="activeValidationList.length" class="validation-box">
          <div class="validation-box-head">
            <strong>⚠️ {{ isVi ? 'Lỗi cần khắc phục' : t('editor.needsAttention') }} ({{ activeValidationList.length }})</strong>
          </div>
          <div class="validation-list">
            <div
              v-for="(issue, idx) in activeValidationList"
              :key="idx"
              class="validation-item"
              :class="issue.category || 'node_config'"
              @click="issue.nodeId && (selectedId = issue.nodeId)"
            >
              <div class="validation-category-tag">
                <span v-if="issue.category === 'trigger'" class="badge-cat red">🔴 Trigger</span>
                <span v-else-if="issue.category === 'node_config'" class="badge-cat yellow">🟡 {{ isVi ? 'Cấu hình' : 'Config' }}</span>
                <span v-else-if="issue.category === 'topology'" class="badge-cat orange">🟠 {{ isVi ? 'Sơ đồ' : 'Topology' }}</span>
                <span v-else-if="issue.category === 'edge'" class="badge-cat purple">🟣 {{ isVi ? 'Dây nối' : 'Edge' }}</span>
                <span v-else-if="issue.category === 'expression'" class="badge-cat blue">🔵 {{ isVi ? 'Biểu thức' : 'Expression' }}</span>
                <span v-else class="badge-cat red">⚠️ {{ isVi ? 'Lỗi' : 'Error' }}</span>
                <span v-if="issue.nodeName" class="badge-node-name">{{ issue.nodeName }}</span>
              </div>
              <p class="validation-item-msg">{{ isVi ? (issue.messageVi || issue.message) : issue.message }}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Modals -->
    <MediaInspectorModal
      :is-open="isInspectorOpen"
      :media="inspectorMedia"
      @close="isInspectorOpen = false"
      @edit="(m) => { isInspectorOpen = false; editorMedia = m; isImageEditorOpen = true; }"
      @regenerate="() => { isInspectorOpen = false; run(); }"
      @delete="(m) => {
        const found = nodes.find(n => n.data.media?.id === m.id);
        if (found) {
          isInspectorOpen = false;
          deleteConfirmMedia = { node: found, media: m };
        }
      }"
    />

    <ImageEditorModal
      :is-open="isImageEditorOpen"
      :media="editorMedia"
      @close="isImageEditorOpen = false"
      @applied="onImageEdited"
    />

    <!-- Delete Media Confirmation Dialog (Distinct from Delete Node) -->
    <div v-if="deleteConfirmMedia" class="modal" @click.self="deleteConfirmMedia = null">
      <div class="dialog">
        <h2>⚠️ {{ t('media.deleteConfirmTitle') || 'Delete Generated Media?' }}</h2>
        <p style="color: #9ea8b8; font-size: 13px; line-height: 1.5; margin: 0;">
          {{ t('media.deleteConfirmDesc') || 'This will remove the media file from local storage. The workflow node will remain intact on your canvas.' }}
        </p>
        <div class="dialog-actions">
          <button @click="deleteConfirmMedia = null">{{ t('common.cancel') || 'Cancel' }}</button>
          <button class="primary" style="background: var(--red); border-color: var(--red); color: #fff;" @click="confirmDeleteMedia">
            🗑 {{ t('media.deleteMedia') || 'Delete Media File' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="empty">{{ t('editor.loading') }}</div>
</template>
