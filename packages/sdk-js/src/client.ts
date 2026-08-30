import { HttpClient } from './http';
import type {
  AnalyticsQuery,
  CreateNotificationResult,
  CreateTemplateInput,
  CreateWebhookInput,
  CreateWorkflowInput,
  DirectNotificationInput,
  EventAcceptedResult,
  EventInput,
  MintUserTokenResult,
  NotificationListQuery,
  Paginated,
  PreferenceInput,
  RegisterDeviceInput,
  RequestOptions,
  UpdateTemplateInput,
  UpdateWebhookInput,
  UpdateWorkflowInput,
} from './types';

export interface NotificationClientOptions {
  /** Tenant secret API key. NEVER expose this in browser code — see InboxClient for that. */
  apiKey: string;
  baseUrl?: string;
  /** Inject a custom fetch (e.g. for testing, or a polyfill on older runtimes). */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Retries beyond the initial attempt, for 429/5xx/network errors. Default 2. */
  maxRetries?: number;
}

function toIsoString(value: string | Date | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Backend SDK for NotifyKIT, authenticated with a tenant's secret API key.
 * This client is for server-side use only. To let a browser read/manage an end user's
 * in-app inbox, mint a short-lived token with `users.mintToken` on your backend and hand
 * it to `InboxClient` (or `createInboxClient`) in the browser — never ship this client's
 * `apiKey` to a browser.
 *
 * Every method accepts an optional trailing `{ signal }` so callers can cancel a request
 * (e.g. on component unmount); that signal is combined with, never replaces, this SDK's own
 * per-request timeout.
 */
export class NotificationClient {
  private readonly http: HttpClient;

  constructor(options: NotificationClientOptions) {
    if (!options.apiKey) throw new Error('apiKey is required.');
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error('A fetch implementation is required (pass options.fetch on runtimes without a global fetch).');
    this.http = new HttpClient({
      baseUrl: (options.baseUrl ?? 'http://localhost:3000').replace(/\/$/, ''),
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 2,
      authorizationHeader: `Bearer ${options.apiKey}`,
    });
  }

  readonly events = {
    /** POST /v1/events — requires the `events:write` permission. */
    create: (input: EventInput, idempotencyKey?: string, options: RequestOptions = {}) =>
      this.http.request<EventAcceptedResult>('/v1/events', {
        method: 'POST',
        body: input,
        idempotencyKey: idempotencyKey ?? input.idempotency_key,
        signal: options.signal,
      }),
  };

  readonly notifications = {
    /** POST /v1/notifications — requires `notifications:write`. */
    create: (input: DirectNotificationInput, options: RequestOptions = {}) =>
      this.http.request<CreateNotificationResult>('/v1/notifications', { method: 'POST', body: input, signal: options.signal }),
    /** GET /v1/notifications — requires `notifications:read`. */
    list: (query: NotificationListQuery = {}, options: RequestOptions = {}) =>
      this.http.request<Paginated<Record<string, unknown>>>('/v1/notifications', {
        query: { status: query.status, limit: query.limit, cursor: query.cursor },
        signal: options.signal,
      }),
    /** GET /v1/notifications/:id — requires `notifications:read`. Returns the raw notification row. */
    get: (id: string, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>(`/v1/notifications/${encodeURIComponent(id)}`, { signal: options.signal }),
    /** POST /v1/notifications/:id/cancel — requires `notifications:write`. */
    cancel: (id: string, options: RequestOptions = {}) =>
      this.http.request<void>(`/v1/notifications/${encodeURIComponent(id)}/cancel`, { method: 'POST', signal: options.signal }),
  };

  readonly templates = {
    /** GET /v1/templates — requires `templates:read`. */
    list: (options: RequestOptions = {}) => this.http.request<Record<string, unknown>[]>('/v1/templates', { signal: options.signal }),
    /** POST /v1/templates — requires `templates:write`. */
    create: (input: CreateTemplateInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>('/v1/templates', { method: 'POST', body: input, signal: options.signal }),
    /** PATCH /v1/templates/:id — requires `templates:write`. */
    update: (id: string, input: UpdateTemplateInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>(`/v1/templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, signal: options.signal }),
  };

  readonly users = {
    /** GET /v1/users — requires `users:manage`. */
    list: (options: RequestOptions = {}) => this.http.request<Record<string, unknown>[]>('/v1/users', { signal: options.signal }),
    /** POST /v1/users/:externalUserId/devices — requires `devices:manage`. */
    registerDevice: (externalUserId: string, input: RegisterDeviceInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>(`/v1/users/${encodeURIComponent(externalUserId)}/devices`, {
        method: 'POST',
        body: input,
        signal: options.signal,
      }),
    /**
     * POST /v1/users/:externalUserId/token — requires `users:manage`. Call this from your
     * BACKEND to mint a short-lived end-user token, then pass it to `InboxClient` in the browser.
     */
    mintToken: (externalUserId: string, options: RequestOptions = {}) =>
      this.http.request<MintUserTokenResult>(`/v1/users/${encodeURIComponent(externalUserId)}/token`, { method: 'POST', signal: options.signal }),
    preferences: {
      /** GET /v1/users/:externalUserId/preferences — requires `users:manage`. */
      get: (externalUserId: string, options: RequestOptions = {}) =>
        this.http.request<Record<string, unknown>[]>(`/v1/users/${encodeURIComponent(externalUserId)}/preferences`, { signal: options.signal }),
      /** PUT /v1/users/:externalUserId/preferences — requires `users:manage`. */
      put: (externalUserId: string, input: PreferenceInput, options: RequestOptions = {}) =>
        this.http.request<Record<string, unknown>>(`/v1/users/${encodeURIComponent(externalUserId)}/preferences`, {
          method: 'PUT',
          body: input,
          signal: options.signal,
        }),
    },
  };

  readonly webhooks = {
    /** GET /v1/webhooks — requires `webhooks:manage`. */
    list: (options: RequestOptions = {}) => this.http.request<Record<string, unknown>[]>('/v1/webhooks', { signal: options.signal }),
    /** POST /v1/webhooks — requires `webhooks:manage`. Response includes the plaintext secret once. */
    create: (input: CreateWebhookInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>('/v1/webhooks', { method: 'POST', body: input, signal: options.signal }),
    /** PATCH /v1/webhooks/:id — requires `webhooks:manage`. */
    update: (id: string, input: UpdateWebhookInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>(`/v1/webhooks/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, signal: options.signal }),
  };

  readonly workflows = {
    /** GET /v1/workflows — requires `workflows:manage`. */
    list: (options: RequestOptions = {}) => this.http.request<Record<string, unknown>[]>('/v1/workflows', { signal: options.signal }),
    /** POST /v1/workflows — requires `workflows:manage`. */
    create: (input: CreateWorkflowInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>('/v1/workflows', { method: 'POST', body: input, signal: options.signal }),
    /** PATCH /v1/workflows/:id — requires `workflows:manage`. */
    update: (id: string, input: UpdateWorkflowInput, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>(`/v1/workflows/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, signal: options.signal }),
  };

  readonly analytics = {
    /** GET /v1/analytics — requires `analytics:read`. `from`/`to` default to today (server-side). */
    overview: (query: AnalyticsQuery = {}, options: RequestOptions = {}) =>
      this.http.request<Record<string, unknown>>('/v1/analytics', {
        query: { from: toIsoString(query.from), to: toIsoString(query.to) },
        signal: options.signal,
      }),
  };
}
