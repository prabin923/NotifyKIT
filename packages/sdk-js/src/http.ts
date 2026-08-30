import { NotificationApiError } from './errors';

export interface HttpRequestInit {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  idempotencyKey?: string;
  /** Caller-supplied cancellation signal. Combined with (never replaced by) our own timeout signal. */
  signal?: AbortSignal;
  /**
   * Overrides the method-based idempotency guess below. Use this for endpoints that are POST
   * on the wire but semantically idempotent (e.g. the inbox "mark read" actions), so they are
   * still safe to retry even without an Idempotency-Key header.
   */
  idempotent?: boolean;
}

export interface HttpClientConfig {
  baseUrl: string;
  fetchImpl: typeof fetch;
  /** Per-request timeout in ms, enforced via AbortSignal. */
  timeoutMs: number;
  /** Number of retries *in addition to* the initial attempt. */
  maxRetries: number;
  authorizationHeader: string;
}

interface ApiEnvelope {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  request_id?: string;
  // POST /v1/events replies with these fields spliced at the top level instead of under `data`.
  [key: string]: unknown;
}

function isEnvelope(value: unknown): value is ApiEnvelope {
  return Boolean(value) && typeof value === 'object' && 'success' in (value as Record<string, unknown>);
}

async function safeParseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function extractData<T>(payload: ApiEnvelope): T {
  if (payload.data !== undefined) return payload.data as T;
  const { success: _success, request_id: _requestId, error: _error, ...rest } = payload;
  return rest as T;
}

function buildApiError(payload: unknown, status: number): NotificationApiError {
  const envelope = isEnvelope(payload) ? payload : ({ success: false } as ApiEnvelope);
  return new NotificationApiError(
    envelope.error?.code ?? 'REQUEST_FAILED',
    envelope.error?.message ?? `Request failed with status ${status}.`,
    status,
    envelope.error?.details,
  );
}

function toNetworkError(error: unknown): NotificationApiError {
  const message = error instanceof Error ? error.message : 'Network request failed.';
  return new NotificationApiError('NETWORK_ERROR', message, 0);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// GET/PUT/DELETE are idempotent by construction; PATCH here is always a partial field update
// (never a create), so it is safe to repeat. POST is the one verb that can create a duplicate
// side effect on retry, so it is only treated as safe when the caller attached an Idempotency-Key
// the server can use to de-duplicate.
function isIdempotentRequest(method: string, idempotencyKey?: string): boolean {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'PUT' || upper === 'DELETE' || upper === 'PATCH') return true;
  return Boolean(idempotencyKey);
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

// Full-jitter exponential backoff: uniform(0, min(cap, base * 2^retryIndex)).
function backoffDelayMs(retryIndex: number, baseMs = 300, capMs = 4_000): number {
  const bound = Math.min(capMs, baseMs * 2 ** retryIndex);
  return Math.random() * bound;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// Node 18 (our minimum supported engine) predates AbortSignal.any (Node 20.3+), so fall back to
// a manual combinator when it is unavailable. Never used to drop the caller's own signal.
function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) return primary;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([primary, secondary]);
  if (primary.aborted || secondary.aborted) {
    const controller = new AbortController();
    controller.abort((primary.aborted ? primary : secondary).reason);
    return controller.signal;
  }
  const controller = new AbortController();
  const onAbort = (signal: AbortSignal) => () => controller.abort(signal.reason);
  primary.addEventListener('abort', onAbort(primary), { once: true });
  secondary.addEventListener('abort', onAbort(secondary), { once: true });
  return controller.signal;
}

function buildUrl(baseUrl: string, path: string, query?: HttpRequestInit['query']): string {
  let url = `${baseUrl}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

/**
 * Shared request core used by both the secret-key `NotificationClient` and the end-user
 * `InboxClient`. Neither knows about the other's credential type — this class just carries
 * whatever pre-built `authorization` header value it was configured with.
 */
export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  async request<T>(path: string, init: HttpRequestInit = {}): Promise<T> {
    const method = init.method ?? 'GET';
    const url = buildUrl(this.config.baseUrl, path, init.query);
    const retryable = init.idempotent ?? isIdempotentRequest(method, init.idempotencyKey);
    const maxAttempts = 1 + (retryable ? this.config.maxRetries : 0);
    let retryAfterOverrideMs: number | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(retryAfterOverrideMs ?? backoffDelayMs(attempt - 1));
        retryAfterOverrideMs = undefined;
      }

      const isLastAttempt = attempt === maxAttempts - 1;
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(new DOMException('Request timed out.', 'TimeoutError')), this.config.timeoutMs);

      try {
        const response = await this.config.fetchImpl(url, {
          method,
          headers: {
            authorization: this.config.authorizationHeader,
            ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
          },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
          signal: combineSignals(timeoutController.signal, init.signal),
        });
        clearTimeout(timer);

        if (response.status === 204) return undefined as T;
        const payload = await safeParseJson(response);

        if (response.ok && isEnvelope(payload) && payload.success) return extractData<T>(payload);

        const apiError = buildApiError(payload, response.status);
        if (!isLastAttempt && isRetryableStatus(response.status)) {
          retryAfterOverrideMs = retryAfterMs(response.headers.get('retry-after'));
          continue;
        }
        throw apiError;
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof NotificationApiError) throw error;
        // Caller cancelled explicitly: propagate immediately, never retry over their own signal.
        if (init.signal?.aborted) throw error;
        if (!isLastAttempt) continue;
        throw toNetworkError(error);
      }
    }
    /* istanbul ignore next -- loop above always returns or throws */
    throw new NotificationApiError('REQUEST_FAILED', 'Request failed.', 0);
  }
}
