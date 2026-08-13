import type { Channel } from '@prisma/client';

export interface ProviderDeliveryPayload {
  deliveryId: string;
  notificationId: string;
  channel: Channel;
  to: { email?: string | null; deviceToken?: string | null };
  subject?: string | null;
  title: string;
  body: string;
}

export interface ProviderDeliveryResult { providerMessageId?: string; delivered: boolean }

export interface NotificationProvider {
  readonly channel: Channel;
  readonly name: string;
  validateConfiguration(): Promise<boolean>;
  send(payload: ProviderDeliveryPayload): Promise<ProviderDeliveryResult>;
}
