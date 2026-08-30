export const notificationStatuses = [
  'CREATED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'OPENED',
  'FAILED', 'RETRYING', 'CANCELLED', 'EXPIRED',
] as const;

export type NotificationStatus = (typeof notificationStatuses)[number];

export const channels = ['EMAIL', 'PUSH', 'WEBHOOK', 'IN_APP'] as const;
export type Channel = (typeof channels)[number];

export const priorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof priorities)[number];

export const eventStatuses = ['ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type EventStatus = (typeof eventStatuses)[number];

export const deliveryStatuses = [
  'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'CANCELLED', 'DEAD_LETTER',
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const templateStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type TemplateStatus = (typeof templateStatuses)[number];

export const workflowStatuses = ['DRAFT', 'ACTIVE', 'DISABLED'] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const webhookStatuses = ['ACTIVE', 'DISABLED'] as const;
export type WebhookStatus = (typeof webhookStatuses)[number];

export const devicePlatforms = ['ANDROID', 'WEB', 'IOS'] as const;
export type DevicePlatform = (typeof devicePlatforms)[number];

export const userStatuses = ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const tenantPlans = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'] as const;
export type TenantPlan = (typeof tenantPlans)[number];

export const tenantStatuses = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const dashboardRoles = ['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'VIEWER'] as const;
export type DashboardRole = (typeof dashboardRoles)[number];

export const apiKeyStatuses = ['ACTIVE', 'REVOKED'] as const;
export type ApiKeyStatus = (typeof apiKeyStatuses)[number];

export interface EventInput {
  event: string;
  idempotency_key?: string;
  external_event_id?: string;
  user: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
  };
  data?: Record<string, unknown>;
}

export interface DeliveryResult {
  providerMessageId?: string;
  delivered?: boolean;
}

export interface NotificationPayload {
  deliveryId: string;
  notificationId: string;
  tenantId: string;
  userId: string;
  channel: Channel;
  title: string;
  subject?: string | null;
  body: string;
  email?: string | null;
  deviceToken?: string | null;
  webhookUrl?: string;
  webhookSecret?: string;
}
