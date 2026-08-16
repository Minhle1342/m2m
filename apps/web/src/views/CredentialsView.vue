<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api, json } from '../services/api';
import { useAppStore } from '../stores/app';
import { useI18n } from '../services/i18n';
import type { Credential, CredentialTypeDefinition } from '../types';

const DEFAULT_CREDENTIAL_TYPES: CredentialTypeDefinition[] = [
  {
    type: 'comfyui',
    displayName: 'ComfyUI Local',
    category: 'local-inference',
    costBadge: 'LOCAL',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Local GPU/CPU inference backend for FLUX.2 Klein, Wan2.2, SDXL, and CogVideoX.',
    documentationUrl: 'https://docs.comfy.org/',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true, default: 'http://127.0.0.1:8188' },
      { name: 'apiKey', label: 'API Key (Optional)', type: 'password', required: false }
    ],
    testConnection: true
  },
  {
    type: 'siliconflow',
    displayName: 'SiliconCloud (SiliconFlow)',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Fast cloud inference with free starter credits for Kolors, Wan 2.1, and CogVideoX.',
    documentationUrl: 'https://docs.siliconflow.com/en/userguide/introduction',
    fields: [
      { name: 'apiKey', label: 'API Key (sk-...)', type: 'password', required: true },
      { name: 'baseUrl', label: 'Base URL (Optional)', type: 'string', required: false, default: 'https://api.siliconflow.com/v1' }
    ],
    testConnection: true
  },
  {
    type: 'zhipu',
    displayName: 'Zhipu AI (BigModel / CogVideoX)',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Zhipu AI cloud API with free starter tokens for CogView-3/4 and CogVideoX generation.',
    documentationUrl: 'https://open.bigmodel.cn/dev/api',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      { name: 'baseUrl', label: 'Base URL (Optional)', type: 'string', required: false, default: 'https://open.bigmodel.cn/api/paas/v4' }
    ],
    testConnection: true
  },
  {
    type: 'dashscope',
    displayName: 'Alibaba Cloud (DashScope / Wanx)',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Alibaba Tongyi Wanxiang 90-day free trial quota for Wanx 2.1 image & video generation.',
    documentationUrl: 'https://help.aliyun.com/zh/dashscope/',
    fields: [
      { name: 'apiKey', label: 'DashScope API Key (sk-...)', type: 'password', required: true },
      { name: 'baseUrl', label: 'Base URL (Optional)', type: 'string', required: false, default: 'https://dashscope.aliyuncs.com/api/v1' }
    ],
    testConnection: true
  },
  {
    type: 'cloudflare',
    displayName: 'Cloudflare Workers AI (10k Neurons/Day Free)',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: '10,000 free Neurons every day for FLUX.1-schnell and SDXL Lightning.',
    documentationUrl: 'https://developers.cloudflare.com/workers-ai/',
    fields: [
      { name: 'accountId', label: 'Cloudflare Account ID', type: 'string', required: true },
      { name: 'apiKey', label: 'API Token (Workers AI Read/Edit)', type: 'password', required: true }
    ],
    testConnection: true
  },
  {
    type: 'pollinations',
    displayName: 'Pollinations.ai (100% Free & Unlimited)',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT'],
    description: 'Instant free unlimited FLUX and Turbo image generation without API key.',
    documentationUrl: 'https://pollinations.ai/',
    fields: [],
    testConnection: true
  },
  {
    type: 'huggingface',
    displayName: 'Hugging Face',
    category: 'image',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Hosted Inference Providers with monthly credits for FLUX Schnell images and LTX image-to-video.',
    documentationUrl: 'https://huggingface.co/docs/inference-providers/pricing',
    fields: [
      { name: 'apiKey', label: 'HF Access Token (hf_...)', type: 'password', required: true },
      { name: 'baseUrl', label: 'Inference Base URL (Optional)', type: 'string', required: false }
    ],
    testConnection: true
  },
  {
    type: 'black-forest-labs',
    displayName: 'Black Forest Labs',
    category: 'image',
    costBadge: 'PAID',
    badges: ['PAID', 'BYOK'],
    description: 'Official enterprise cloud API for FLUX 1.1 [pro] and FLUX.1 [dev].',
    documentationUrl: 'https://docs.bfl.ai/',
    fields: [
      { name: 'apiKey', label: 'BFL API Key', type: 'password', required: true },
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: false, default: 'https://api.bfl.ml' }
    ],
    testConnection: true
  },
  {
    type: 'ollama',
    displayName: 'Ollama (Local LLM)',
    category: 'llm',
    costBadge: 'LOCAL',
    badges: ['LOCAL', 'OPEN-WEIGHT'],
    description: 'Run open-source large language models locally on your GPU/CPU.',
    documentationUrl: 'https://ollama.com',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true, default: 'http://127.0.0.1:11434' }
    ],
    testConnection: true
  },
  {
    type: 'gemini',
    displayName: 'Google Gemini',
    category: 'llm',
    costBadge: 'FREE CREDIT',
    badges: ['FREE CREDIT', 'BYOK'],
    description: 'Google AI Studio API with generous free tiers for Gemini 2.0 / 1.5 Flash.',
    documentationUrl: 'https://ai.google.dev',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true }
    ],
    testConnection: true
  },
  {
    type: 'openai-compatible',
    displayName: 'OpenAI-compatible API',
    category: 'llm',
    costBadge: 'BYOK',
    badges: ['BYOK'],
    description: 'Any OpenAI API compatible endpoint (OpenAI, DeepSeek, Groq, OpenRouter, vLLM, LM Studio).',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true, default: 'https://api.openai.com/v1' },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true }
    ],
    testConnection: true
  },
  {
    type: 'generic-media',
    displayName: 'Generic Media API',
    category: 'generic',
    costBadge: 'BYOK',
    badges: ['BYOK'],
    description: 'Custom self-hosted or cloud media endpoints.',
    fields: [
      { name: 'baseUrl', label: 'Base URL', type: 'string', required: true },
      { name: 'apiKey', label: 'API Key / Bearer Token', type: 'password', required: false }
    ],
    testConnection: false
  }
];

const credentials = ref<Credential[]>([]);
const credentialTypes = ref<CredentialTypeDefinition[]>(DEFAULT_CREDENTIAL_TYPES);
const activeCategory = ref<string>('all');
const showModal = ref(false);
const isTesting = ref(false);
const testResult = ref<{ valid: boolean; message: string } | null>(null);
const testingCredentialId = ref<string | null>(null);
const credentialTestResults = ref<Record<string, { valid: boolean; message: string }>>({});

const form = reactive({
  name: '',
  type: 'comfyui',
  data: {} as Record<string, string>
});

const app = useAppStore();
const { t } = useI18n();

const selectedTypeDefinition = computed(() => {
  return credentialTypes.value.find((def) => def.type === form.type) || credentialTypes.value[0];
});

const filteredCredentials = computed(() => {
  if (activeCategory.value === 'all') return credentials.value;
  return credentials.value.filter((item) => {
    const def = credentialTypes.value.find((t) => t.type === item.type);
    return def?.category === activeCategory.value;
  });
});

async function load() {
  try {
    credentials.value = await api<Credential[]>('/credentials');
  } catch (err) {
    app.fail(err);
  }

  try {
    const typeList = await api<CredentialTypeDefinition[]>('/credential-types');
    if (Array.isArray(typeList) && typeList.length > 0) {
      credentialTypes.value = typeList;
    }
  } catch {
    // Graceful fallback to default definitions if API is reloading
    credentialTypes.value = DEFAULT_CREDENTIAL_TYPES;
  }

  if (credentialTypes.value.length && !form.type) {
    form.type = credentialTypes.value[0].type;
    resetFormData();
  }
}

function resetFormData() {
  form.data = {};
  testResult.value = null;
  const def = selectedTypeDefinition.value;
  if (def?.fields) {
    for (const field of def.fields) {
      form.data[field.name] = field.default || '';
    }
  }
}

watch(
  () => form.type,
  () => {
    resetFormData();
  }
);

function openAddModal() {
  form.name = '';
  form.type = credentialTypes.value[0]?.type || 'comfyui';
  resetFormData();
  showModal.value = true;
}

async function testSavedCredential(id: string) {
  testingCredentialId.value = id;
  try {
    const res = await api<{ valid: boolean; message: string }>(`/credentials/${id}/test`, json('POST', {}));
    credentialTestResults.value = { ...credentialTestResults.value, [id]: res };
    if (res.valid) {
      app.notify(`✔ ${res.message}`);
    } else {
      app.fail(new Error(res.message));
    }
  } catch (err) {
    credentialTestResults.value = {
      ...credentialTestResults.value,
      [id]: {
        valid: false,
        message: err instanceof Error ? err.message : String(err)
      }
    };
    app.fail(err);
  } finally {
    testingCredentialId.value = null;
  }
}

async function save() {
  try {
    await api(
      '/credentials',
      json('POST', {
        name: form.name,
        type: form.type,
        data: form.data
      })
    );
    showModal.value = false;
    app.notify(t('credentials.savedNotice'));
    await load();
  } catch (e) {
    app.fail(e);
  }
}

async function remove(id: string) {
  if (confirm(t('credentials.deleteConfirm'))) {
    await api(`/credentials/${id}`, { method: 'DELETE' });
    await load();
  }
}

function getBadgesForType(type: string): string[] {
  const def = credentialTypes.value.find((t) => t.type === type);
  return def?.badges || (def?.costBadge ? [def.costBadge] : []);
}

onMounted(() => void load());
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('credentials.eyebrow') }}</p>
        <h1>{{ t('credentials.title') }}</h1>
        <p>{{ t('credentials.subtitle') }}</p>
      </div>
      <button class="primary" @click="openAddModal">
        {{ t('credentials.addCredential') }}
      </button>
    </header>

    <!-- Category Tabs -->
    <div class="category-filter-bar">
      <button
        class="filter-tab-btn"
        :class="{ active: activeCategory === 'all' }"
        @click="activeCategory = 'all'"
      >
        {{ t('credentials.categories.all') }}
      </button>
      <button
        class="filter-tab-btn"
        :class="{ active: activeCategory === 'local-inference' }"
        @click="activeCategory = 'local-inference'"
      >
        💻 {{ t('credentials.categories.local-inference') }}
      </button>
      <button
        class="filter-tab-btn"
        :class="{ active: activeCategory === 'image' }"
        @click="activeCategory = 'image'"
      >
        🖼 {{ t('credentials.categories.image') }}
      </button>
      <button
        class="filter-tab-btn"
        :class="{ active: activeCategory === 'video' }"
        @click="activeCategory = 'video'"
      >
        🎬 {{ t('credentials.categories.video') }}
      </button>
      <button
        class="filter-tab-btn"
        :class="{ active: activeCategory === 'llm' }"
        @click="activeCategory = 'llm'"
      >
        💬 {{ t('credentials.categories.llm') }}
      </button>
    </div>

    <!-- Credentials Grid -->
    <div class="credential-grid">
      <article v-for="item in filteredCredentials" :key="item.id" class="credential-card">
        <div class="card-head-row">
          <span class="credential-icon">
            {{
              item.type === 'comfyui'
                ? '⚡'
                : item.type === 'huggingface'
                  ? '🤗'
                  : item.type === 'black-forest-labs'
                    ? '🌲'
                    : '⌘'
            }}
          </span>
          <div class="badges-row">
            <span
              v-for="badge in getBadgesForType(item.type)"
              :key="badge"
              class="cost-badge"
              :class="badge.toLowerCase().replace(/\s+/g, '-')"
            >
              {{ badge }}
            </span>
          </div>
        </div>

        <div class="card-info">
          <h2>{{ item.name }}</h2>
          <p class="type-name">{{ item.type }} · ••••••••••••</p>
          <small>Updated {{ new Date(item.updatedAt).toLocaleDateString() }}</small>
        </div>

        <div class="credential-actions">
          <button
            type="button"
            class="credential-test-btn"
            :disabled="testingCredentialId === item.id"
            @click="testSavedCredential(item.id)"
          >
            {{ testingCredentialId === item.id ? '…' : '⚡' }} {{ t('credentials.testConnection') }}
          </button>
          <button type="button" class="credential-delete-btn" @click="remove(item.id)">
            {{ t('common.delete') }}
          </button>
        </div>
        <p
          v-if="credentialTestResults[item.id]"
          class="connection-result"
          :class="credentialTestResults[item.id].valid ? 'success' : 'failure'"
        >
          {{ credentialTestResults[item.id].valid ? '✓' : '!' }}
          {{ credentialTestResults[item.id].message }}
        </p>
      </article>

      <div v-if="!filteredCredentials.length" class="empty">
        {{ t('credentials.empty') }}
      </div>
    </div>

    <!-- Add Credential Modal -->
    <div v-if="showModal" class="modal" @click.self="showModal = false">
      <form class="dialog credential-dialog" @submit.prevent="save">
        <h2>{{ t('credentials.dialogTitle') }}</h2>

        <label>
          {{ t('credentials.name') }}
          <input
            v-model="form.name"
            required
            :placeholder="t('credentials.namePlaceholder')"
          />
        </label>

        <label>
          {{ t('credentials.type') }}
          <select v-model="form.type">
            <option
              v-for="def in credentialTypes"
              :key="def.type"
              :value="def.type"
            >
              {{ def.displayName }} ({{ def.costBadge || def.category }})
            </option>
          </select>
        </label>

        <div v-if="selectedTypeDefinition?.description" class="provider-desc-box">
          <p>{{ selectedTypeDefinition.description }}</p>
          <a
            v-if="selectedTypeDefinition.documentationUrl"
            :href="selectedTypeDefinition.documentationUrl"
            target="_blank"
            rel="noopener"
          >
            Docs ↗
          </a>
        </div>

        <!-- Dynamic Fields -->
        <template v-for="field in selectedTypeDefinition?.fields" :key="field.name">
          <label>
            <span>{{ field.label }} <b v-if="field.required">*</b></span>
            <input
              v-model="form.data[field.name]"
              :type="field.type"
              :required="field.required"
              :placeholder="field.default || ''"
              autocomplete="new-password"
            />
          </label>
        </template>

        <div class="dialog-actions">
          <button type="button" @click="showModal = false">
            {{ t('credentials.cancel') }}
          </button>
          <button class="primary">{{ t('credentials.encryptAndSave') }}</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.category-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.filter-tab-btn {
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 8px;
  background: #141822;
  border: 1px solid #232b3c;
  color: #8c97ad;
}

.filter-tab-btn.active {
  background: #202738;
  border-color: #4b5a79;
  color: #fff;
  font-weight: 600;
}

.credential-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.card-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.badges-row {
  display: flex;
  gap: 5px;
}

.cost-badge {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #293448;
  background: #111622;
  color: #8b96ad;
}

.cost-badge.local {
  background: #142a1b;
  border-color: #245030;
  color: var(--lime);
}

.cost-badge.free-credit {
  background: #17283c;
  border-color: #254a73;
  color: #72b7ff;
}

.cost-badge.open-weight {
  background: #281f3a;
  border-color: #4c3773;
  color: #cb98ff;
}

.credential-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #1c2230;
  padding-top: 10px;
  margin-top: auto;
}

.credential-actions button {
  position: static;
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.credential-test-btn {
  flex: 1;
  background: #17283c;
  border: 1px solid #254a73;
  color: #9dcbff;
  font-weight: 600;
}

.credential-test-btn:hover:not(:disabled) {
  background: #1d3550;
  border-color: #3d6d9f;
}

.credential-test-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}

.credential-delete-btn {
  flex: 0 0 auto;
  background: #2b181d;
  border: 1px solid #59303a;
  color: #ff9cae;
}

.credential-delete-btn:hover {
  background: #3a1e25;
  border-color: #824050;
}

.connection-result {
  margin: -4px 0 0;
  padding: 8px 10px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.connection-result.success {
  background: #142a1b;
  border-color: #245030;
  color: var(--lime);
}

.connection-result.failure {
  background: #301a1d;
  border-color: #663038;
  color: #ff9ca7;
}

.provider-desc-box {
  background: #0e121a;
  border: 1px solid #222a3b;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11px;
  color: #8b96ad;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.provider-desc-box p {
  margin: 0;
}

.provider-desc-box a {
  color: var(--lime);
  text-decoration: none;
  font-weight: 600;
}
</style>
