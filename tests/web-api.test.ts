import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, resolveApiPath } from '../apps/web/src/services/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web API path resolution', () => {
  it('prefixes relative API paths exactly once', () => {
    expect(resolveApiPath('/media/assets/asset-1')).toBe('/api/v1/media/assets/asset-1');
    expect(resolveApiPath('media/assets/asset-1')).toBe('/api/v1/media/assets/asset-1');
  });

  it('preserves paths that already contain the API prefix', () => {
    expect(resolveApiPath('/api/v1/media/assets/asset-1?force=true')).toBe(
      '/api/v1/media/assets/asset-1?force=true'
    );
    expect(resolveApiPath('/health')).toBe('/health');
  });

  it('sends delete requests to the normalized path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.delete('/api/v1/media/assets/asset-1?force=true');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/media/assets/asset-1?force=true',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
