export const QUEUE_NAMES = {
  notification: 'notification',
  email: 'email',
  push: 'push',
  webhook: 'webhook',
  retry: 'retry',
  deadLetter: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface DeliveryJobData { deliveryId: string }
export interface WebhookJobData { webhookId: string; event: string; payload: Record<string, unknown> }
