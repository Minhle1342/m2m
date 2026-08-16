<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../services/api';
import { useI18n } from '../services/i18n';

type Health = {
  status: string;
  dependencies: {
    api: boolean;
    database: boolean;
    redis: boolean;
    worker: boolean;
    ai: Record<string, boolean>;
    media?: {
      comfyui?: boolean;
    };
  };
};

const health = ref<Health>(),
  error = ref('');
const { t } = useI18n();

async function load() {
  try {
    health.value = await api('/health');
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(load);
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('developer.eyebrow') }}</p>
        <h1>{{ t('developer.title') }}</h1>
        <p>{{ t('developer.subtitle') }}</p>
      </div>
      <button @click="load">{{ t('developer.checkAgain') }}</button>
    </header>
    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="health" class="health-grid">
      <article
        v-for="(online, name) in {
          API: health.dependencies.api,
          Database: health.dependencies.database,
          Redis: health.dependencies.redis,
          Worker: health.dependencies.worker
        }"
        :key="name"
      >
        <span :class="['health-dot', { online }]"></span>
        <div>
          <small>{{ name }}</small>
          <strong>{{ online ? t('developer.online') : t('developer.offline') }}</strong>
        </div>
        <code v-if="name === 'Redis' && !online">docker compose up -d redis</code>
        <code v-if="name === 'Worker' && !online">pnpm dev:worker</code>
      </article>

      <!-- Media & Local Inference Server -->
      <article>
        <span :class="['health-dot', { online: Boolean(health.dependencies.media?.comfyui) }]"></span>
        <div>
          <small>Media · ComfyUI (FLUX / Wan2.2)</small>
          <strong>{{ health.dependencies.media?.comfyui ? t('developer.online') : t('developer.offline') }}</strong>
        </div>
        <code v-if="!health.dependencies.media?.comfyui">python main.py --listen 127.0.0.1 --port 8188</code>
      </article>

      <!-- AI Provider Connections -->
      <article v-for="(online, name) in health.dependencies.ai" :key="name">
        <span :class="['health-dot', { online }]"></span>
        <div>
          <small>AI · {{ name }}</small>
          <strong>{{ online ? t('developer.online') : t('developer.notConfigured') }}</strong>
        </div>
      </article>
    </div>
  </section>
</template>
