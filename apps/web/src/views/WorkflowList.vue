<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, json } from '../services/api';
import { useAppStore } from '../stores/app';
import { useI18n } from '../services/i18n';
import type { Workflow } from '../types';

const workflows = ref<Workflow[]>([]),
  loading = ref(true);
const router = useRouter(),
  app = useAppStore();
const { t } = useI18n();

async function load() {
  loading.value = true;
  try {
    workflows.value = await api('/workflows');
  } catch (e) {
    app.fail(e);
  } finally {
    loading.value = false;
  }
}

async function create() {
  try {
    const w = await api<Workflow>('/workflows', json('POST', { name: 'Untitled workflow' }));
    router.push(`/workflows/${w.id}`);
  } catch (e) {
    app.fail(e);
  }
}

async function duplicate(id: string) {
  await api(`/workflows/${id}/duplicate`, json('POST'));
  app.notify(t('workflows.duplicatedNotice'));
  await load();
}

async function remove(id: string) {
  if (!confirm(t('workflows.deleteConfirm'))) return;
  await api(`/workflows/${id}`, { method: 'DELETE' });
  await load();
}

onMounted(load);
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('workflows.eyebrow') }}</p>
        <h1>{{ t('workflows.title') }}</h1>
        <p>{{ t('workflows.subtitle') }}</p>
      </div>
      <button class="primary" @click="create">{{ t('workflows.newWorkflow') }}</button>
    </header>
    <div v-if="loading" class="empty">{{ t('workflows.loading') }}</div>
    <div v-else-if="!workflows.length" class="empty">
      <div class="empty-mark">◇</div>
      <h2>{{ t('workflows.emptyTitle') }}</h2>
      <p>{{ t('workflows.emptySubtitle') }}</p>
      <button class="primary" @click="create">{{ t('workflows.createWorkflow') }}</button>
    </div>
    <div v-else class="cards">
      <article v-for="workflow in workflows" :key="workflow.id" class="workflow-card">
        <RouterLink :to="`/workflows/${workflow.id}`">
          <div class="card-top">
            <span class="flow-icon">⌁</span>
            <span class="badge" :class="{ active: workflow.active }">
              {{ workflow.active ? t('workflows.active') : t('workflows.draft') }}
            </span>
          </div>
          <h2>{{ workflow.name }}</h2>
          <p>
            {{
              workflow.description ||
              `${workflow.definition.nodes.length} ${t('workflows.nodes')} · ${t('workflows.version')} ${workflow.version}`
            }}
          </p>
          <footer>
            <span>{{ t('workflows.updated') }} {{ new Date(workflow.updatedAt).toLocaleString() }}</span>
          </footer>
        </RouterLink>
        <div class="card-actions">
          <button @click="duplicate(workflow.id)">{{ t('workflows.duplicate') }}</button>
          <button class="danger-link" @click="remove(workflow.id)">{{ t('workflows.delete') }}</button>
        </div>
      </article>
    </div>
  </section>
</template>
