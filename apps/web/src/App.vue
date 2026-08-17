<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearSession } from './services/api';
import { useAppStore } from './stores/app';
import { useI18n } from './services/i18n';

const app = useAppStore(),
  route = useRoute(),
  router = useRouter(),
  authPage = computed(() => route.path === '/login');
const { locale, t, toggleLocale } = useI18n();

function logout() {
  clearSession();
  void router.replace('/login');
}

function dismissToast() {
  app.dismissToast();
}
</script>

<template>
  <div class="shell" :class="{ 'auth-shell': authPage }">
    <aside v-if="!authPage" class="nav">
      <RouterLink class="brand" to="/workflows">
        <span>m</span>2m
        <small>MAX TO MINUS</small>
      </RouterLink>

      <nav>
        <RouterLink to="/workflows">◆ {{ t('nav.workflows') }}</RouterLink>
        <RouterLink to="/executions">▷ {{ t('nav.executions') }}</RouterLink>
        <RouterLink to="/credentials">⌘ {{ t('nav.credentials') }}</RouterLink>
        <RouterLink to="/settings/developer">● {{ t('nav.developer') }}</RouterLink>
        <RouterLink to="/help">? {{ t('nav.help') }}</RouterLink>
      </nav>

      <div class="nav-foot">
        <div class="user-row">
          <span class="avatar">M2</span>
          <div class="user-info">
            <strong>{{ t('nav.user') }}</strong>
            <small>{{ t('nav.currentWorkspace') }}</small>
          </div>
          <button class="logout-btn" :title="t('nav.signOut')" @click="logout">↪</button>
        </div>

        <div class="nav-lang-foot">
          <button
            type="button"
            class="lang-toggle-btn"
            :title="locale === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English'"
            @click="toggleLocale"
          >
            <div class="lang-left">
              <span class="lang-icon">🌐</span>
              <span class="lang-text">{{ locale === 'en' ? 'English' : 'Tiếng Việt' }}</span>
            </div>
            <div class="lang-segment">
              <span class="lang-opt" :class="{ active: locale === 'en' }">EN</span>
              <span class="lang-opt" :class="{ active: locale === 'vi' }">VI</span>
            </div>
          </button>
        </div>
      </div>
    </aside>

    <main class="main">
      <RouterView />
    </main>

    <Transition name="toast">
      <div v-if="app.notice || app.error" class="toast" :class="{ danger: app.error }">
        <span class="toast-text">{{ app.error || app.notice }}</span>
        <button
          class="toast-close-btn"
          type="button"
          :title="locale === 'en' ? 'Close notification' : 'Đóng thông báo'"
          aria-label="Close"
          @click.stop.prevent="dismissToast"
        >
          ✕
        </button>
      </div>
    </Transition>
  </div>
</template>
