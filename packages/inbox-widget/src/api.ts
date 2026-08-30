// Thin fetch wrapper around the end-user inbox routes (apps/api/src/app.ts, inbox/inbox.service.ts).
// Never touches the tenant secret key: the widget only ever holds the short-lived end-user
// token minted by the customer's backend via POST /v1/users/:externalUserId/token.

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  category: string | null;
  priority: string | null;
  data: unknown;
  created_at: string;
  seen_at: string | null;
  read_at: string | null;
  archived_at: string | null;
}

export interface InboxListResult {
  items: InboxItem[];
  next_cursor: string | null;
}

export interface InboxCountResult {
  unread: number;
  total: number;
}

export type InboxStatusFilter = 'unread' | 'read' | 'all';

export interface InboxListQuery {
  limit?: number;
  cursor?: string;
  status?: InboxStatusFilter;
  archived?: boolean;
}

export class InboxApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'InboxApiError';
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export class InboxClient {
  constructor(private baseUrl: string, private token: string) {}

  setToken(token: string): void {
    this.token = token;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) throw new InboxApiError('MISSING_TOKEN', 'No end-user token configured.');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), authorization: `Bearer ${this.token}` },
      });
    } catch (cause) {
      // Abort is the expected shape of a superseded request, not a user-facing failure — let it propagate untouched.
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new InboxApiError('NETWORK_ERROR', 'Could not reach the notification service.');
    }
    let payload: Envelope<T> | undefined;
    try {
      payload = (await response.json()) as Envelope<T>;
    } catch {
      throw new InboxApiError('INVALID_RESPONSE', 'The notification service returned an invalid response.');
    }
    if (!response.ok || !payload.success) {
      throw new InboxApiError(payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? `Request failed (${response.status}).`);
    }
    return payload.data as T;
  }

  private query(params: Record<string, string | number | boolean | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const suffix = search.toString();
    return suffix ? `?${suffix}` : '';
  }

  list(query: InboxListQuery, signal?: AbortSignal): Promise<InboxListResult> {
    const search = this.query({ limit: query.limit, cursor: query.cursor, status: query.status, archived: query.archived });
    return this.request<InboxListResult>(`/v1/inbox${search}`, { signal });
  }

  count(signal?: AbortSignal): Promise<InboxCountResult> {
    return this.request<InboxCountResult>('/v1/inbox/count', { signal });
  }

  readAll(): Promise<{ updated: number }> {
    return this.request<{ updated: number }>('/v1/inbox/read-all', { method: 'POST' });
  }

  markRead(id: string): Promise<InboxItem> {
    return this.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/read`, { method: 'POST' });
  }

  markUnread(id: string): Promise<InboxItem> {
    return this.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/unread`, { method: 'POST' });
  }

  markSeen(id: string): Promise<InboxItem> {
    return this.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/seen`, { method: 'POST' });
  }

  archive(id: string): Promise<InboxItem> {
    return this.request<InboxItem>(`/v1/inbox/${encodeURIComponent(id)}/archive`, { method: 'POST' });
  }
}

// The API doesn't mandate a shape for `data`; deep-linking is a convention, not a contract,
// so we accept either key a producer might reasonably use and fall back to no link at all.
export function extractDeepLink(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const candidate = record.url ?? record.link;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}
