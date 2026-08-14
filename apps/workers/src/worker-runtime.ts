import { createHmac, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, Channel, DeliveryStatus, NotificationStatus, WebhookStatus } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { decryptWebhookSecret } from './secret-cipher';
import { DeliveryError } from './provider-error';
import { sendEmail, sendPush } from './providers';
import { isAllowedWebhookUrl } from './webhook-url';

type DeliveryJob = { deliveryId: string };
type WebhookJob = { webhookDeliveryId: string };

const MAX_ATTEMPTS = 5;
const queueNames = ['email', 'push', 'webhook'] as const;

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl?.startsWith('prisma://') || databaseUrl?.startsWith('prisma+postgres://')) {
    return new PrismaClient({ datasourceUrl: databaseUrl }).$extends(withAccelerate()) as unknown as PrismaClient;
  }
  return new PrismaClient();
}

function priorityFor(status: NotificationStatus): number {
  return status === NotificationStatus.RETRYING ? 2 : 5;
}

export class WorkerRuntime {
  private readonly prisma = createPrismaClient();
  private readonly redis: IORedis;
  private readonly queues: Record<string, Queue>;
  private readonly workers: Worker[] = [];

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is required');
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queues = Object.fromEntries([...queueNames, 'dead-letter'].map((name) => [name, new Queue(name, { connection: this.redis })]));
  }

  async start(): Promise<void> {
    await this.prisma.$connect();
    await this.redis.ping();
    this.workers.push(new Worker<DeliveryJob>('email', (job) => this.processDelivery(job), { connection: this.redis, concurrency: 10 }));
    this.workers.push(new Worker<DeliveryJob>('push', (job) => this.processDelivery(job), { connection: this.redis, concurrency: 20 }));
    this.workers.push(new Worker<DeliveryJob | WebhookJob>('webhook', (job) => job.name === 'webhook.send' ? this.processWebhook(job as Job<WebhookJob>) : this.processDelivery(job as Job<DeliveryJob>), { connection: this.redis, concurrency: 10 }));
    for (const worker of this.workers) {
      worker.on('failed', (job, error) => {
        void this.sendToDeadLetter(job, error).catch((deadLetterError) => {
          console.error(JSON.stringify({
            message: 'Unable to enqueue failed job in dead-letter queue',
            queue: job?.queueName,
            jobId: job?.id,
            error: deadLetterError instanceof Error ? deadLetterError.message : String(deadLetterError),
          }));
        });
      });
    }
    console.info(JSON.stringify({ message: 'Notification workers started', queues: queueNames }));
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
    await this.redis.quit();
    await this.prisma.$disconnect();
  }

  private async sendToDeadLetter(job: Job | undefined, error: Error): Promise<void> {
    if (!job || job.queueName === 'dead-letter') return;
    const terminal = error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? MAX_ATTEMPTS);
    if (!terminal) return;
    await this.queues['dead-letter'].add('delivery.failed', { source_queue: job.queueName, source_job_id: job.id, payload: job.data, error: error.message, failed_at: new Date().toISOString() }, { jobId: `dead-${job.queueName}-${job.id}`, removeOnComplete: 1000 });
  }

  private async processDelivery(job: Job<DeliveryJob>): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: job.data.deliveryId }, include: { notification: { include: { user: { include: { devices: true } } } } } });
    if (!delivery) return;
    const notification = delivery.notification;
    const completedDeliveryStatuses: DeliveryStatus[] = [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED];
    if (completedDeliveryStatuses.includes(delivery.status)) return;
    if (notification.status === NotificationStatus.CANCELLED) {
      await this.prisma.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.CANCELLED } });
      return;
    }
    if (notification.expiresAt && notification.expiresAt <= new Date()) {
      await this.prisma.$transaction([this.prisma.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.CANCELLED } }), this.prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.EXPIRED } })]);
      return;
    }
    await this.prisma.$transaction([this.prisma.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.PROCESSING, attempts: { increment: 1 }, errorCode: null, errorMessage: null } }), this.prisma.notification.update({ where: { id: notification.id, status: { in: [NotificationStatus.QUEUED, NotificationStatus.RETRYING, NotificationStatus.CREATED] } }, data: { status: NotificationStatus.PROCESSING } })]);

    try {
      let providerMessageId: string;
      if (delivery.channel === Channel.EMAIL) {
        providerMessageId = (await sendEmail({ to: notification.user.email, subject: notification.subject, body: notification.body })).providerMessageId;
      } else if (delivery.channel === Channel.PUSH) {
        const result = await sendPush({ tokens: notification.user.devices.map((device) => device.deviceToken), title: notification.title, body: notification.body });
        if (result.invalidTokens.length) await this.prisma.device.deleteMany({ where: { deviceToken: { in: result.invalidTokens } } });
        providerMessageId = result.providerMessageId;
      } else {
        await this.createWebhookDeliveries(notification.tenantId, notification.id, 'notification.requested', { event: 'notification.requested', notification_id: notification.id, channel: 'webhook', timestamp: new Date().toISOString() });
        providerMessageId = `webhook-fanout-${randomUUID()}`;
      }
      await this.prisma.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.SENT, sentAt: new Date(), providerMessageId } });
      await this.refreshNotificationStatus(notification.id);
      if (delivery.channel !== Channel.WEBHOOK) await this.createWebhookDeliveries(notification.tenantId, notification.id, 'notification.sent', { event: 'notification.sent', notification_id: notification.id, channel: delivery.channel.toLowerCase(), timestamp: new Date().toISOString() });
    } catch (error) {
      await this.handleDeliveryError(delivery.id, notification.id, job, error);
    }
  }

  private async handleDeliveryError(deliveryId: string, notificationId: string, job: Job, error: unknown): Promise<never> {
    const classified = error instanceof DeliveryError ? error : new DeliveryError('PROVIDER_ERROR', 'An unexpected provider error occurred.', true);
    const finalAttempt = !classified.retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? MAX_ATTEMPTS);
    await this.prisma.$transaction([
      this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: finalAttempt ? DeliveryStatus.FAILED : DeliveryStatus.RETRYING, errorCode: classified.code, errorMessage: classified.message, ...(finalAttempt ? { failedAt: new Date() } : {}) } }),
      this.prisma.notification.update({ where: { id: notificationId }, data: { status: finalAttempt ? NotificationStatus.FAILED : NotificationStatus.RETRYING } }),
    ]);
    if (classified.retryable && !finalAttempt) throw new Error(classified.message);
    throw new UnrecoverableError(classified.message);
  }

  private async refreshNotificationStatus(notificationId: string): Promise<void> {
    const deliveries = await this.prisma.delivery.findMany({ where: { notificationId }, select: { status: true } });
    const successfulStatuses: DeliveryStatus[] = [DeliveryStatus.SENT, DeliveryStatus.DELIVERED];
    if (deliveries.length && deliveries.every((delivery) => successfulStatuses.includes(delivery.status))) {
      await this.prisma.notification.update({ where: { id: notificationId }, data: { status: NotificationStatus.SENT } });
    }
  }

  private async createWebhookDeliveries(tenantId: string, notificationId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({ where: { tenantId, status: WebhookStatus.ACTIVE, events: { hasSome: [event, '*'] } } });
    for (const webhook of webhooks) {
      const dedupeKey = `webhook-${webhook.id}-${event}-${notificationId}`;
      const delivery = await this.prisma.webhookDelivery.upsert({ where: { dedupeKey }, update: {}, create: { tenantId, webhookId: webhook.id, notificationId, event, dedupeKey, payload: payload as Prisma.InputJsonValue } });
      await this.queues.webhook.add('webhook.send', { webhookDeliveryId: delivery.id }, { jobId: `webhook-${delivery.id}`, attempts: MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 30_000 }, priority: priorityFor(NotificationStatus.SENT), removeOnComplete: 1000, removeOnFail: 1000 });
    }
  }

  private async processWebhook(job: Job<WebhookJob>): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: job.data.webhookDeliveryId }, include: { webhook: true } });
    const finalWebhookStatuses: DeliveryStatus[] = [DeliveryStatus.SENT, DeliveryStatus.CANCELLED];
    if (!delivery || finalWebhookStatuses.includes(delivery.status)) return;
    await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.PROCESSING, attempts: { increment: 1 }, errorCode: null, errorMessage: null } });
    try {
      if (!isAllowedWebhookUrl(delivery.webhook.url)) throw new DeliveryError('PERMANENT_FAILURE', 'Webhook endpoint URL is not allowed.', false);
      const body = JSON.stringify(delivery.payload);
      const signature = createHmac('sha256', decryptWebhookSecret(delivery.webhook.secret)).update(body).digest('hex');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000));
      let response: Response;
      try {
        response = await fetch(delivery.webhook.url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'x-notification-signature': `sha256=${signature}`, 'x-notification-event': delivery.event, 'x-notification-id': delivery.notificationId ?? '' }, body, signal: controller.signal });
      } finally { clearTimeout(timeout); }
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new DeliveryError(retryable ? response.status === 429 ? 'RATE_LIMITED' : 'TEMPORARY_FAILURE' : 'PERMANENT_FAILURE', `Webhook endpoint returned HTTP ${response.status}.`, retryable);
      }
      await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.SENT, sentAt: new Date() } });
    } catch (error) {
      const classified = error instanceof DeliveryError ? error : new DeliveryError(error instanceof DOMException && error.name === 'AbortError' ? 'TIMEOUT' : 'TEMPORARY_FAILURE', 'Webhook request failed.', true);
      const finalAttempt = !classified.retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? MAX_ATTEMPTS);
      await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: finalAttempt ? DeliveryStatus.FAILED : DeliveryStatus.RETRYING, errorCode: classified.code, errorMessage: classified.message, ...(finalAttempt ? { failedAt: new Date() } : {}) } });
      if (classified.retryable && !finalAttempt) throw new Error(classified.message);
      throw new UnrecoverableError(classified.message);
    }
  }
}
