export { NotificationClient } from './client';
export type { NotificationClientOptions } from './client';

// Separate, browser-safe export: authenticated with an end-user token, never the secret API
// key. See InboxClient's doc comment in ./inbox for the two-step mint/consume flow.
export { InboxClient, createInboxClient } from './inbox';
export type { InboxClientOptions } from './inbox';

export { NotificationApiError } from './errors';

export type {
  AnalyticsQuery,
  Channel,
  CreateNotificationResult,
  CreateTemplateInput,
  CreateWebhookInput,
  CreateWorkflowInput,
  DevicePlatform,
  DirectNotificationInput,
  EventAcceptedResult,
  EventInput,
  InboxCount,
  InboxItem,
  InboxListQuery,
  InboxStatusFilter,
  MintUserTokenResult,
  NotificationListQuery,
  NotificationStatus,
  Paginated,
  PreferenceInput,
  Priority,
  RegisterDeviceInput,
  RequestOptions,
  TemplateStatus,
  UpdateTemplateInput,
  UpdateWebhookInput,
  UpdateWorkflowInput,
  WebhookStatus,
  WorkflowStatus,
} from './types';
