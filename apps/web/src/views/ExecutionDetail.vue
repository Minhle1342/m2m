<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, json } from '../services/api';
import { useAppStore } from '../stores/app';
import { useI18n } from '../services/i18n';
import type { Execution, NodeExecution } from '../types';

const route = useRoute(),
  router = useRouter(),
  app = useAppStore(),
  execution = ref<Execution>(),
  selected = ref<NodeExecution>(),
  source = ref<EventSource>(),
  copiedKey = ref<string | null>(null);

const { t, locale } = useI18n();
const isVi = computed(() => locale.value === 'vi');

const duration = computed(() =>
  execution.value?.startedAt && execution.value.finishedAt
    ? new Date(execution.value.finishedAt).getTime() - new Date(execution.value.startedAt).getTime()
    : null
);

async function load() {
  const latest = await api<Execution>(`/executions/${route.params.id}`);
  execution.value = latest;
  selected.value = selected.value ? latest.nodes?.find(n => n.id === selected.value?.id) : latest.nodes?.[0];
}

function listen() {
  source.value = new EventSource(`/api/v1/executions/${route.params.id}/events`);
  ['execution.started', 'node.started', 'node.completed', 'node.failed', 'execution.completed', 'execution.failed'].forEach(
    name => source.value?.addEventListener(name, () => void load())
  );
}

async function retry() {
  const run = await api<Execution>(`/executions/${route.params.id}/retry`, json('POST'));
  app.notify(t('executions.retryQueued'));
  router.push(`/executions/${run.id}`);
}

async function copyContent(key: string, data: unknown) {
  if (data === undefined || data === null) {
    app.fail(new Error(isVi.value ? 'Không có dữ liệu để sao chép' : 'No data to copy'));
    return;
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 2000);
    app.notify(isVi.value ? 'Đã sao chép vào bộ nhớ tạm!' : 'Copied to clipboard!');
  } catch {
    app.fail(new Error(isVi.value ? 'Không thể sao chép văn bản' : 'Failed to copy text'));
  }
}

function copyAllDebug() {
  if (!execution.value) return;
  const allDebugInfo = {
    workflowId: execution.value.workflowId,
    executionId: execution.value.id,
    mode: execution.value.mode,
    status: execution.value.status,
    createdAt: execution.value.createdAt,
    durationMs: duration.value,
    executionError: execution.value.error,
    selectedNode: selected.value
      ? {
          nodeId: selected.value.nodeId,
          nodeName: selected.value.nodeName,
          status: selected.value.status,
          attempt: selected.value.attempt,
          durationMs: selected.value.durationMs,
          input: selected.value.input,
          output: selected.value.output,
          error: selected.value.error
        }
      : null,
    allNodes: execution.value.nodes?.map((n) => ({
      nodeId: n.nodeId,
      nodeName: n.nodeName,
      status: n.status,
      durationMs: n.durationMs,
      error: n.error
    }))
  };
  void copyContent('all-debug', allDebugInfo);
}

onMounted(async () => {
  try {
    await load();
    if (!['success', 'failed', 'cancelled'].includes(execution.value?.status ?? '')) listen();
  } catch (e) {
    app.fail(e);
  }
});

onBeforeUnmount(() => source.value?.close());
</script>

<template>
  <section v-if="execution" class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('executions.detailEyebrow') }}</p>
        <h1>
          <span class="status" :class="execution.status">{{ execution.status }}</span>
          {{ execution.id.slice(0, 8) }}
        </h1>
        <p>
          {{ execution.mode }} · {{ new Date(execution.createdAt).toLocaleString() }} ·
          {{ duration === null ? 'running' : duration + ' ms' }}
        </p>
      </div>
      <div class="page-actions">
        <button class="copy-debug-header-btn" @click="copyAllDebug">
          {{ copiedKey === 'all-debug' ? (isVi ? '✓ Đã chép Debug' : '✓ Copied Debug') : (isVi ? '📋 Sao chép toàn bộ Debug' : '📋 Copy Full Debug') }}
        </button>
        <button @click="retry">{{ t('executions.retry') }}</button>
      </div>
    </header>

    <div v-if="execution.error" class="error-box">
      <div class="block-header">
        <strong>{{ t('executions.failed') }}</strong>
        <button class="mini-copy-btn error-btn" @click="copyContent('exec-error', execution.error)">
          {{ copiedKey === 'exec-error' ? (isVi ? '✓ Đã chép lỗi' : '✓ Copied error') : (isVi ? '📋 Sao chép lỗi' : '📋 Copy error') }}
        </button>
      </div>
      <pre>{{ JSON.stringify(execution.error, null, 2) }}</pre>
    </div>

    <div class="execution-grid">
      <aside class="node-timeline">
        <button
          v-for="node in execution.nodes"
          :key="node.id"
          :class="['timeline-node', node.status, { selected: selected?.id === node.id }]"
          @click="selected = node"
        >
          <span></span>
          <div>
            <strong>{{ node.nodeName }}</strong>
            <small>{{ t('executions.attempt') }} {{ node.attempt }} · {{ node.durationMs ?? '—' }} ms</small>
          </div>
        </button>
      </aside>

      <div v-if="selected" class="inspector">
        <div class="inspector-head">
          <h2>{{ selected.nodeName }}</h2>
          <button class="mini-copy-btn" @click="copyContent('node-all', selected)">
            {{ copiedKey === 'node-all' ? (isVi ? '✓ Đã chép node' : '✓ Copied node') : (isVi ? '📋 Chép toàn bộ node này' : '📋 Copy this node') }}
          </button>
        </div>

        <div class="inspect-block">
          <div class="block-header">
            <label>{{ t('executions.input') }} (ĐẦU VÀO)</label>
            <button class="mini-copy-btn" :disabled="!selected.input" @click="copyContent('input', selected.input)">
              {{ copiedKey === 'input' ? (isVi ? '✓ Đã chép' : '✓ Copied') : (isVi ? '📋 Sao chép' : '📋 Copy') }}
            </button>
          </div>
          <pre>{{ JSON.stringify(selected.input, null, 2) }}</pre>
        </div>

        <div class="inspect-block">
          <div class="block-header">
            <label>{{ t('executions.output') }} (ĐẦU RA)</label>
            <button class="mini-copy-btn" :disabled="!selected.output" @click="copyContent('output', selected.output)">
              {{ copiedKey === 'output' ? (isVi ? '✓ Đã chép' : '✓ Copied') : (isVi ? '📋 Sao chép' : '📋 Copy') }}
            </button>
          </div>
          <pre>{{ JSON.stringify(selected.output, null, 2) }}</pre>
        </div>

        <div v-if="selected.error" class="inspect-block error">
          <div class="block-header">
            <label>{{ t('executions.error') }} (LỖI)</label>
            <button class="mini-copy-btn error-btn" @click="copyContent('error', selected.error)">
              {{ copiedKey === 'error' ? (isVi ? '✓ Đã chép lỗi' : '✓ Copied error') : (isVi ? '📋 Sao chép lỗi' : '📋 Copy error') }}
            </button>
          </div>
          <pre>{{ JSON.stringify(selected.error, null, 2) }}</pre>
        </div>
      </div>

      <div v-else class="empty">{{ t('executions.selectNode') }}</div>
    </div>
  </section>
</template>

<style scoped>
.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inspector-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.inspector-head h2 {
  margin: 0;
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.block-header label {
  font: 10px 'Space Mono', monospace;
  color: #818a9c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.mini-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  font-family: 'Space Mono', monospace;
  background: #191f2b;
  border: 1px solid #2f384a;
  border-radius: 6px;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mini-copy-btn:hover:not(:disabled) {
  background: #252e40;
  border-color: #586580;
  color: #fff;
  transform: scale(1.02);
}

.mini-copy-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.mini-copy-btn.error-btn {
  background: rgba(255, 100, 124, 0.15);
  border-color: rgba(255, 100, 124, 0.35);
  color: #ff9aaa;
}

.mini-copy-btn.error-btn:hover:not(:disabled) {
  background: rgba(255, 100, 124, 0.25);
  border-color: #ff647c;
  color: #fff;
}

.copy-debug-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  background: #1c2230;
  border: 1px solid #3b465c;
  color: #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-debug-header-btn:hover {
  background: #242c3d;
  border-color: var(--lime, #c7ff4a);
  color: var(--lime, #c7ff4a);
}
</style>
