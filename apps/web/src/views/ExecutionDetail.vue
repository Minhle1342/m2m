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
  source = ref<EventSource>();
const { t } = useI18n();

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
      <button @click="retry">{{ t('executions.retry') }}</button>
    </header>
    <div v-if="execution.error" class="error-box">
      <strong>{{ t('executions.failed') }}</strong>
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
        <h2>{{ selected.nodeName }}</h2>
        <div class="inspect-block">
          <label>{{ t('executions.input') }}</label>
          <pre>{{ JSON.stringify(selected.input, null, 2) }}</pre>
        </div>
        <div class="inspect-block">
          <label>{{ t('executions.output') }}</label>
          <pre>{{ JSON.stringify(selected.output, null, 2) }}</pre>
        </div>
        <div v-if="selected.error" class="inspect-block error">
          <label>{{ t('executions.error') }}</label>
          <pre>{{ JSON.stringify(selected.error, null, 2) }}</pre>
        </div>
      </div>
      <div v-else class="empty">{{ t('executions.selectNode') }}</div>
    </div>
  </section>
</template>
