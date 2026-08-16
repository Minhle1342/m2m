<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, json, setSession } from '../services/api';
import { useAppStore } from '../stores/app';
import { useI18n } from '../services/i18n';

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  workspaceId: string;
}

const router = useRouter(),
  app = useAppStore();
const { t } = useI18n();

const mode = ref<'login' | 'register'>('login'),
  email = ref(''),
  password = ref(''),
  displayName = ref(''),
  workspaceName = ref('My Workspace'),
  busy = ref(false);

async function submit() {
  busy.value = true;
  try {
    const result = await api<AuthResponse>(
      `/auth/${mode.value}`,
      json(
        'POST',
        mode.value === 'login'
          ? { email: email.value, password: password.value }
          : {
              email: email.value,
              password: password.value,
              displayName: displayName.value,
              workspaceName: workspaceName.value
            }
      )
    );
    setSession(result);
    await router.replace('/workflows');
  } catch (error) {
    app.fail(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <div class="auth-brand">
        <span>m</span>2m
        <small>MAX TO MINUS</small>
      </div>
      <h1>{{ mode === 'login' ? t('auth.welcomeBack') : t('auth.createWorkspace') }}</h1>
      <p>{{ mode === 'login' ? t('auth.signInSubtitle') : t('auth.registerSubtitle') }}</p>
      <label v-if="mode === 'register'">
        {{ t('auth.displayName') }}
        <input v-model="displayName" required autocomplete="name" />
      </label>
      <label>
        {{ t('auth.email') }}
        <input v-model="email" required type="email" autocomplete="email" />
      </label>
      <label>
        {{ t('auth.password') }}
        <input
          v-model="password"
          required
          type="password"
          minlength="10"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        />
      </label>
      <label v-if="mode === 'register'">
        {{ t('auth.workspaceName') }}
        <input v-model="workspaceName" required />
      </label>
      <button class="primary" :disabled="busy">
        {{ busy ? t('auth.pleaseWait') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount') }}
      </button>
      <button type="button" class="auth-switch" @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount') }}
      </button>
    </form>
  </div>
</template>
