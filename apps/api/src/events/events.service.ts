import { Channel, EventStatus, Priority, Prisma, WorkflowStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { PreferencesService } from '../preferences/preferences.service';
import { QueueService } from '../queue/queue.service';
import { TemplatesService } from '../templates/templates.service';
import { RateLimiterService } from '../common/rate-limiter.service';
import type { CreateEventDto, UpdateEventDto } from './dto';

interface WorkflowChoice { channels: Channel[]; category: string; priority: Priority }

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } as Record<string, Prisma.JsonValue> : {};
}

export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly preferences: PreferencesService,
    private readonly queue: QueueService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  private workflowChoice(definition: Prisma.JsonValue | null): WorkflowChoice | null {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return null;
    const nodes = (definition as Record<string, unknown>).nodes;
    if (!Array.isArray(nodes)) return null;
    const send = nodes.find((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object' && !Array.isArray(node) && node.type === 'SEND_NOTIFICATION');
    if (!send) return null;
    const channels = Array.isArray(send.channels) ? send.channels.filter((channel): channel is Channel => Object.values(Channel).includes(channel as Channel)) : [];
    return { channels, category: typeof send.category === 'string' ? send.category : 'transactional', priority: Object.values(Priority).includes(send.priority as Priority) ? send.priority as Priority : Priority.NORMAL };
  }

  async accept(tenantId: string, input: CreateEventDto, idempotencyKey?: string): Promise<{ event_id: string; status: 'accepted'; notification_ids: string[]; idempotent_replay?: boolean }> {
    const key = idempotencyKey ?? input.idempotency_key;
    if (key) {
      const existing = await this.prisma.event.findFirst({ where: { tenantId, idempotencyKey: key }, include: { notifications: { select: { id: true } } } });
      if (existing) {
        await this.queue.flushOutbox();
        return { event_id: existing.id, status: 'accepted', notification_ids: existing.notifications.map((notification) => notification.id), idempotent_replay: true };
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { tenantId_externalId: { tenantId, externalId: input.user.id } },
        update: { name: input.user.name, email: input.user.email, phone: input.user.phone },
        create: { tenantId, externalId: input.user.id, name: input.user.name, email: input.user.email, phone: input.user.phone },
      });
      const event = await tx.event.create({ data: { tenantId, eventType: input.event, externalEventId: input.external_event_id, idempotencyKey: key, payload: { user: { id: input.user.id, email: input.user.email, phone: input.user.phone, name: input.user.name }, data: input.data ?? {} } as Prisma.InputJsonValue, status: EventStatus.ACCEPTED } });
      const workflow = await tx.workflow.findFirst({ where: { tenantId, eventType: input.event, status: WorkflowStatus.ACTIVE }, orderBy: { updatedAt: 'desc' } });
      const choice = this.workflowChoice(workflow?.definition ?? null);
      const activeTemplates = await this.templates.activeForEvent(tenantId, input.event, choice?.channels);
      const requested = choice?.channels.length ? choice.channels : [...activeTemplates.keys()];
      const channels = requested.length ? requested : user.email ? [Channel.EMAIL] : [];
      const category = choice?.category ?? 'transactional';
      const enabledChannels = await this.preferences.enabledChannels(tenantId, user.id, category, channels);
      if (enabledChannels.length) await this.rateLimiter.consumeNotifications(tenantId, user.externalId, enabledChannels);
      const notificationIds: string[] = [];

      for (const channel of enabledChannels) {
        const template = activeTemplates.get(channel);
        const context = { user: { id: user.externalId, name: user.name, email: user.email, phone: user.phone }, data: input.data ?? {} };
        const title = this.templates.render(template?.subject ?? `Update: ${input.event}`, context);
        const body = this.templates.render(template?.body ?? `An event of type ${input.event} was received.`, context);
        const notification = await tx.notification.create({ data: { tenantId, userId: user.id, eventId: event.id, templateId: template?.id, title, subject: template?.subject ? title : null, body, category, priority: choice?.priority ?? Priority.NORMAL, status: 'QUEUED' } });
        const delivery = await tx.delivery.create({ data: { tenantId, notificationId: notification.id, channel, provider: channel === Channel.EMAIL ? (process.env.EMAIL_PROVIDER ?? 'console') : channel === Channel.PUSH ? (process.env.PUSH_PROVIDER ?? 'console') : 'webhook', status: 'QUEUED' } });
        const queuePriority = choice?.priority === Priority.CRITICAL ? 1 : choice?.priority === Priority.HIGH ? 2 : choice?.priority === Priority.NORMAL ? 5 : 10;
        await this.queue.enqueueOutbox({ tenantId, queue: channel === Channel.EMAIL ? 'email' : channel === Channel.PUSH ? 'push' : 'webhook', jobName: 'delivery.send', dedupeKey: `delivery-${delivery.id}`, payload: { deliveryId: delivery.id, priority: queuePriority } }, tx);
        notificationIds.push(notification.id);
      }
      await tx.event.update({ where: { id: event.id }, data: { status: EventStatus.PROCESSING } });
      return { event_id: event.id, status: 'accepted' as const, notification_ids: notificationIds };
    });
    await this.queue.flushOutbox();
    return result;
  }

  async update(tenantId: string, eventId: string, input: UpdateEventDto) {
    const existing = await this.prisma.event.findFirst({ where: { id: eventId, tenantId } });
    if (!existing) throw new ApiError('EVENT_NOT_FOUND', 'Event not found.', 404);

    const data: Prisma.EventUpdateInput = {};
    if (input.event !== undefined) data.eventType = input.event;
    if (input.external_event_id !== undefined) data.externalEventId = input.external_event_id;
    if (input.data !== undefined) data.payload = { ...jsonObject(existing.payload), data: input.data } as Prisma.InputJsonValue;

    return this.prisma.event.update({ where: { id: existing.id }, data });
  }
}
