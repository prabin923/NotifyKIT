import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Channel, PrismaClient, TemplateStatus, WorkflowStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { WorkerRuntime } from '../../workers/src/worker-runtime';

const prisma = new PrismaClient();
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Universal event acceptance flow (e2e)', () => {
  let app: INestApplication;
  let workers: WorkerRuntime;
  let tenantId: string;
  const apiKey = `nk_test_${randomBytes(24).toString('base64url')}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL ??= 'postgresql://notification:notification@localhost:5432/notification_platform?schema=public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-longer-than-thirty-two-characters';
    process.env.API_KEY_PEPPER ??= 'test-api-key-pepper-that-is-longer-than-twenty-four-characters';
    process.env.WEBHOOK_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
    process.env.EMAIL_PROVIDER = 'console';
    const tenant = await prisma.tenant.create({ data: { name: 'E2E tenant', slug: `e2e-${randomBytes(6).toString('hex')}`, tenantPolicy: { create: {} } } });
    tenantId = tenant.id;
    await prisma.apiKey.create({ data: { tenantId, name: 'E2E key', prefix: apiKey.slice(0, 12), keyHash: createHash('sha256').update(`${process.env.API_KEY_PEPPER}:${apiKey}`).digest('hex'), permissions: ['events:write'] } });
    await prisma.template.create({ data: { tenantId, name: 'Order email', eventType: 'order.created', channel: Channel.EMAIL, subject: 'Order {{data.order_id}}', body: 'Hello {{user.name}}, order {{data.order_id}}', status: TemplateStatus.ACTIVE } });
    await prisma.workflow.create({ data: { tenantId, name: 'Order flow', eventType: 'order.created', status: WorkflowStatus.ACTIVE, definition: { nodes: [{ type: 'EVENT' }, { type: 'SEND_NOTIFICATION', channels: ['EMAIL'] }, { type: 'END' }] } } });
    workers = new WorkerRuntime(); await workers.start();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
  });

  afterAll(async () => {
    await app?.close(); await workers?.stop(); await prisma.tenant.delete({ where: { id: tenantId } }); await prisma.$disconnect();
  });

  it('deduplicates an event and records its asynchronous email delivery', async () => {
    const payload = { event: 'order.created', user: { id: 'demo-user', email: 'demo@example.test', name: 'Demo User' }, data: { order_id: 'ORD-123', amount: 2500 } };
    const first = await request(app.getHttpServer()).post('/v1/events').set('Authorization', `Bearer ${apiKey}`).set('Idempotency-Key', 'demo-order-123').send(payload).expect(202);
    expect(first.body.success).toBe(true); expect(first.body.status).toBe('accepted');
    const second = await request(app.getHttpServer()).post('/v1/events').set('Authorization', `Bearer ${apiKey}`).set('Idempotency-Key', 'demo-order-123').send(payload).expect(202);
    expect(second.body.event_id).toBe(first.body.event_id); expect(second.body.idempotent_replay).toBe(true);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const delivery = await prisma.delivery.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      if (delivery?.status === 'SENT') { expect(await prisma.event.count({ where: { tenantId } })).toBe(1); return; }
      await delay(100);
    }
    throw new Error('Expected worker to send the queued delivery');
  });
});
