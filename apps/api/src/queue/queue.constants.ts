import { Channel } from '@prisma/client';

export const QUEUE_NAMES = {
  notification: 'notification',
  email: 'email',
  push: 'push',
  inApp: 'in-app',
  webhook: 'webhook',
  retry: 'retry',
  deadLetter: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface DeliveryJobData { deliveryId: string }
export interface WebhookJobData { webhookId: string; event: string; payload: Record<string, unknown> }

// Shared by NotificationsService.create and EventsService.accept so every delivery path
// labels and routes a channel the same way instead of re-deriving it per call site.
export function channelProvider(channel: Channel): string {
  if (channel === Channel.EMAIL) return process.env.EMAIL_PROVIDER ?? 'console';
  if (channel === Channel.PUSH) return process.env.PUSH_PROVIDER ?? 'console';
  if (channel === Channel.IN_APP) return 'in_app';
  return 'webhook';
}

export function channelQueue(channel: Channel): QueueName {
  if (channel === Channel.EMAIL) return QUEUE_NAMES.email;
  if (channel === Channel.PUSH) return QUEUE_NAMES.push;
  if (channel === Channel.IN_APP) return QUEUE_NAMES.inApp;
  return QUEUE_NAMES.webhook;
}
