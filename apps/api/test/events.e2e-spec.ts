import { Channel, DashboardRole, DeliveryStatus, NotificationStatus, PrismaClient, Priority, TemplateStatus, WorkflowStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import request from 'supertest';
import { createExpressApi, type ExpressApi } from '../src/app';
import { SecretCipherService } from '../src/common/secret-cipher.service';
import { WorkerRuntime } from '../../workers/src/worker-runtime';

let prisma: PrismaClient;
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Universal event acceptance flow (e2e)', () => {
  let api: ExpressApi;
  let workers: WorkerRuntime;
  let tenantId: string;
  let dashboardToken: string;
  const dashboardPassword = 'E2eDashboardPassword123!';
  const dashboardOrigin = 'http://localhost:3101';
  const apiKey = `nk_test_${randomBytes(24).toString('base64url')}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://notification:notification@localhost:5432/notification_platform?schema=public';
    // Keep E2E queues separate from any local development worker that may be
    // running against Redis database 0.
    process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
    process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-longer-than-thirty-two-characters';
    process.env.API_KEY_PEPPER ??= 'test-api-key-pepper-that-is-longer-than-twenty-four-characters';
    process.env.WEBHOOK_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
    process.env.EMAIL_PROVIDER = 'console';
    process.env.OUTBOX_FLUSH_INTERVAL_MS = '100';
    process.env.DASHBOARD_URL = dashboardOrigin;
    process.env.CORS_ORIGINS = dashboardOrigin;
    prisma = new PrismaClient();
    const tenant = await prisma.tenant.create({ data: { name: 'E2E tenant', slug: `e2e-${randomBytes(6).toString('hex')}`, tenantPolicy: { create: {} } } });
    tenantId = tenant.id;
    await prisma.dashboardUser.create({ data: { tenantId, email: `owner-${randomBytes(6).toString('hex')}@example.test`, name: 'E2E Owner', role: DashboardRole.OWNER, passwordHash: await bcrypt.hash(dashboardPassword, 12) } });
    await prisma.apiKey.create({ data: { tenantId, name: 'E2E key', prefix: apiKey.slice(0, 12), keyHash: createHash('sha256').update(`${process.env.API_KEY_PEPPER}:${apiKey}`).digest('hex'), permissions: ['events:write'] } });
    await prisma.template.create({ data: { tenantId, name: 'Order email', eventType: 'order.created', channel: Channel.EMAIL, subject: 'Order {{data.order_id}}', body: 'Hello {{user.name}}, order {{data.order_id}}', status: TemplateStatus.ACTIVE } });
    await prisma.workflow.create({ data: { tenantId, name: 'Order flow', eventType: 'order.created', status: WorkflowStatus.ACTIVE, definition: { nodes: [{ type: 'EVENT' }, { type: 'SEND_NOTIFICATION', channels: ['EMAIL'] }, { type: 'END' }] } } });
    workers = new WorkerRuntime(); await workers.start();
    api = await createExpressApi();
  });

  afterAll(async () => {
    await api?.close(); await workers?.stop();
    if (tenantId) await prisma?.tenant.delete({ where: { id: tenantId } });
    await prisma?.$disconnect();
  });

  it('deduplicates an event and records its asynchronous email delivery', async () => {
    const payload = { event: 'order.created', user: { id: 'demo-user', email: 'demo@example.test', name: 'Demo User' }, data: { order_id: 'ORD-123', amount: 2500 } };
    const first = await request(api.app).post('/v1/events').set('Authorization', `Bearer ${apiKey}`).set('Idempotency-Key', 'demo-order-123').send(payload).expect(202);
    expect(first.body.success).toBe(true); expect(first.body.status).toBe('accepted');
    const second = await request(api.app).post('/v1/events').set('Authorization', `Bearer ${apiKey}`).set('Idempotency-Key', 'demo-order-123').send(payload).expect(202);
    expect(second.body.event_id).toBe(first.body.event_id); expect(second.body.idempotent_replay).toBe(true);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const delivery = await prisma.delivery.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      if (delivery?.status === 'SENT') { expect(await prisma.event.count({ where: { tenantId } })).toBe(1); return; }
      await delay(100);
    }
    throw new Error('Expected worker to send the queued delivery');
  });

  it('serves every dashboard resource through the Express API', async () => {
    const dashboardUser = await prisma.dashboardUser.findFirstOrThrow({ where: { tenantId } });
    const login = await request(api.app)
      .post('/v1/auth/login')
      .set('Origin', dashboardOrigin)
      .send({ email: dashboardUser.email, password: dashboardPassword })
      .expect(201);
    expect(login.headers['access-control-allow-origin']).toBe(dashboardOrigin);
    expect(login.body.success).toBe(true);
    dashboardToken = login.body.data.access_token as string;
    const preflight = await request(api.app)
      .options('/v1/dashboard/users')
      .set('Origin', dashboardOrigin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(dashboardOrigin);
    expect(preflight.headers['access-control-allow-headers']).toContain('Authorization');
    const endpoints = ['overview', 'notifications', 'events', 'templates', 'workflows', 'users', 'devices', 'webhooks', 'api-keys', 'audit-logs', 'channels', 'providers', 'settings'];
    for (const endpoint of endpoints) {
      const result = await request(api.app).get(`/v1/dashboard/${endpoint}`).set('Origin', dashboardOrigin).set('Authorization', `Bearer ${dashboardToken}`).expect(200);
      expect(result.headers['access-control-allow-origin']).toBe(dashboardOrigin);
      expect(result.body).toMatchObject({ success: true });
      expect(result.body).toHaveProperty('data');
    }
  });

  it('creates and manages dashboard resources through the Express API', async () => {
    const suffix = randomBytes(5).toString('hex');
    const authorization = `Bearer ${dashboardToken}`;
    const headers = { Authorization: authorization, Origin: dashboardOrigin };

    const event = await request(api.app).post('/v1/dashboard/events').set(headers).send({
      event: `dashboard.d${suffix}.created`,
      user: { id: `dashboard-user-${suffix}`, email: `dashboard-${suffix}@example.test`, name: 'Dashboard User' },
      data: { source: 'dashboard' },
    }).expect(202);
    expect(event.body.data.event_id).toEqual(expect.any(String));

    const updatedEvent = await request(api.app).patch(`/v1/dashboard/events/${event.body.data.event_id as string}`).set(headers).send({
      event: `dashboard.d${suffix}.updated`,
      external_event_id: `dashboard-event-${suffix}`,
      data: { source: 'dashboard', edited: true },
    }).expect(200);
    expect(updatedEvent.body.data).toMatchObject({
      id: event.body.data.event_id,
      eventType: `dashboard.d${suffix}.updated`,
      externalEventId: `dashboard-event-${suffix}`,
      payload: { data: { source: 'dashboard', edited: true } },
    });
    expect(await prisma.auditLog.findFirst({ where: { tenantId, resource: 'event', resourceId: event.body.data.event_id, action: 'event.updated' } })).not.toBeNull();

    const notification = await request(api.app).post('/v1/dashboard/notifications').set(headers).send({
      user_id: `dashboard-user-${suffix}`,
      notification: { title: 'Dashboard message', message: 'Scheduled safely for cancellation.', priority: 'NORMAL', category: 'transactional' },
      channels: ['EMAIL'],
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }).expect(202);
    const notificationId = notification.body.data.id as string;
    expect(notification.body.data.delivery_ids).toHaveLength(1);
    await request(api.app).post(`/v1/dashboard/notifications/${notificationId}/cancel`).set(headers).expect(204);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } })).status).toBe('CANCELLED');

    const template = await request(api.app).post('/v1/dashboard/templates').set(headers).send({
      name: `Dashboard template ${suffix}`, event_type: `dashboard.${suffix}.created`, channel: 'EMAIL',
      subject: 'Dashboard test', body: 'Hello {{user.name}}', language: 'en', status: 'DRAFT',
    }).expect(201);
    expect(template.body.data.id).toEqual(expect.any(String));
    const updatedTemplate = await request(api.app).patch(`/v1/dashboard/templates/${template.body.data.id as string}`).set(headers).send({ status: 'ACTIVE' }).expect(200);
    expect(updatedTemplate.body.data.status).toBe('ACTIVE');

    const workflow = await request(api.app).post('/v1/dashboard/workflows').set(headers).send({
      name: `Dashboard workflow ${suffix}`, event_type: `dashboard.${suffix}.created`, status: 'DRAFT',
      definition: { nodes: [{ type: 'EVENT' }, { type: 'SEND_NOTIFICATION', channels: ['EMAIL'] }, { type: 'END' }] },
    }).expect(201);
    expect(workflow.body.data.id).toEqual(expect.any(String));
    const updatedWorkflow = await request(api.app).patch(`/v1/dashboard/workflows/${workflow.body.data.id as string}`).set(headers).send({ status: 'DISABLED' }).expect(200);
    expect(updatedWorkflow.body.data.status).toBe('DISABLED');

    const webhook = await request(api.app).post('/v1/dashboard/webhooks').set(headers).send({
      url: `https://hooks-${suffix}.example.test/notification`, events: ['notification.sent'], secret: 'dashboard-test-webhook-secret',
    }).expect(201);
    expect(webhook.body.data).toMatchObject({ url: `https://hooks-${suffix}.example.test/notification`, secret: 'dashboard-test-webhook-secret' });
    // This test hook is intentionally unreachable. Disable it so later delivery
    // assertions do not create outbound retries against a placeholder domain.
    const updatedWebhook = await request(api.app).patch(`/v1/dashboard/webhooks/${webhook.body.data.id as string}`).set(headers).send({ status: 'DISABLED' }).expect(200);
    expect(updatedWebhook.body.data.status).toBe('DISABLED');

    const privateWebhook = await request(api.app).post('/v1/dashboard/webhooks').set(headers).send({
      url: 'https://127.0.0.1/internal', events: ['notification.sent'],
    }).expect(400);
    expect(privateWebhook.body.error.code).toBe('INVALID_WEBHOOK_URL');

    const createdKey = await request(api.app).post('/v1/api-keys').set(headers).send({
      name: `Dashboard key ${suffix}`, permissions: ['events:write'], environment: 'test',
    }).expect(201);
    expect(createdKey.body.data.key).toMatch(/^nk_test_/);
    await request(api.app).delete(`/v1/api-keys/${createdKey.body.data.id}`).set(headers).expect(204);

    const invalidWorkflow = await request(api.app).post('/v1/dashboard/workflows').set(headers).send({
      name: 'Invalid workflow', event_type: 'dashboard.invalid', definition: { nodes: [] }, unexpected: true,
    }).expect(400);
    expect(invalidWorkflow.body.error.code).toBe('INVALID_REQUEST');
  });

  it('records permanent delivery failures in the dead-letter queue', async () => {
    const suffix = randomBytes(5).toString('hex');
    const user = await prisma.user.create({ data: { tenantId, externalId: `push-user-${suffix}`, email: `push-${suffix}@example.test` } });
    const notification = await request(api.app).post('/v1/dashboard/notifications').set({ Authorization: `Bearer ${dashboardToken}`, Origin: dashboardOrigin }).send({
      user_id: user.externalId,
      notification: { title: 'Push without device', message: 'This must fail permanently.', priority: 'NORMAL', category: 'transactional' },
      channels: ['PUSH'],
    }).expect(202);
    const deliveryId = notification.body.data.delivery_ids[0] as string;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (delivery?.status === 'FAILED') {
        expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.body.data.id as string } })).status).toBe('FAILED');
        const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
        const deadLetter = new Queue('dead-letter', { connection });
        try {
          for (let deadLetterAttempt = 0; deadLetterAttempt < 30; deadLetterAttempt += 1) {
            const job = await deadLetter.getJob(`dead-push-delivery-${deliveryId}`);
            if (job) {
              expect(job.data).toMatchObject({ source_queue: 'push', payload: { deliveryId }, error: 'No active device token is registered for this user.' });
              await job.remove();
              return;
            }
            await delay(100);
          }
        } finally {
          await deadLetter.close();
          await connection.quit();
        }
        throw new Error('Expected the worker to enqueue a dead-letter job');
      }
      await delay(100);
    }
    throw new Error('Expected the push delivery to fail permanently');
  });

  it('retries committed outbox records without requiring another API request', async () => {
    const suffix = randomBytes(5).toString('hex');
    const user = await prisma.user.create({ data: { tenantId, externalId: `outbox-user-${suffix}`, email: `outbox-${suffix}@example.test` } });
    const notification = await prisma.notification.create({ data: {
      tenantId,
      userId: user.id,
      title: 'Outbox recovery',
      subject: 'Outbox recovery',
      body: 'A committed outbox row must be retried.',
      category: 'transactional',
      priority: Priority.NORMAL,
      status: NotificationStatus.QUEUED,
    } });
    const delivery = await prisma.delivery.create({ data: { tenantId, notificationId: notification.id, channel: Channel.EMAIL, provider: 'console', status: DeliveryStatus.QUEUED } });
    const outbox = await prisma.outboxJob.create({ data: {
      tenantId,
      queue: 'email',
      jobName: 'delivery.send',
      dedupeKey: `outbox-recovery-${delivery.id}`,
      payload: { deliveryId: delivery.id, priority: 5 },
    } });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const [outboxRecord, deliveryRecord] = await Promise.all([
        prisma.outboxJob.findUniqueOrThrow({ where: { id: outbox.id } }),
        prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } }),
      ]);
      if (outboxRecord.processedAt && deliveryRecord.status === DeliveryStatus.SENT) {
        expect(outboxRecord.attempts).toBeGreaterThanOrEqual(1);
        return;
      }
      await delay(100);
    }
    throw new Error('Expected the periodic outbox dispatcher to enqueue the committed delivery');
  });

  it('holds scheduled notifications until their requested delivery time', async () => {
    const scheduledAt = new Date(Date.now() + 1_200);
    const notification = await request(api.app).post('/v1/dashboard/notifications').set({ Authorization: `Bearer ${dashboardToken}`, Origin: dashboardOrigin }).send({
      user_id: 'demo-user',
      notification: { title: 'Scheduled notification', message: 'This must not be sent early.', priority: 'NORMAL', category: 'transactional' },
      channels: ['EMAIL'],
      scheduled_at: scheduledAt.toISOString(),
    }).expect(202);
    const deliveryId = notification.body.data.delivery_ids[0] as string;
    await delay(100);
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).status).toBe(DeliveryStatus.QUEUED);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      if (delivery.status === DeliveryStatus.SENT) return;
      await delay(100);
    }
    throw new Error('Expected the scheduled notification to be delivered after its requested time');
  });

  it('keeps notification-level analytics rates bounded for multi-channel deliveries', async () => {
    const suffix = randomBytes(5).toString('hex');
    const user = await prisma.user.create({ data: { tenantId, externalId: `analytics-user-${suffix}`, email: `analytics-${suffix}@example.test` } });
    const notification = await prisma.notification.create({ data: {
      tenantId,
      userId: user.id,
      title: 'Analytics delivery',
      subject: 'Analytics delivery',
      body: 'One notification can have several channel deliveries.',
      category: 'transactional',
      priority: Priority.NORMAL,
      status: NotificationStatus.SENT,
    } });
    await prisma.delivery.createMany({ data: [
      { tenantId, notificationId: notification.id, channel: Channel.EMAIL, provider: 'test', status: DeliveryStatus.DELIVERED },
      { tenantId, notificationId: notification.id, channel: Channel.PUSH, provider: 'test', status: DeliveryStatus.DELIVERED },
      { tenantId, notificationId: notification.id, channel: Channel.WEBHOOK, provider: 'test', status: DeliveryStatus.DELIVERED },
    ] });

    const analytics = await request(api.app).get('/v1/dashboard/overview').set({ Authorization: `Bearer ${dashboardToken}`, Origin: dashboardOrigin }).expect(200);
    expect(analytics.body.data.sent).toBeGreaterThanOrEqual(1);
    expect(analytics.body.data.delivered).toBe(0);
    expect(analytics.body.data.delivery_rate).toBeLessThanOrEqual(100);
  });

  it('fails a persisted unsafe webhook before making a network request', async () => {
    const secret = `unsafe-webhook-secret-${randomBytes(12).toString('hex')}`;
    const webhook = await prisma.webhook.create({ data: {
      tenantId,
      url: 'https://127.0.0.1/internal',
      events: ['notification.sent'],
      secret: new SecretCipherService().encrypt(secret),
    } });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    try {
      const notification = await request(api.app).post('/v1/dashboard/notifications').set({ Authorization: `Bearer ${dashboardToken}`, Origin: dashboardOrigin }).send({
        user_id: 'demo-user',
        notification: { title: 'Unsafe webhook', message: 'The worker must not call this endpoint.', priority: 'NORMAL', category: 'transactional' },
        channels: ['EMAIL'],
      }).expect(202);

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const delivery = await prisma.webhookDelivery.findFirst({ where: { webhookId: webhook.id, notificationId: notification.body.data.id as string } });
        if (delivery?.status === DeliveryStatus.FAILED) {
          expect(delivery.errorCode).toBe('PERMANENT_FAILURE');
          expect(fetchSpy).not.toHaveBeenCalled();
          return;
        }
        await delay(100);
      }
      throw new Error('Expected the unsafe webhook delivery to fail permanently');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('delivers signed notification webhooks and records the successful attempt', async () => {
    const secret = `webhook-secret-${randomBytes(12).toString('hex')}`;
    const received: Array<{ body: string; signature: string | undefined; event: string | undefined }> = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      received.push({
        body: String(init?.body ?? ''),
        signature: headers.get('x-notification-signature') ?? undefined,
        event: headers.get('x-notification-event') ?? undefined,
      });
      return new Response(null, { status: 204 });
    });

    try {
      const webhook = await prisma.webhook.create({ data: {
        tenantId,
        url: `https://hooks-${randomBytes(5).toString('hex')}.example.test/notification`,
        events: ['notification.sent'],
        secret: new SecretCipherService().encrypt(secret),
      } });

      const notification = await request(api.app).post('/v1/dashboard/notifications').set({ Authorization: `Bearer ${dashboardToken}`, Origin: dashboardOrigin }).send({
        user_id: 'demo-user',
        notification: { title: 'Webhook receipt', message: 'Signed webhooks must be delivered.', priority: 'NORMAL', category: 'transactional' },
        channels: ['EMAIL'],
      }).expect(202);

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const delivery = await prisma.webhookDelivery.findFirst({ where: { webhookId: webhook.id, notificationId: notification.body.data.id as string } });
        if (delivery?.status === 'SENT' && received.length) {
          expect(received[0].event).toBe('notification.sent');
          expect(received[0].signature).toBe(`sha256=${createHmac('sha256', secret).update(received[0].body).digest('hex')}`);
          expect(JSON.parse(received[0].body)).toMatchObject({ event: 'notification.sent', notification_id: notification.body.data.id, channel: 'email' });
          expect(delivery.attempts).toBe(1);
          expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
          return;
        }
        await delay(100);
      }
      throw new Error('Expected signed webhook delivery to complete');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
