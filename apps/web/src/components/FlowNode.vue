<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import { useI18n } from '../services/i18n';
import type { NodeType, MediaFile } from '../types';

const props = defineProps<
  NodeProps<{
    name: string;
    nodeType: string;
    metadata?: NodeType;
    status?: string;
    media?: MediaFile;
    mediaDeleted?: boolean;
    assistantPreview?: 'added' | 'modified' | 'removed' | 'unchanged';
  }>
>();

const { tNodeName, t, locale } = useI18n();
const isVi = computed(() => locale.value === 'vi');

const media = computed(() => props.data.media);
const isImage = computed(() => media.value?.type === 'image');
const isVideo = computed(() => media.value?.type === 'video');
const assistantPreviewLabel = computed(() => {
  if (props.data.assistantPreview === 'added') return isVi.value ? 'Thêm mới' : 'Added';
  if (props.data.assistantPreview === 'modified') return isVi.value ? 'Đã sửa' : 'Changed';
  if (props.data.assistantPreview === 'removed') return isVi.value ? 'Sẽ xóa' : 'Removed';
  return '';
});

const miniVideoRef = ref<HTMLVideoElement>();

function playMiniVideo() {
  miniVideoRef.value?.play().catch(() => {});
}

function pauseMiniVideo() {
  miniVideoRef.value?.pause();
}

function handleAction(event: string, e: Event, extra?: Record<string, unknown>) {
  e.stopPropagation();
  window.dispatchEvent(
    new CustomEvent('flow-node-media-action', {
      detail: {
        action: event,
        nodeId: props.id,
        media: media.value,
        ...extra
      }
    })
  );
}
</script>

<template>
  <div
    class="flow-node"
    :class="[
      data.status,
      data.assistantPreview ? `assistant-preview-${data.assistantPreview}` : '',
      { 'has-media': Boolean(media && !data.mediaDeleted) }
    ]"
  >
    <span v-if="assistantPreviewLabel" class="assistant-preview-badge">{{ assistantPreviewLabel }}</span>
    <Handle v-if="(data.metadata?.inputs ?? 1) > 0" type="target" :position="Position.Left" />

    <!-- Main Node Header -->
    <div class="node-main-row">
      <div class="node-symbol">
        {{
          data.metadata?.category === 'trigger'
            ? '▶'
            : data.metadata?.category === 'ai'
              ? '✦'
              : data.metadata?.category === 'media'
                ? isVideo
                  ? '🎬'
                  : '🖼'
                : data.metadata?.category === 'data'
                  ? '{}'
                  : '⌁'
        }}
      </div>
      <div class="node-text">
        <strong>{{ data.name }}</strong>
        <small>{{ tNodeName(data.nodeType, data.metadata?.displayName || data.nodeType) }}</small>
      </div>
      <span v-if="data.status" class="node-state">{{ data.status }}</span>

      <!-- Run from this node button -->
      <button
        v-if="!data.assistantPreview"
        class="node-run-btn"
        :class="{ running: data.status === 'running' }"
        :title="isVi ? 'Chạy tiếp tục từ node này đến cuối quy trình' : 'Execute workflow starting from this node to end'"
        :disabled="data.status === 'running'"
        @click="(e) => handleAction('run-from-node', e)"
      >
        <span v-if="data.status === 'running'" class="run-spinner">⏳</span>
        <span v-else class="run-icon">▶</span>
      </button>
    </div>

    <!-- Media Canvas Preview Area (Click to Zoom) -->
    <div
      v-if="media && !data.mediaDeleted"
      class="canvas-media-card"
      :title="isVi ? 'Bấm để phóng to và xem toàn màn hình' : 'Click to zoom and view full size'"
      @click="(e) => handleAction('view', e)"
    >
      <!-- Media Header Tag -->
      <div class="media-card-header-badge">
        <span class="type-tag">{{ isVideo ? '🎬 Video' : '🖼 Image' }}</span>
        <span v-if="media.width && media.height" class="media-res">{{ media.width }}×{{ media.height }}</span>
      </div>

      <!-- Image Thumbnail -->
      <div v-if="isImage" class="media-thumb-wrap">
        <img :src="media.previewUrl" :alt="media.id" class="node-thumb-img" loading="lazy" />
        <div class="zoom-hint-pill">🔍 {{ isVi ? 'Bấm để phóng to' : 'Click to Zoom' }}</div>

      </div>

      <!-- Video Thumbnail / Player -->
      <div
        v-else-if="isVideo"
        class="media-thumb-wrap video"
        @mouseenter="playMiniVideo"
        @mouseleave="pauseMiniVideo"
      >
        <video
          ref="miniVideoRef"
          :src="media.previewUrl"
          preload="metadata"
          muted
          playsinline
          loop
          class="node-thumb-video"
        ></video>
        <div class="video-play-indicator">▶</div>
        <div class="zoom-hint-pill">🔍 {{ isVi ? 'Bấm để phóng to video' : 'Click to Zoom Video' }}</div>
        <span v-if="media.durationMs" class="video-duration-pill">{{ (media.durationMs / 1000).toFixed(0) }}s</span>

      </div>
    </div>

    <!-- Deleted Notice -->
    <div v-if="data.mediaDeleted" class="media-deleted-notice">
      <small>⚠️ {{ t('media.mediaDeletedNotice') || 'Media deleted' }}</small>
      <button class="regen-link" @click="(e) => handleAction('regenerate', e)">↻ {{ t('media.regenerate') || 'Regenerate' }}</button>
    </div>

    <!-- Right Handles -->
    <template v-if="data.metadata?.outputNames?.length">
      <Handle
        v-for="(name, index) in data.metadata.outputNames"
        :id="name"
        :key="name"
        type="source"
        :position="Position.Right"
        :title="name"
        :style="{ top: `${((index + 1) / (data.metadata.outputNames.length + 1)) * 100}%` }"
      />
    </template>
    <Handle v-else-if="(data.metadata?.outputs ?? 1) > 0" type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.flow-node {
  position: relative;
  min-width: 180px;
  background: #171b23;
  border: 1px solid #3a4251;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 7px 22px #0007;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.flow-node.assistant-preview-added {
  border-color: #3bf49c;
  box-shadow: 0 0 0 2px rgba(59, 244, 156, 0.2), 0 10px 30px rgba(24, 180, 110, 0.24);
}

.flow-node.assistant-preview-modified {
  border-color: #f6c85f;
  box-shadow: 0 0 0 2px rgba(246, 200, 95, 0.18), 0 10px 30px rgba(180, 130, 30, 0.2);
}

.flow-node.assistant-preview-removed {
  border-color: #ff6b7a;
  border-style: dashed;
  opacity: 0.62;
  filter: grayscale(0.45);
}

.flow-node.assistant-preview-unchanged {
  opacity: 0.52;
}

.assistant-preview-badge {
  position: absolute;
  top: -10px;
  right: -8px;
  z-index: 2;
  padding: 2px 7px;
  border-radius: 999px;
  background: #101722;
  border: 1px solid currentColor;
  color: #dce8fa;
  font-family: 'Space Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  box-shadow: 0 3px 10px #0008;
}

.assistant-preview-added .assistant-preview-badge { color: #3bf49c; }
.assistant-preview-modified .assistant-preview-badge { color: #f6c85f; }
.assistant-preview-removed .assistant-preview-badge { color: #ff6b7a; }

.flow-node.has-media {
  min-width: 220px;
  background: #151a24;
  border-color: #43516c;
}

.flow-node:hover {
  border-color: #5d6f94;
  box-shadow: 0 10px 28px #00000088;
}

.node-main-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-symbol {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #232a38;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: #e2e8f0;
}

.node-text {
  min-width: 0;
  flex: 1;
}

.node-text strong {
  display: block;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #f1f5f9;
}

.node-text small {
  display: block;
  color: #8b95a8;
  font-size: 10px;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-state {
  font-size: 9px;
  font-family: 'Space Mono', monospace;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background: #2b3548;
  color: #93c5fd;
}

.node-run-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  background: rgba(59, 244, 156, 0.12);
  border: 1px solid rgba(59, 244, 156, 0.35);
  color: #3bf49c;
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  line-height: 1;
  flex-shrink: 0;
  margin-left: 2px;
}

.node-run-btn:hover:not(:disabled) {
  background: #3bf49c;
  color: #0b0e14;
  border-color: #3bf49c;
  box-shadow: 0 0 10px rgba(59, 244, 156, 0.5);
  transform: scale(1.12);
}

.node-run-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.node-run-btn.running {
  background: rgba(234, 179, 8, 0.18);
  border-color: rgba(234, 179, 8, 0.5);
  color: #facc15;
  cursor: not-allowed;
  animation: pulse-spin 1.2s infinite ease-in-out;
}

.node-run-btn .run-icon {
  font-size: 10px;
  transform: translateX(1px);
}

@keyframes pulse-spin {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.95); }
}

.canvas-media-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0b0e14;
  border: 1px solid #2d384e;
  margin-top: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.canvas-media-card:hover {
  border-color: var(--lime, #3bf49c);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.media-card-header-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #111622;
  border-bottom: 1px solid #232c3d;
  font-size: 10px;
  font-family: 'Space Mono', monospace;
}

.type-tag {
  color: var(--lime, #3bf49c);
  font-weight: 600;
}

.media-res {
  color: #717d96;
}

.media-thumb-wrap {
  position: relative;
  width: 100%;
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #080a0f;
  overflow: hidden;
}

.node-thumb-img,
.node-thumb-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.25s ease;
}

.media-thumb-wrap:hover .node-thumb-img,
.media-thumb-wrap:hover .node-thumb-video {
  transform: scale(1.04);
}

.zoom-hint-pill {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  color: #f1f5f9;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  pointer-events: none;
  opacity: 0.85;
  transition: opacity 0.15s ease;
}



.video-play-indicator {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #000000bb;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
  border: 1px solid #ffffff44;
  pointer-events: none;
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.media-thumb-wrap.video:hover .video-play-indicator {
  transform: scale(1.1);
  background: rgba(59, 244, 156, 0.3);
}

.video-duration-pill {
  position: absolute;
  right: 8px;
  bottom: 8px;
  background: #000000cc;
  color: var(--lime, #3bf49c);
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}




.media-deleted-notice {
  padding: 6px 8px;
  border-radius: 6px;
  background: #23181d;
  border: 1px dashed #642935;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.regen-link {
  border: 0;
  background: transparent;
  color: var(--lime, #3bf49c);
  font-size: 10px;
  padding: 2px 4px;
  cursor: pointer;
}
</style>
