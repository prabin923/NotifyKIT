// Wire types for the NotifyKIT HTTP API. Request bodies mirror the API's DTOs field-for-field
// (snake_case) — this SDK deliberately does not layer a camelCase mapping on top.
//
// Some read endpoints (e.g. GET /v1/notifications/:id) return the underlying Prisma row as-is,
// which is camelCase. Those responses are typed loosely (Record<string, unknown>) rather than
// pretending to a stable, fully-typed shape this SDK doesn't actually enforce.

export type Channel = 'EMAIL' | 'PUSH' | 'WEBHOOK' | 'IN_APP';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type NotificationStatus =
  | 'CREATED' | 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'OPENED'
  | 'FAILED' | 'RETRYING' | 'CANCELLED' | 'EXPIRED';
export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED';
export type WebhookStatus = 'ACTIVE' | 'DISABLED';
export type DevicePlatform = 'ANDROID' | 'WEB' | 'IOS';
export type InboxStatusFilter = 'unread' | 'read' | 'all';

export interface EventInput {
  event: string;
  idempotency_key?: string;
  external_event_id?: string;
  user: { id: string; email?: string; phone?: string; name?: string };
  data?: Record<string, unknown>;
}

export interface EventAcceptedResult {
  event_id: string;
  status: 'accepted';
  notification_ids: string[];
  idempotent_replay?: boolean;
}

export interface DirectNotificationInput {
  user_id: string;
  notification: { title: string; message: string; priority?: Priority; category?: string };
  channels: Channel[];
  scheduled_at?: string;
  expires_at?: string;
}

export interface CreateNotificationResult {
  id: string;
  status: NotificationStatus;
  delivery_ids: string[];
}

export interface NotificationListQuery {
  status?: NotificationStatus;
  limit?: number;
  cursor?: string;
}

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CreateTemplateInput {
  name: string;
  event_type: string;
  channel: Channel;
  subject?: string;
  body: string;
  language?: string;
  version?: number;
  status?: TemplateStatus;
}

export interface UpdateTemplateInput {
  name?: string;
  subject?: string;
  body?: string;
  status?: TemplateStatus;
}

export interface RegisterDeviceInput {
  device_token: string;
  platform: DevicePlatform;
  app_version?: string;
}

export interface PreferenceInput {
  category: string;
  channel: Channel;
  enabled: boolean;
}

export interface MintUserTokenResult {
  /** Short-lived end-user token — hand this to the browser, never the secret API key. */
  token: string;
  expires_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  secret?: string;
}

export interface UpdateWebhookInput {
  status?: WebhookStatus;
  events?: string[];
}

export interface CreateWorkflowInput {
  name: string;
  event_type: string;
  definition: Record<string, unknown>;
  status?: WorkflowStatus;
}

export interface UpdateWorkflowInput {
  name?: string;
  definition?: Record<string, unknown>;
  status?: WorkflowStatus;
}

export interface AnalyticsQuery {
  from?: string | Date;
  to?: string | Date;
}

export interface InboxListQuery {
  status?: InboxStatusFilter;
  limit?: number;
  cursor?: string;
  archived?: boolean;
}

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  category: string | null;
  priority: Priority;
  data: unknown;
  created_at: string;
  seen_at: string | null;
  read_at: string | null;
  archived_at: string | null;
}

export interface InboxCount {
  unread: number;
  total: number;
}

/** Passed as the last argument to any request method to allow caller-driven cancellation. */
export interface RequestOptions {
  signal?: AbortSignal;
}
