import IORedis from 'ioredis';
import { ApiError } from './api-error';
import { PrismaService } from './prisma.service';

export class RateLimiterService {
  private redis!: IORedis;
  constructor(private readonly prisma: PrismaService) {}
  async start(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is required');
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
    await this.redis.ping();
  }
  async stop(): Promise<void> { await this.redis?.quit(); }

  private async consume(scope: string, limit: number, seconds: number): Promise<void> {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const key = `rate:${scope}:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, seconds + 1);
    if (count > limit) throw new ApiError('RATE_LIMITED', 'Rate limit exceeded. Retry after the current time window.', 429, { scope, limit, retry_after_seconds: seconds - (Math.floor(Date.now() / 1000) % seconds) });
  }

  async consumeRequest(tenantId: string, keyId: string): Promise<void> {
    const policy = await this.prisma.tenantPolicy.findUnique({ where: { tenantId }, select: { requestsPerMinute: true } });
    const limit = policy?.requestsPerMinute ?? 100;
    await Promise.all([this.consume(`tenant:${tenantId}:requests`, limit, 60), this.consume(`api-key:${keyId}:requests`, limit, 60)]);
  }

  async consumeNotifications(tenantId: string, externalUserId: string, channels: string[]): Promise<void> {
    const policy = await this.prisma.tenantPolicy.findUnique({ where: { tenantId }, select: { notificationsPerHour: true } });
    const tenantLimit = policy?.notificationsPerHour ?? 10_000;
    const userLimit = Math.max(10, Math.floor(tenantLimit / 10));
    await this.consume(`tenant:${tenantId}:notifications`, tenantLimit, 3600);
    await this.consume(`tenant:${tenantId}:user:${externalUserId}`, userLimit, 3600);
    await Promise.all(channels.map((channel) => this.consume(`tenant:${tenantId}:channel:${channel}`, tenantLimit, 3600)));
  }
}
