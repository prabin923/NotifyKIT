import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ApiError } from '../common/api-error';
import { QUEUE_NAMES, type QueueName } from './queue.constants';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection!: IORedis;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) throw new Error('REDIS_URL is required');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
    await this.connection.ping();
    for (const queueName of Object.values(QUEUE_NAMES)) this.queues.set(queueName, new Queue(queueName, { connection: this.connection }));
    await this.flushOutbox();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection?.quit();
  }

  async enqueueOutbox(input: { tenantId: string; queue: QueueName; jobName: string; dedupeKey: string; payload: Record<string, unknown>; availableAt?: Date }, transaction: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    await transaction.outboxJob.create({ data: { tenantId: input.tenantId, queue: input.queue, jobName: input.jobName, dedupeKey: input.dedupeKey, payload: input.payload as Prisma.InputJsonValue, availableAt: input.availableAt } });
  }

  async flushOutbox(): Promise<number> {
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
        this.logger.error(`Unable to enqueue outbox job ${record.id}`);
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
