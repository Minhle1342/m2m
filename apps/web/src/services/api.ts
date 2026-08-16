const base = '/api/v1';
interface Session {
  accessToken: string;
  refreshToken?: string;
  workspaceId: string;
}
const sessionKey = 'm2m.session';

export function getSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}
export function setSession(session: Session): void {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}
export function clearSession(): void {
  localStorage.removeItem(sessionKey);
}
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body)
});

export function resolveApiPath(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('/health')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === base || normalized.startsWith(`${base}/`)) return normalized;
  return `${base}${normalized}`;
}

async function refreshSession(session: Session): Promise<Session | undefined> {
  if (!session.refreshToken) return undefined;
  const response = await fetch(
    `${base}/auth/refresh`,
    json('POST', { refreshToken: session.refreshToken, workspaceId: session.workspaceId })
  );
  if (!response.ok) {
    clearSession();
    return undefined;
  }
  const refreshed = (await response.json()) as Session;
  const next = { ...session, ...refreshed };
  setSession(next);
  return next;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let session = getSession();
  const requestPath = resolveApiPath(path);
  const request = () =>
    fetch(requestPath, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
        ...(session?.workspaceId ? { 'x-workspace-id': session.workspaceId } : {}),
        ...init.headers
      }
    });
  let response = await request();
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    session = await refreshSession(session ?? { accessToken: '', workspaceId: '' });
    if (session) response = await request();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

api.get = <T>(path: string, init?: RequestInit): Promise<T> => api<T>(path, { ...init, method: 'GET' });
api.post = <T>(path: string, body?: unknown, init?: RequestInit): Promise<T> =>
  api<T>(path, { ...init, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
api.patch = <T>(path: string, body?: unknown, init?: RequestInit): Promise<T> =>
  api<T>(path, { ...init, method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
api.delete = <T>(path: string, init?: RequestInit): Promise<T> => api<T>(path, { ...init, method: 'DELETE' });
api.upload = async <T>(path: string, formData: FormData): Promise<T> => {
  const session = getSession();
  const requestPath = resolveApiPath(path);
  const response = await fetch(requestPath, {
    method: 'POST',
    body: formData,
    headers: {
      ...(session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
      ...(session?.workspaceId ? { 'x-workspace-id': session.workspaceId } : {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Upload failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};
