import { defineStore } from 'pinia';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = defineStore('app', {
  state: () => ({
    notice: '',
    error: '',
    sidebarOpen: true
  }),
  actions: {
    notify(message: string) {
      this.notice = message;
      this.error = '';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (this.notice === message) this.notice = '';
      }, 5000);
    },
    fail(error: unknown) {
      this.error = error instanceof Error ? error.message : String(error);
      this.notice = '';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        this.error = '';
      }, 5000);
    },
    dismissToast() {
      this.notice = '';
      this.error = '';
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = undefined;
      }
    }
  }
});
