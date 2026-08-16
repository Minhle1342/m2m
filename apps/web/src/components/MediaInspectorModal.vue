<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from '../services/i18n';
import type { MediaFile } from '../types';

const props = defineProps<{
  media: MediaFile | null;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit', media: MediaFile): void;
  (e: 'regenerate', media: MediaFile): void;
  (e: 'delete', media: MediaFile): void;
}>();

const { t, locale } = useI18n();
const isVi = computed(() => locale.value === 'vi');
const isPlaying = ref(true);
const videoRef = ref<HTMLVideoElement>();
const zoomLevel = ref(1);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      zoomLevel.value = 1;
      isPlaying.value = true;
    }
  }
);

function zoomIn() {
  zoomLevel.value = Math.min(3, +(zoomLevel.value + 0.25).toFixed(2));
}

function zoomOut() {
  zoomLevel.value = Math.max(0.5, +(zoomLevel.value - 0.25).toFixed(2));
}

function resetZoom() {
  zoomLevel.value = 1;
}

const formattedSize = computed(() => {
  if (!props.media?.sizeBytes) return 'N/A';
  const kb = props.media.sizeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
});

function handleDownload() {
  if (!props.media?.previewUrl) return;
  const a = document.createElement('a');
  a.href = props.media.previewUrl;
  a.download = props.media.filename || `media_${props.media.id}.${props.media.type === 'video' ? 'mp4' : 'png'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
</script>

<template>
  <div v-if="isOpen && media" class="modal media-inspector-modal" @click.self="emit('close')">
    <div class="media-inspector-dialog">
      <div class="inspector-header">
        <div class="inspector-title">
          <span class="media-type-badge">{{ media.type.toUpperCase() }}</span>
          <h3>{{ media.filename || media.id }}</h3>
        </div>
        <button class="close-btn" :title="isVi ? 'Đóng (Esc)' : 'Close (Esc)'" @click="emit('close')">✕</button>
      </div>

      <div class="inspector-body">
        <!-- Media Viewport -->
        <div class="media-viewport">
          <template v-if="media.type === 'video'">
            <div class="video-container">
              <video
                ref="videoRef"
                :src="media.previewUrl"
                controls
                autoplay
                loop
                playsinline
                class="main-video-player"
                @play="isPlaying = true"
                @pause="isPlaying = false"
              ></video>
            </div>
          </template>
          <template v-else>
            <div class="image-container">
              <img
                :src="media.previewUrl"
                :alt="media.id"
                class="main-image-view"
                :style="{ transform: `scale(${zoomLevel})` }"
              />
              <div class="image-zoom-controls">
                <button :title="isVi ? 'Thu nhỏ' : 'Zoom Out'" @click="zoomOut">−</button>
                <span class="zoom-level-label" @click="resetZoom">{{ Math.round(zoomLevel * 100) }}%</span>
                <button :title="isVi ? 'Phóng to' : 'Zoom In'" @click="zoomIn">+</button>
                <button :title="isVi ? 'Đặt lại' : 'Reset Zoom'" class="reset-btn" @click="resetZoom">↺</button>
              </div>
            </div>
          </template>
        </div>

        <!-- Metadata & Actions Sidebar -->
        <div class="inspector-sidebar">
          <div class="meta-section">
            <h4>{{ isVi ? 'Thông số kỹ thuật' : (t('common.details') || 'Metadata & Specs') }}</h4>
            <dl class="meta-list">
              <div class="meta-item">
                <dt>Asset ID</dt>
                <dd class="mono">{{ media.id }}</dd>
              </div>
              <div v-if="media.provider" class="meta-item">
                <dt>Provider</dt>
                <dd>{{ media.provider }}</dd>
              </div>
              <div v-if="media.model" class="meta-item">
                <dt>Model</dt>
                <dd><span class="model-pill">{{ media.model }}</span></dd>
              </div>
              <div v-if="media.width && media.height" class="meta-item">
                <dt>Resolution</dt>
                <dd>{{ media.width }} × {{ media.height }}</dd>
              </div>
              <div v-if="media.durationMs" class="meta-item">
                <dt>Duration</dt>
                <dd>{{ (media.durationMs / 1000).toFixed(1) }}s</dd>
              </div>
              <div v-if="media.fps" class="meta-item">
                <dt>FPS</dt>
                <dd>{{ media.fps }} fps</dd>
              </div>
              <div class="meta-item">
                <dt>File Size</dt>
                <dd>{{ formattedSize }}</dd>
              </div>
              <div v-if="media.seed" class="meta-item">
                <dt>Seed</dt>
                <dd class="mono">{{ media.seed }}</dd>
              </div>
            </dl>
          </div>

          <div class="inspector-actions">
            <button
              v-if="media.type === 'image'"
              class="primary action-btn"
              @click="emit('edit', media)"
            >
              ✎ {{ t('media.editImage') || 'Edit Image / Inpaint' }}
            </button>
            <button class="action-btn" @click="handleDownload">
              ⬇ {{ t('media.download') || 'Download' }}
            </button>
            <button class="action-btn" @click="emit('regenerate', media)">
              ↻ {{ t('media.regenerate') || 'Regenerate' }}
            </button>
            <button class="action-btn danger" @click="emit('delete', media)">
              🗑 {{ t('media.deleteMedia') || 'Delete Media' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-inspector-dialog {
  width: min(1040px, 92vw);
  max-height: 88vh;
  background: #131720;
  border: 1px solid #2d3648;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 90px #000000bd;
  overflow: hidden;
}

.inspector-header {
  padding: 16px 22px;
  border-bottom: 1px solid #232a38;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0f121a;
}

.inspector-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inspector-title h3 {
  margin: 0;
  font-size: 16px;
  color: #f1f3f9;
}

.media-type-badge {
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  background: #232d42;
  color: var(--lime);
}

.close-btn {
  border: 0;
  background: transparent;
  color: #8b95a8;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.close-btn:hover {
  background: #232b3c;
  color: #fff;
}

.inspector-body {
  display: grid;
  grid-template-columns: 1fr 310px;
  min-height: 480px;
  max-height: calc(88vh - 65px);
}

.media-viewport {
  background: #090c12;
  display: grid;
  place-items: center;
  padding: 20px;
  overflow: auto;
}

.image-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.main-image-view {
  max-width: 100%;
  max-height: 58vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 10px 40px #00000099;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center center;
}

.image-zoom-controls {
  position: absolute;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 20, 30, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 4px 8px;
  border-radius: 20px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.image-zoom-controls button {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #232c3d;
  border: 1px solid #37455e;
  color: #fff;
  font-size: 14px;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.image-zoom-controls button:hover {
  background: #334057;
  border-color: #526588;
}

.zoom-level-label {
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  color: #94a3b8;
  padding: 0 6px;
  min-width: 42px;
  text-align: center;
  cursor: pointer;
}

.image-zoom-controls button.reset-btn {
  font-size: 12px;
  color: var(--lime, #3bf49c);
}

.video-container {
  width: 100%;
  max-width: 640px;
  display: flex;
  justify-content: center;
}

.main-video-player {
  width: 100%;
  max-height: 60vh;
  border-radius: 8px;
  background: #000;
}

.inspector-sidebar {
  border-left: 1px solid #232a38;
  background: #11151e;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow-y: auto;
}

.meta-section h4 {
  font-size: 11px;
  font-family: 'Space Mono', monospace;
  text-transform: uppercase;
  color: #798396;
  margin: 0 0 14px;
  letter-spacing: 1px;
}

.meta-list {
  margin: 0;
  display: grid;
  gap: 12px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid #1c222f;
  padding-bottom: 8px;
}

.meta-item dt {
  color: #8b95a8;
}

.meta-item dd {
  margin: 0;
  color: #e2e6f0;
  font-weight: 500;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-pill {
  background: #1c2332;
  border: 1px solid #2e394e;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  color: #b0b9cf;
}

.inspector-actions {
  display: grid;
  gap: 8px;
  margin-top: 24px;
}

.action-btn {
  width: 100%;
  padding: 9px 12px;
  font-size: 12px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.action-btn.danger {
  color: #ff7d92;
  border-color: #53242e;
  background: #241419;
}

.action-btn.danger:hover {
  background: #391c25;
  border-color: #833544;
}

@media (max-width: 860px) {
  .inspector-body {
    grid-template-columns: 1fr;
  }
}
</style>
