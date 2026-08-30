import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ApiError } from '../common/api-error';
import { QUEUE_NAMES, type QueueName } from './queue.constants';

export class QueueService {
  private connection!: IORedis;
  private readonly queues = new Map<QueueName, Queue>();
  private flushTimer?: NodeJS.Timeout;
  private flushing?: Promise<number>;

  constructor(private readonly prisma: PrismaService) {}

  // `serverless: true` (Vercel/Prisma Compute cold starts) still connects to Redis, creates
  // the queues, and runs one flush so anything already committed gets enqueued, but skips the
  // recurring timer: a function instance can be frozen or recycled between invocations, and an
  // un-cleared interval would otherwise leak per cold start with no process lifecycle to stop it.
  async start(options?: { serverless?: boolean }): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is required');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
    await this.connection.ping();
    for (const queueName of Object.values(QUEUE_NAMES)) this.queues.set(queueName, new Queue(queueName, { connection: this.connection }));
    await this.flushOutbox();
    if (options?.serverless) return;
    const interval = Number(process.env.OUTBOX_FLUSH_INTERVAL_MS ?? 5_000);
    if (!Number.isSafeInteger(interval) || interval < 100) throw new Error('OUTBOX_FLUSH_INTERVAL_MS must be an integer of at least 100 milliseconds');
    this.flushTimer = setInterval(() => {
      void this.flushOutbox().catch((error: unknown) => {
        console.error(`Unable to retry pending outbox jobs: ${error instanceof Error ? error.message : 'Unknown queue error'}`);
      });
    }, interval);
    this.flushTimer.unref();
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection?.quit();
  }

  async enqueueOutbox(input: { tenantId: string; queue: QueueName; jobName: string; dedupeKey: string; payload: Record<string, unknown>; availableAt?: Date }, transaction: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    await transaction.outboxJob.create({ data: { tenantId: input.tenantId, queue: input.queue, jobName: input.jobName, dedupeKey: input.dedupeKey, payload: input.payload as Prisma.InputJsonValue, availableAt: input.availableAt } });
  }

  async flushOutbox(): Promise<number> {
    if (this.flushing) return this.flushing;
    const pending = this.flushPendingOutbox();
    this.flushing = pending;
    try {
      return await pending;
    } finally {
      if (this.flushing === pending) this.flushing = undefined;
    }
  }

  private async flushPendingOutbox(): Promise<number> {
    const pending = await this.prisma.outboxJob.findMany({ where: { processedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 });
    let flushed = 0;
    for (const record of pending) {
      const queue = this.queues.get(record.queue as QueueName);
      if (!queue) continue;
      try {
        const payload = record.payload as unknown as Record<string, unknown>;
        const priority = typeof payload.priority === 'number' ? payload.priority : undefined;
        const delay = Math.max(0, record.availableAt.getTime() - Date.now());
        await queue.add(record.jobName, record.payload, { jobId: record.dedupeKey, attempts: 5, backoff: { type: 'exponential', delay: 30_000 }, priority, delay, removeOnComplete: 1000, removeOnFail: 1000 });
        await this.prisma.outboxJob.update({ where: { id: record.id }, data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
        flushed += 1;
      } catch (error) {
        await this.prisma.outboxJob.update({ where: { id: record.id }, data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown queue error' } });
        console.error(`Unable to enqueue outbox job ${record.id}`);
        throw new ApiError('QUEUE_UNAVAILABLE', 'Notification queue is temporarily unavailable. The event was not accepted.', 503);
      }
    }
    return flushed;
  }

  getQueue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Queue ${name} has not been initialized`);
    return queue;
  }

  async health(): Promise<{ redis: 'ok'; queues: number }> {
    await this.connection.ping();
    return { redis: 'ok', queues: this.queues.size };
  }
}
