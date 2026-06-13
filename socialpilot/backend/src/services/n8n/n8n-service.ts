/**
 * n8n — Webhook workflow trigger service.
 *
 * Integrates with n8n (https://n8n.io) to delegate re-engagement,
 * notification, and other automatable workflows to n8n's visual
 * workflow engine instead of running them inline in BullMQ workers.
 *
 * All methods are safe to call when n8n is not configured — they
 * return `{ triggered: false }` and the caller should fall back to
 * its own inline logic.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

interface N8nConfig {
  /** Base URL of the n8n instance (e.g. https://your-n8n.example.com) */
  baseUrl: string;
  /** Optional API key sent as X-N8N-API-Key header for webhook auth */
  apiKey?: string;
}

interface WebhookResult {
  triggered: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

let _config: N8nConfig | null = null;

/**
 * Lazy-init from environment variables so the service works at
 * startup (e.g., in BullMQ workers) without requiring an explicit
 * configureN8n() call.
 */
function ensureInitialized(): void {
  if (_config) return;
  const baseUrl = process.env.N8N_BASE_URL || '';
  const apiKey = process.env.N8N_API_KEY || '';
  if (baseUrl) {
    _config = { baseUrl, apiKey: apiKey || undefined };
  }
}

/**
 * Configure the n8n service at runtime.
 * Pass null to disable an existing configuration.
 */
export function configureN8n(cfg: N8nConfig | null): void {
  _config = cfg;
}

/** Returns true if n8n is configured and ready to use */
export function isN8nConfigured(): boolean {
  ensureInitialized();
  return !!_config?.baseUrl;
}

/**
 * Trigger an n8n webhook workflow.
 *
 * @param webhookId — the webhook path segment (e.g. "reengagement" or the UUID n8n assigns)
 * @param payload — JSON-serializable data to send in the request body
 * @param options — override timeout or add extra headers
 */
export async function triggerWebhook(
  webhookId: string,
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
): Promise<WebhookResult> {
  ensureInitialized();

  if (!_config?.baseUrl) {
    return { triggered: false, error: 'n8n not configured' };
  }

  const baseUrl = _config.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/webhook/${webhookId}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.extraHeaders,
  };

  if (_config.apiKey) {
    headers['X-N8N-API-Key'] = _config.apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = response.headers.get('content-type')?.includes('json')
      ? await response.json()
      : await response.text().catch(() => null);

    return {
      triggered: response.ok,
      status: response.status,
      data,
    };
  } catch (err: any) {
    return {
      triggered: false,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Trigger the re-engagement workflow in n8n with lead/customer data.
 * Falls back gracefully if n8n is not configured.
 */
export async function triggerReengagement(params: {
  customerId: string;
  userId: string;
  stage: '24h' | '3d' | '7d';
  customerName: string;
  leadScore: number;
  product?: string;
}): Promise<WebhookResult> {
  return triggerWebhook('socialpilot-reengagement', {
    event: 'reengagement',
    timestamp: new Date().toISOString(),
    ...params,
  });
}
