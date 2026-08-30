import { Channel, type Notification, type Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import type { InboxListQuery } from './dto';

export type InboxAction = 'read' | 'unread' | 'seen' | 'archive';

interface InboxItemState {
  seenAt: Date | null;
}

// Pure state-transition logic, tested without a database in inbox.service.spec.ts.
export function inboxActionPatch(action: InboxAction, current: InboxItemState, now: Date): Prisma.NotificationUpdateInput {
  switch (action) {
    // Reading something implies it was seen; keep the earliest seen time if one is on record.
    case 'read': return { readAt: now, seenAt: current.seenAt ?? now };
    case 'unread': return { readAt: null };
    case 'seen': return { seenAt: current.seenAt ?? now };
    case 'archive': return { archivedAt: now };
  }
}

function toInboxItem(notification: Notification) {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    category: notification.category,
    priority: notification.priority,
    data: notification.data,
    created_at: notification.createdAt,
    seen_at: notification.seenAt,
    read_at: notification.readAt,
    archived_at: notification.archivedAt,
  };
}

export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  // Tenant AND user scoping is applied on every query here: an inbox token only ever
  // proves who the caller is, never which tenant's data it may read.
  private scope(tenantId: string, userId: string, query: Pick<InboxListQuery, 'status' | 'archived'>): Prisma.NotificationWhereInput {
    return {
      tenantId,
      userId,
      deliveries: { some: { channel: Channel.IN_APP } },
      archivedAt: query.archived ? { not: null } : null,
      ...(query.status === 'unread' ? { readAt: null } : {}),
      ...(query.status === 'read' ? { readAt: { not: null } } : {}),
    };
  }

  async list(tenantId: string, userId: string, query: InboxListQuery) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.notification.findMany({
      where: this.scope(tenantId, userId, query),
      // `id` is a stable tiebreaker: notifications fanned out from one event share a
      // createdAt, and cursor pagination on id alone would skip or repeat them.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    // The cursor must be the last row the client actually received: the extra
    // take + 1 row only proves another page exists, and pairing its id with the
    // next request's `skip: 1` would step over it and lose it entirely.
    const hasMore = rows.length > take;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];
    return { items: rows.map(toInboxItem), next_cursor: hasMore && last ? last.id : null };
  }

  async count(tenantId: string, userId: string): Promise<{ unread: number; total: number }> {
    const base: Prisma.NotificationWhereInput = { tenantId, userId, deliveries: { some: { channel: Channel.IN_APP } }, archivedAt: null };
    const [unread, total] = await Promise.all([
      this.prisma.notification.count({ where: { ...base, readAt: null } }),
      this.prisma.notification.count({ where: base }),
    ]);
    return { unread, total };
  }

  private async findOwnedOrThrow(tenantId: string, userId: string, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({ where: { id, tenantId, userId, deliveries: { some: { channel: Channel.IN_APP } } } });
    if (!notification) throw new ApiError('NOT_FOUND', 'Inbox item not found.', 404);
    return notification;
  }

  private async applyAction(tenantId: string, userId: string, id: string, action: InboxAction) {
    const notification = await this.findOwnedOrThrow(tenantId, userId, id);
    const patch = inboxActionPatch(action, { seenAt: notification.seenAt }, new Date());
    const updated = await this.prisma.notification.update({ where: { id: notification.id }, data: patch });
    return toInboxItem(updated);
  }

  read(tenantId: string, userId: string, id: string) { return this.applyAction(tenantId, userId, id, 'read'); }
  unread(tenantId: string, userId: string, id: string) { return this.applyAction(tenantId, userId, id, 'unread'); }
  seen(tenantId: string, userId: string, id: string) { return this.applyAction(tenantId, userId, id, 'seen'); }
  archive(tenantId: string, userId: string, id: string) { return this.applyAction(tenantId, userId, id, 'archive'); }

  async readAll(tenantId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId, userId, deliveries: { some: { channel: Channel.IN_APP } }, archivedAt: null, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async dashboardList(tenantId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId, deliveries: { some: { channel: Channel.IN_APP } } },
      include: { user: { select: { externalId: true } }, deliveries: { where: { channel: Channel.IN_APP } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
