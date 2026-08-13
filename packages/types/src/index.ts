export const notificationStatuses = [
  'CREATED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'OPENED',
  'FAILED', 'RETRYING', 'CANCELLED', 'EXPIRED',
] as const;

export type NotificationStatus = (typeof notificationStatuses)[number];

export const channels = ['EMAIL', 'PUSH', 'WEBHOOK'] as const;
export type Channel = (typeof channels)[number];

export const priorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof priorities)[number];

export interface EventInput {
  event: string;
  idempotency_key?: string;
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
