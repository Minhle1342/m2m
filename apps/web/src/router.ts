import { createRouter, createWebHistory } from 'vue-router';
import WorkflowList from './views/WorkflowList.vue';
import WorkflowEditor from './views/WorkflowEditor.vue';
import ExecutionList from './views/ExecutionList.vue';
import ExecutionDetail from './views/ExecutionDetail.vue';
import CredentialsView from './views/CredentialsView.vue';
import DeveloperSettings from './views/DeveloperSettings.vue';
import HelpView from './views/HelpView.vue';
import AuthView from './views/AuthView.vue';
import { api, getSession } from './services/api';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/workflows' },
    { path: '/login', component: AuthView },
    { path: '/workflows', component: WorkflowList },
    { path: '/workflows/:id', component: WorkflowEditor },
    { path: '/executions', component: ExecutionList },
    { path: '/executions/:id', component: ExecutionDetail },
    { path: '/credentials', component: CredentialsView },
    { path: '/settings/developer', component: DeveloperSettings },
    { path: '/help', component: HelpView }
  ]
});

router.beforeEach(async (to) => {
  if (to.path === '/login') return true;
  if (getSession()?.accessToken) return true;
  try {
    await api('/auth/me');
    return true;
  } catch {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
});

export default router;
