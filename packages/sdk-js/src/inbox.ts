import { HttpClient } from './http';
import type { InboxCount, InboxItem, InboxListQuery, Paginated, RequestOptions } from './types';

export interface InboxClientOptions {
  /**
   * A short-lived END-USER token — NOT the tenant's secret API key. Mint one from your
   * backend with `NotificationClient.users.mintToken(externalUserId)` and pass it down to
   * the browser (e.g. embedded in the page, or fetched from your own authenticated endpoint).
   */
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Retries beyond the initial attempt, for 429/5xx/network errors. Default 2. */
  maxRetries?: number;
}

/**
 * Browser-safe client for a single end user's in-app inbox (`/v1/inbox/*`).
 *
 * This is intentionally a separate class from `NotificationClient`: it only ever holds an
 * end-user token, so it is structurally impossible to accidentally bundle a tenant's secret
 * API key into browser-shipped code by importing the wrong client.
 *
 * Two-step flow:
 *   1. Backend (holds the secret key): `notificationClient.users.mintToken(externalUserId)`.
 *   2. Browser (holds only the minted token): `new InboxClient({ token })`.
 */
export class InboxClient {
  private readonly http: HttpClient;

  constructor(options: InboxClientOptions) {
    if (!options.token) throw new Error('token is required.');
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error('A fetch implementation is required (pass options.fetch on runtimes without a global fetch).');
    this.http = new HttpClient({
      baseUrl: (options.baseUrl ?? 'http://localhost:3000').replace(/\/$/, ''),
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 2,
      authorizationHeader: `Bearer ${options.token}`,
    });
  }

  /** GET /v1/inbox */
  list(query: InboxListQuery = {}, options: RequestOptions = {}): Promise<Paginated<InboxItem>> {
    return this.http.request<Paginated<InboxItem>>('/v1/inbox', {
      query: { status: query.status, limit: query.limit, cursor: query.cursor, archived: query.archived },
      signal: options.signal,
    });
  }

  /** GET /v1/inbox/count */
  count(options: RequestOptions = {}): Promise<InboxCount> {
    return this.http.request<InboxCount>('/v1/inbox/count', { signal: options.signal });
  }

  /** POST /v1/inbox/read-all — marks every unread, unarchived item read. Safe to retry. */
  readAll(options: RequestOptions = {}): Promise<{ updated: number }> {
    return this.http.request<{ updated: number }>('/v1/inbox/read-all', { method: 'POST', idempotent: true, signal: options.signal });
  }

  /** POST /v1/inbox/:id/read — safe to retry: setting readAt twice is a no-op. */
  read(id: string, options: RequestOptions = {}): Promise<InboxItem> {
    return this.http.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/read`, { method: 'POST', idempotent: true, signal: options.signal });
  }

  /** POST /v1/inbox/:id/unread — safe to retry. */
  unread(id: string, options: RequestOptions = {}): Promise<InboxItem> {
    return this.http.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/unread`, { method: 'POST', idempotent: true, signal: options.signal });
  }

  /** POST /v1/inbox/:id/seen — safe to retry. */
  seen(id: string, options: RequestOptions = {}): Promise<InboxItem> {
    return this.http.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/seen`, { method: 'POST', idempotent: true, signal: options.signal });
  }

  /** POST /v1/inbox/:id/archive — safe to retry. */
  archive(id: string, options: RequestOptions = {}): Promise<InboxItem> {
    return this.http.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/archive`, { method: 'POST', idempotent: true, signal: options.signal });
  }
}

export function createInboxClient(options: InboxClientOptions): InboxClient {
  return new InboxClient(options);
}
