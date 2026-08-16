<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import { api } from '../services/api';
import { useI18n } from '../services/i18n';
import type { MediaFile, MediaAssetVersion } from '../types';

const props = defineProps<{
  media: MediaFile | null;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'applied', updatedMedia: MediaFile): void;
}>();

const { t } = useI18n();

const activeTool = ref<'brush' | 'eraser'>('brush');
const brushSize = ref(25);
const prompt = ref('');
const operation = ref<'replace-object' | 'remove-object' | 'inpaint' | 'edit'>('replace-object');
const selectedModel = ref('flux2-klein-4b');
const isGenerating = ref(false);
const errorMessage = ref('');

const activeTab = ref<'editor' | 'before-after' | 'history'>('editor');
const editedPreviewUrl = ref<string | null>(null);
const currentAsset = ref<MediaFile | null>(null);
const versions = ref<MediaAssetVersion[]>([]);

const canvasRef = ref<HTMLCanvasElement>();
const isDrawing = ref(false);
let ctx: CanvasRenderingContext2D | null = null;
let imageObj: HTMLImageElement | null = null;

watch(
  () => props.isOpen,
  async (open) => {
    if (open && props.media) {
      currentAsset.value = { ...props.media };
      editedPreviewUrl.value = null;
      prompt.value = '';
      errorMessage.value = '';
      activeTab.value = 'editor';
      await loadVersions();
      await nextTick();
      initCanvas();
    }
  }
);

async function loadVersions() {
  if (!props.media?.id) return;
  try {
    const res = await api.get<MediaAssetVersion[]>(`/media/assets/${props.media.id}/versions`);
    versions.value = res;
  } catch {
    versions.value = [];
  }
}

function initCanvas() {
  const canvas = canvasRef.value;
  if (!canvas || !currentAsset.value?.previewUrl) return;
  ctx = canvas.getContext('2d');
  if (!ctx) return;

  imageObj = new Image();
  imageObj.crossOrigin = 'anonymous';
  imageObj.src = currentAsset.value.previewUrl;
  imageObj.onload = () => {
    if (!canvas || !ctx || !imageObj) return;
    canvas.width = imageObj.naturalWidth || 800;
    canvas.height = imageObj.naturalHeight || 800;
    clearMask();
  };
}

function clearMask() {
  if (!ctx || !canvasRef.value) return;
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
}

function startDrawing(e: MouseEvent) {
  isDrawing.value = true;
  draw(e);
}

function stopDrawing() {
  isDrawing.value = false;
  if (ctx) ctx.beginPath();
}

function draw(e: MouseEvent) {
  if (!isDrawing.value || !ctx || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const scaleX = canvasRef.value.width / rect.width;
  const scaleY = canvasRef.value.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  ctx.lineWidth = brushSize.value * scaleX;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (activeTool.value === 'brush') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 65, 84, 0.65)';
    ctx.fillStyle = 'rgba(255, 65, 84, 0.65)';
  } else {
    ctx.globalCompositeOperation = 'destination-out';
  }

  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
}

async function handleGeneratePreview() {
  if (!props.media?.id) return;
  if (!prompt.value.trim() && operation.value !== 'remove-object') {
    errorMessage.value = 'Please enter an edit prompt';
    return;
  }

  isGenerating.value = true;
  errorMessage.value = '';

  try {
    const maskData = canvasRef.value ? canvasRef.value.toDataURL('image/png') : undefined;
    const finalPrompt =
      operation.value === 'remove-object' && !prompt.value.trim()
        ? 'Seamlessly remove the selected object and fill natural background'
        : prompt.value;

    const res = await api.post<{ asset: MediaFile; version: MediaAssetVersion }>(
      `/media/assets/${props.media.id}/edit`,
      {
        prompt: finalPrompt,
        maskData,
        operation: operation.value,
        model: selectedModel.value
      }
    );

    currentAsset.value = res.asset;
    editedPreviewUrl.value = res.asset.previewUrl || null;
    activeTab.value = 'before-after';
    await loadVersions();
  } catch (err: any) {
    errorMessage.value = err.message || 'Image editing failed';
  } finally {
    isGenerating.value = false;
  }
}

async function handleRestoreVersion(versionId: string) {
  if (!props.media?.id) return;
  try {
    const restored = await api.post<MediaFile>(`/media/assets/${props.media.id}/restore`, {
      versionId
    });
    currentAsset.value = restored;
    editedPreviewUrl.value = restored.previewUrl || null;
    initCanvas();
  } catch (err: any) {
    errorMessage.value = err.message || 'Failed to restore version';
  }
}

function handleApply() {
  if (currentAsset.value) {
    emit('applied', currentAsset.value);
    emit('close');
  }
}
</script>

<template>
  <div v-if="isOpen && media" class="modal image-editor-modal" @click.self="emit('close')">
    <div class="image-editor-dialog">
      <!-- Header -->
      <div class="editor-modal-header">
        <div class="editor-title-wrap">
          <span class="tool-badge">IMAGE EDITOR</span>
          <h3>{{ t('media.editImage') || 'Edit Image & Inpainting' }}</h3>
        </div>
        <div class="modal-tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'editor' }"
            @click="activeTab = 'editor'"
          >
            🎨 {{ t('media.brushEditor') || 'Brush & Mask' }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'before-after' }"
            :disabled="!editedPreviewUrl"
            @click="activeTab = 'before-after'"
          >
            ⚖ {{ t('media.compare') || 'Before / After' }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'history' }"
            @click="activeTab = 'history'"
          >
            🕒 {{ t('media.history') || 'Versions' }} ({{ versions.length }})
          </button>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- Error box -->
      <div v-if="errorMessage" class="error-strip">
        {{ errorMessage }}
      </div>

      <!-- Main Body -->
      <div class="editor-modal-body">
        <!-- TAB 1: Editor Viewport -->
        <div v-show="activeTab === 'editor'" class="canvas-workbench">
          <div class="canvas-wrapper">
            <img
              v-if="currentAsset?.previewUrl"
              :src="currentAsset.previewUrl"
              class="underlay-img"
              alt="Source"
            />
            <canvas
              ref="canvasRef"
              class="drawing-mask-canvas"
              @mousedown="startDrawing"
              @mouseup="stopDrawing"
              @mouseleave="stopDrawing"
              @mousemove="draw"
            ></canvas>
          </div>

          <div class="canvas-footer-hint">
            💡 {{ t('media.brushHint') || 'Use the brush tool to highlight the object or region you want to edit or remove.' }}
          </div>
        </div>

        <!-- TAB 2: Before / After Viewport -->
        <div v-show="activeTab === 'before-after'" class="compare-workbench">
          <div class="compare-grid">
            <div class="compare-card">
              <span class="compare-label">ORIGINAL</span>
              <img :src="media.previewUrl" alt="Original" class="compare-img" />
            </div>
            <div class="compare-card">
              <span class="compare-label active">EDITED PREVIEW</span>
              <img
                v-if="editedPreviewUrl"
                :src="editedPreviewUrl"
                alt="Edited"
                class="compare-img"
              />
            </div>
          </div>
        </div>

        <!-- TAB 3: Versions History Viewport -->
        <div v-show="activeTab === 'history'" class="history-workbench">
          <h4>{{ t('media.versionHistory') || 'Edit Version History' }}</h4>
          <div v-if="versions.length === 0" class="no-history">
            {{ t('media.noVersions') || 'No previous edits found for this asset.' }}
          </div>
          <div v-else class="version-list">
            <div v-for="v in versions" :key="v.id" class="version-item">
              <div class="version-info">
                <span class="version-op">{{ v.operation.toUpperCase() }}</span>
                <strong>{{ v.prompt || 'Original generation' }}</strong>
                <small>{{ new Date(v.createdAt).toLocaleTimeString() }} • {{ v.model || 'FLUX.2' }}</small>
              </div>
              <button class="restore-btn" @click="handleRestoreVersion(v.id)">
                ↺ {{ t('media.restore') || 'Restore' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Right Control Panel -->
        <div class="editor-controls-panel">
          <!-- Tools -->
          <div class="control-group">
            <label>{{ t('media.tool') || 'Drawing Tool' }}</label>
            <div class="tool-toggle-row">
              <button
                class="tool-btn"
                :class="{ active: activeTool === 'brush' }"
                @click="activeTool = 'brush'"
              >
                🖌 Brush Mask
              </button>
              <button
                class="tool-btn"
                :class="{ active: activeTool === 'eraser' }"
                @click="activeTool = 'eraser'"
              >
                🧹 Eraser
              </button>
              <button class="tool-btn clear" @click="clearMask">
                ✕ Reset
              </button>
            </div>
          </div>

          <!-- Brush Size -->
          <div class="control-group">
            <div class="flex-between">
              <label>{{ t('media.brushSize') || 'Brush Size' }}</label>
              <span class="mono size-text">{{ brushSize }}px</span>
            </div>
            <input
              v-model.number="brushSize"
              type="range"
              min="5"
              max="80"
              class="brush-slider"
            />
          </div>

          <!-- Operation -->
          <div class="control-group">
            <label>{{ t('media.operation') || 'Edit Operation' }}</label>
            <select v-model="operation" class="control-select">
              <option value="replace-object">Thay đổi vật thể (Replace Object)</option>
              <option value="remove-object">Xóa vật thể (Remove Object)</option>
              <option value="inpaint">Vẽ đè inpaint (Inpaint Region)</option>
              <option value="edit">Chỉnh sửa chung (General Edit)</option>
            </select>
          </div>

          <!-- Prompt -->
          <div class="control-group">
            <label>{{ t('media.editPrompt') || 'Prompt chỉnh sửa' }}</label>
            <textarea
              v-model="prompt"
              rows="3"
              class="control-textarea"
              :placeholder="
                operation === 'remove-object'
                  ? 'Tùy chọn: Xóa vật thể và bù nền tự nhiên...'
                  : 'Ví dụ: Đổi chiếc xe thành xe thể thao màu xanh neon...'
              "
            ></textarea>
          </div>

          <!-- Model -->
          <div class="control-group">
            <label>{{ t('media.model') || 'Model' }}</label>
            <select v-model="selectedModel" class="control-select">
              <option value="flux2-klein-4b">FLUX.2 [klein] 4B (ComfyUI Local)</option>
              <option value="sdxl">Stable Diffusion XL 1.0 (ComfyUI Local)</option>
            </select>
          </div>

          <!-- Action Buttons -->
          <div class="panel-action-footer">
            <button
              class="primary generate-preview-btn"
              :disabled="isGenerating"
              @click="handleGeneratePreview"
            >
              <span v-if="isGenerating">⏳ Generating preview...</span>
              <span v-else>✨ {{ t('media.generatePreview') || 'Generate Edited Preview' }}</span>
            </button>

            <button
              v-if="editedPreviewUrl"
              class="apply-btn"
              @click="handleApply"
            >
              ✔ {{ t('media.applyVersion') || 'Apply Version to Canvas' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-editor-dialog {
  width: min(1140px, 94vw);
  max-height: 90vh;
  background: #121620;
  border: 1px solid #293244;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 35px 100px #000000cc;
  overflow: hidden;
}

.editor-modal-header {
  padding: 14px 20px;
  border-bottom: 1px solid #222938;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0d1017;
  gap: 12px;
}

.editor-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editor-title-wrap h3 {
  margin: 0;
  font-size: 15px;
}

.tool-badge {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  background: #25233e;
  color: var(--violet);
}

.modal-tabs {
  display: flex;
  background: #171c26;
  border: 1px solid #293244;
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

.tab-btn {
  border: 0;
  background: transparent;
  padding: 6px 12px;
  font-size: 11px;
  border-radius: 5px;
  color: #929bb0;
}

.tab-btn.active {
  background: #232b3a;
  color: #fff;
  font-weight: 600;
}

.tab-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.error-strip {
  background: #381a22;
  border-bottom: 1px solid #662d3a;
  color: #ff9eaa;
  padding: 8px 18px;
  font-size: 12px;
}

.editor-modal-body {
  display: grid;
  grid-template-columns: 1fr 330px;
  min-height: 520px;
  max-height: calc(90vh - 65px);
}

.canvas-workbench {
  background: #090b10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: auto;
}

.canvas-wrapper {
  position: relative;
  max-width: 90%;
  max-height: 65vh;
  display: inline-block;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 40px #000000aa;
}

.underlay-img {
  display: block;
  max-width: 100%;
  max-height: 65vh;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.drawing-mask-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.canvas-footer-hint {
  margin-top: 12px;
  font-size: 11px;
  color: #798396;
}

.compare-workbench {
  background: #090b10;
  padding: 24px;
  display: grid;
  place-items: center;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  max-width: 100%;
}

.compare-card {
  background: #131722;
  border: 1px solid #232c3d;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.compare-label {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #202736;
  color: #8c97ad;
}

.compare-label.active {
  background: #1b2f1f;
  color: var(--lime);
}

.compare-img {
  max-width: 100%;
  max-height: 48vh;
  object-fit: contain;
  border-radius: 6px;
}

.history-workbench {
  background: #090b10;
  padding: 24px;
  overflow-y: auto;
}

.history-workbench h4 {
  margin: 0 0 16px;
  font-size: 13px;
}

.version-list {
  display: grid;
  gap: 10px;
}

.version-item {
  background: #131824;
  border: 1px solid #242d3e;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.version-info {
  display: grid;
  gap: 3px;
}

.version-op {
  font-family: 'Space Mono', monospace;
  font-size: 8px;
  color: var(--lime);
}

.version-info strong {
  font-size: 12px;
  color: #e5e9f2;
}

.version-info small {
  color: #798396;
  font-size: 10px;
}

.restore-btn {
  padding: 6px 10px;
  font-size: 11px;
}

.editor-controls-panel {
  border-left: 1px solid #222938;
  background: #10141c;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.control-group {
  display: grid;
  gap: 6px;
}

.control-group label {
  font-size: 11px;
  color: #8f99ad;
  font-weight: 600;
}

.tool-toggle-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 4px;
}

.tool-btn {
  padding: 7px 8px;
  font-size: 11px;
  border-radius: 6px;
  background: #161b26;
  border: 1px solid #283144;
}

.tool-btn.active {
  background: #232c3f;
  border-color: var(--lime);
  color: #fff;
}

.tool-btn.clear {
  color: #ff8295;
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.size-text {
  font-size: 10px;
  color: var(--lime);
}

.brush-slider {
  width: 100%;
  accent-color: var(--lime);
}

.control-select,
.control-textarea {
  width: 100%;
  background: #090c12;
  border: 1px solid #262f40;
  border-radius: 6px;
  color: #e4e8f0;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
}

.control-select:focus,
.control-textarea:focus {
  border-color: #5e6c87;
}

.panel-action-footer {
  margin-top: auto;
  display: grid;
  gap: 8px;
  padding-top: 14px;
}

.generate-preview-btn {
  padding: 11px;
  font-size: 12px;
}

.apply-btn {
  background: #1f3724;
  border-color: #3b6844;
  color: #a7f692;
  padding: 10px;
  font-weight: 700;
  font-size: 12px;
}

.apply-btn:hover {
  background: #2a4c32;
}

@media (max-width: 960px) {
  .editor-modal-body {
    grid-template-columns: 1fr;
  }
}
</style>
