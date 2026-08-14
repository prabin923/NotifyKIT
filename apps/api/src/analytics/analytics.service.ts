import { DeliveryStatus, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
  async overview(tenantId: string, from = new Date(new Date().setUTCHours(0, 0, 0, 0)), to = new Date()): Promise<Record<string, unknown>> {
    const dateRange = { gte: from, lte: to };
    const [total, sent, delivered, failed, pending, channelBreakdown, recentEvents, recentFailures] = await Promise.all([
      this.prisma.notification.count({ where: { tenantId, createdAt: dateRange } }),
      this.prisma.notification.count({ where: { tenantId, status: NotificationStatus.SENT, createdAt: dateRange } }),
      this.prisma.notification.count({ where: { tenantId, status: NotificationStatus.DELIVERED, createdAt: dateRange } }),
      this.prisma.notification.count({ where: { tenantId, status: NotificationStatus.FAILED, createdAt: dateRange } }),
      this.prisma.notification.count({ where: { tenantId, status: { in: [NotificationStatus.CREATED, NotificationStatus.QUEUED, NotificationStatus.PROCESSING, NotificationStatus.RETRYING] }, createdAt: dateRange } }),
      this.prisma.delivery.groupBy({ by: ['channel', 'status'], where: { tenantId, createdAt: dateRange }, _count: { _all: true } }),
      this.prisma.event.findMany({ where: { tenantId }, select: { id: true, eventType: true, status: true, createdAt: true }, take: 10, orderBy: { createdAt: 'desc' } }),
      this.prisma.delivery.findMany({ where: { tenantId, status: DeliveryStatus.FAILED }, select: { id: true, channel: true, errorCode: true, errorMessage: true, createdAt: true, notificationId: true }, take: 10, orderBy: { updatedAt: 'desc' } }),
    ]);
    return { period: { from, to }, total_notifications: total, sent, delivered, failed, pending, delivery_rate: total ? Number((((sent + delivered) / total) * 100).toFixed(2)) : 0, failure_rate: total ? Number(((failed / total) * 100).toFixed(2)) : 0, channel_breakdown: channelBreakdown, recent_events: recentEvents, recent_failures: recentFailures };
  }
}
