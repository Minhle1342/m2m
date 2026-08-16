<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../services/api';
import { useAppStore } from '../stores/app';
import { useI18n } from '../services/i18n';
import type { Execution } from '../types';

const executions = ref<Execution[]>([]),
  app = useAppStore();
const { t } = useI18n();

async function load() {
  try {
    executions.value = await api('/executions');
  } catch (e) {
    app.fail(e);
  }
}

onMounted(load);
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('executions.eyebrow') }}</p>
        <h1>{{ t('executions.title') }}</h1>
        <p>{{ t('executions.subtitle') }}</p>
      </div>
      <button @click="load">{{ t('executions.refresh') }}</button>
    </header>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('executions.status') }}</th>
            <th>{{ t('executions.mode') }}</th>
            <th>{{ t('executions.execution') }}</th>
            <th>{{ t('executions.started') }}</th>
            <th>{{ t('executions.duration') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in executions" :key="run.id">
            <td>
              <span class="status" :class="run.status">{{ run.status }}</span>
            </td>
            <td>{{ run.mode }}</td>
            <td>
              <RouterLink :to="`/executions/${run.id}`" class="mono">{{ run.id.slice(0, 12) }}…</RouterLink>
            </td>
            <td>{{ new Date(run.startedAt || run.createdAt).toLocaleString() }}</td>
            <td>
              {{
                run.finishedAt && run.startedAt
                  ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() + ' ms'
                  : '—'
              }}
            </td>
          </tr>
          <tr v-if="!executions.length">
            <td colspan="5" class="empty-cell">{{ t('executions.noExecutions') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
