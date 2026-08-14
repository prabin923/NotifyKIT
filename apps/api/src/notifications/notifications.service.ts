import { Channel, DeliveryStatus, NotificationStatus, Priority } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { PreferencesService } from '../preferences/preferences.service';
import { QueueService } from '../queue/queue.service';
import { assertNotificationTransition } from './notification-state';
import type { CreateNotificationDto } from './dto';
import { RateLimiterService } from '../common/rate-limiter.service';

export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly preferences: PreferencesService, private readonly queue: QueueService, private readonly rateLimiter: RateLimiterService) {}

  async create(tenantId: string, input: CreateNotificationDto): Promise<{ id: string; status: NotificationStatus; delivery_ids: string[] }> {
    if (input.expires_at && input.scheduled_at && input.expires_at <= input.scheduled_at) throw new ApiError('INVALID_SCHEDULE', 'expires_at must be after scheduled_at.', 400);
    const user = await this.prisma.user.findFirst({ where: { tenantId, externalId: input.user_id } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'The target user does not exist for this tenant. Send an event with user data first.', 404);
    const category = input.notification.category ?? 'transactional';
    const enabledChannels = await this.preferences.enabledChannels(tenantId, user.id, category, [...new Set(input.channels)]);
    if (!enabledChannels.length) throw new ApiError('NO_ENABLED_CHANNELS', 'All requested channels are disabled by user preferences.', 409);
    await this.rateLimiter.consumeNotifications(tenantId, user.externalId, enabledChannels);
    const result = await this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({ data: { tenantId, userId: user.id, title: input.notification.title, subject: input.notification.title, body: input.notification.message, priority: input.notification.priority ?? Priority.NORMAL, category, status: NotificationStatus.QUEUED, scheduledAt: input.scheduled_at, expiresAt: input.expires_at } });
      const deliveryIds: string[] = [];
      for (const channel of enabledChannels) {
        const delivery = await tx.delivery.create({ data: { tenantId, notificationId: notification.id, channel, provider: channel === Channel.EMAIL ? (process.env.EMAIL_PROVIDER ?? 'console') : channel === Channel.PUSH ? (process.env.PUSH_PROVIDER ?? 'console') : 'webhook', status: DeliveryStatus.QUEUED } });
        const priority = notification.priority === Priority.CRITICAL ? 1 : notification.priority === Priority.HIGH ? 2 : notification.priority === Priority.NORMAL ? 5 : 10;
        await this.queue.enqueueOutbox({ tenantId, queue: channel === Channel.EMAIL ? 'email' : channel === Channel.PUSH ? 'push' : 'webhook', jobName: 'delivery.send', dedupeKey: `delivery-${delivery.id}`, payload: { deliveryId: delivery.id, priority }, availableAt: input.scheduled_at }, tx);
        deliveryIds.push(delivery.id);
      }
      return { id: notification.id, status: notification.status, delivery_ids: deliveryIds };
    });
    await this.queue.flushOutbox();
    return result;
  }

  async list(tenantId: string, input: { status?: NotificationStatus; limit?: number; cursor?: string }) {
    const take = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const rows = await this.prisma.notification.findMany({ where: { tenantId, ...(input.status ? { status: input.status } : {}) }, include: { user: { select: { externalId: true, email: true } }, deliveries: true }, orderBy: { createdAt: 'desc' }, take: take + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) });
    const next = rows.length > take ? rows.pop() : undefined;
    return { items: rows, next_cursor: next?.id ?? null };
  }

  async get(tenantId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, tenantId }, include: { user: { select: { externalId: true, email: true } }, event: { select: { id: true, eventType: true } }, deliveries: true } });
    if (!notification) throw new ApiError('NOT_FOUND', 'Notification not found.', 404);
    return notification;
  }

  async cancel(tenantId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.findFirst({ where: { id, tenantId } });
      if (!notification) throw new ApiError('NOT_FOUND', 'Notification not found.', 404);
      const terminal: NotificationStatus[] = [NotificationStatus.CANCELLED, NotificationStatus.DELIVERED, NotificationStatus.OPENED, NotificationStatus.FAILED, NotificationStatus.EXPIRED];
      if (terminal.includes(notification.status)) {
        throw new ApiError('NOT_CANCELLABLE', `A notification in ${notification.status} state cannot be cancelled.`, 409);
      }
      assertNotificationTransition(notification.status, NotificationStatus.CANCELLED);
      await tx.notification.update({ where: { id }, data: { status: NotificationStatus.CANCELLED, cancelledAt: new Date() } });
      await tx.delivery.updateMany({ where: { tenantId, notificationId: id, status: { in: [DeliveryStatus.QUEUED, DeliveryStatus.RETRYING] } }, data: { status: DeliveryStatus.CANCELLED } });
    });
  }
}
