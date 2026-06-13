import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Import after mocking fetch
import { api } from '@/lib/api';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.setToken(null);
  });

  it('stores and retrieves auth token', () => {
    api.setToken('test-token-123');
    expect(localStorage.getItem('token')).toBe('test-token-123');
  });

  it('removes token when set to null', () => {
    api.setToken('test-token');
    api.setToken(null);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('sends GET request with auth token', async () => {
    api.setToken('token-abc');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: 1 } }),
    });

    const result = await api.get('/api/test');

    // Verify fetch was called with the right URL (port 4000 from env)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const url = callArgs[0] as string;
    expect(url).toContain('localhost:4000');
    expect(url).toContain('/api/test');

    const options = callArgs[1] as Record<string, unknown>;
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token-abc');
    
    expect(result.success).toBe(true);
  });

  it('handles error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });

    const result = await api.get('/api/protected');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('sends POST request with JSON body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: 1 } }),
    });

    const body = { name: 'Test' };
    const result = await api.post('/api/create', body);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const url = callArgs[0] as string;
    expect(url).toContain('localhost:4000');
    expect(url).toContain('/api/create');

    const options = callArgs[1] as Record<string, unknown>;
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify(body));

    expect(result.success).toBe(true);
  });

  it('sets auth header on all requests when token is available', async () => {
    api.setToken('valid-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: 'ok' }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: 'ok2' }),
    });

    await api.get('/api/endpoint1');
    await api.post('/api/endpoint2', { key: 'value' });

    // Both calls should include the auth header
    for (const call of mockFetch.mock.calls) {
      const options = call[1] as Record<string, unknown>;
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer valid-token');
    }
  });
});
