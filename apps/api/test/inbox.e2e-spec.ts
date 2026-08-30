import { Channel, DashboardRole, DeliveryStatus, NotificationStatus, PrismaClient, Priority, TemplateStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createExpressApi, type ExpressApi } from '../src/app';
import { WorkerRuntime } from '../../workers/src/worker-runtime';

let prisma: PrismaClient;
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('In-app inbox (e2e)', () => {
  let api: ExpressApi;
  let workers: WorkerRuntime;
  let tenantId: string;
  let otherTenantId: string;
  let dashboardToken: string;
  const dashboardPassword = 'E2eDashboardPassword123!';
  const dashboardOrigin = 'http://localhost:3102';
  const apiKey = `nk_test_${randomBytes(24).toString('base64url')}`;
  const limitedApiKey = `nk_test_${randomBytes(24).toString('base64url')}`;
  const otherTenantApiKey = `nk_test_${randomBytes(24).toString('base64url')}`;

  const hashKey = (rawKey: string) => createHash('sha256').update(`${process.env.API_KEY_PEPPER}:${rawKey}`).digest('hex');

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://notification:notification@localhost:5432/notification_platform?schema=public';
    // Keep this suite's queues separate from events.e2e-spec.ts (db 15) and any local
    // development worker (db 0).
    process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/14';
    process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-longer-than-thirty-two-characters';
    process.env.API_KEY_PEPPER ??= 'test-api-key-pepper-that-is-longer-than-twenty-four-characters';
    process.env.WEBHOOK_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
    process.env.EMAIL_PROVIDER = 'console';
    process.env.OUTBOX_FLUSH_INTERVAL_MS = '100';
    process.env.DASHBOARD_URL = dashboardOrigin;
    process.env.CORS_ORIGINS = dashboardOrigin;
    prisma = new PrismaClient();

    const tenant = await prisma.tenant.create({ data: { name: 'Inbox E2E tenant', slug: `inbox-e2e-${randomBytes(6).toString('hex')}`, tenantPolicy: { create: {} } } });
    tenantId = tenant.id;
    await prisma.dashboardUser.create({ data: { tenantId, email: `owner-${randomBytes(6).toString('hex')}@example.test`, name: 'Inbox E2E Owner', role: DashboardRole.OWNER, passwordHash: await bcrypt.hash(dashboardPassword, 12) } });
    await prisma.apiKey.create({ data: { tenantId, name: 'Inbox E2E key', prefix: apiKey.slice(0, 12), keyHash: hashKey(apiKey), permissions: ['users:manage', 'notifications:write'] } });
    // Deliberately missing users:manage, to exercise the 403 path on token minting.
    await prisma.apiKey.create({ data: { tenantId, name: 'Inbox E2E limited key', prefix: limitedApiKey.slice(0, 12), keyHash: hashKey(limitedApiKey), permissions: ['events:write'] } });
    await prisma.template.create({ data: { tenantId, name: 'Inbox order email', eventType: 'inbox.order.created', channel: Channel.EMAIL, subject: 'Order', body: 'Order body', status: TemplateStatus.ACTIVE } });

    const otherTenant = await prisma.tenant.create({ data: { name: 'Inbox E2E other tenant', slug: `inbox-e2e-other-${randomBytes(6).toString('hex')}`, tenantPolicy: { create: {} } } });
    otherTenantId = otherTenant.id;
    await prisma.apiKey.create({ data: { tenantId: otherTenantId, name: 'Inbox E2E other key', prefix: otherTenantApiKey.slice(0, 12), keyHash: hashKey(otherTenantApiKey), permissions: ['users:manage', 'notifications:write'] } });

    workers = new WorkerRuntime(); await workers.start();
    api = await createExpressApi();
  });

  afterAll(async () => {
    await api?.close(); await workers?.stop();
    if (tenantId) await prisma?.tenant.delete({ where: { id: tenantId } });
    if (otherTenantId) await prisma?.tenant.delete({ where: { id: otherTenantId } });
    await prisma?.$disconnect();
  });

  // Helpers -------------------------------------------------------------------

  async function createUser(tenant: string, prefix: string) {
    const suffix = randomBytes(5).toString('hex');
    return prisma.user.create({ data: { tenantId: tenant, externalId: `${prefix}-${suffix}`, email: `${prefix}-${suffix}@example.test` } });
  }

  async function mintToken(key: string, externalUserId: string): Promise<string> {
    const response = await request(api.app).post(`/v1/users/${externalUserId}/token`).set('Authorization', `Bearer ${key}`).expect(201);
    return response.body.data.token as string;
  }

  // Creates a notification with an already-SENT IN_APP delivery directly through Prisma,
  // bypassing the queue so tests that only exercise InboxService's HTTP surface stay fast
  // and deterministic. The real queue -> worker path is covered separately below.
  async function createInAppNotification(tenant: string, userId: string, overrides: { createdAt?: Date; title?: string } = {}) {
    const notification = await prisma.notification.create({ data: {
      tenantId: tenant,
      userId,
      title: overrides.title ?? 'Inbox item',
      subject: overrides.title ?? 'Inbox item',
      body: 'Inbox item body',
      category: 'transactional',
      priority: Priority.NORMAL,
      status: NotificationStatus.SENT,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    } });
    await prisma.delivery.create({ data: { tenantId: tenant, notificationId: notification.id, channel: Channel.IN_APP, provider: 'in_app', status: DeliveryStatus.SENT, sentAt: new Date() } });
    return notification;
  }

  // Token minting ---------------------------------------------------------------

  it('mints an end-user inbox token for a known user via an API key with users:manage', async () => {
    const user = await createUser(tenantId, 'mint-user');
    const response = await request(api.app).post(`/v1/users/${user.externalId}/token`).set('Authorization', `Bearer ${apiKey}`).expect(201);
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(new Date(response.body.data.expires_at).getTime()).toBeGreaterThan(Date.now());

    const claims = jwt.verify(response.body.data.token, process.env.JWT_SECRET!) as Record<string, unknown>;
    expect(claims).toMatchObject({ typ: 'end_user', tenant_id: tenantId, external_user_id: user.externalId });
  });

  it('returns 404 minting a token for an unknown external user', async () => {
    const response = await request(api.app).post('/v1/users/no-such-user/token').set('Authorization', `Bearer ${apiKey}`).expect(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects token minting without a bearer key and without the users:manage permission', async () => {
    const user = await createUser(tenantId, 'mint-unauth');
    const unauthenticated = await request(api.app).post(`/v1/users/${user.externalId}/token`).expect(401);
    expect(unauthenticated.body.error.code).toBe('UNAUTHORIZED');
    const forbidden = await request(api.app).post(`/v1/users/${user.externalId}/token`).set('Authorization', `Bearer ${limitedApiKey}`).expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  // Auth isolation ----------------------------------------------------------------

  it('rejects a dashboard JWT at /v1/inbox even though it is signed with the same JWT_SECRET', async () => {
    const dashboardUser = await prisma.dashboardUser.findFirstOrThrow({ where: { tenantId } });
    const login = await request(api.app).post('/v1/auth/login').set('Origin', dashboardOrigin).send({ email: dashboardUser.email, password: dashboardPassword }).expect(201);
    dashboardToken = login.body.data.access_token as string;
    const response = await request(api.app).get('/v1/inbox').set('Authorization', `Bearer ${dashboardToken}`).expect(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it("prevents a token minted for user A from reading or acting on user B's inbox items", async () => {
    const userA = await createUser(tenantId, 'isolation-a');
    const userB = await createUser(tenantId, 'isolation-b');
    const tokenA = await mintToken(apiKey, userA.externalId);
    const bNotification = await createInAppNotification(tenantId, userB.id, { title: 'Belongs to B' });

    const listAsA = await request(api.app).get('/v1/inbox').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(listAsA.body.data.items.map((item: { id: string }) => item.id)).not.toContain(bNotification.id);

    const actionAsA = await request(api.app).post(`/v1/inbox/${bNotification.id}/read`).set('Authorization', `Bearer ${tokenA}`).expect(404);
    expect(actionAsA.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a forged token whose tenant_id claim does not match the signing user\'s real tenant', async () => {
    const user = await createUser(tenantId, 'forged');
    const forged = jwt.sign({ sub: user.id, tenant_id: otherTenantId, external_user_id: user.externalId, typ: 'end_user' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const response = await request(api.app).get('/v1/inbox').set('Authorization', `Bearer ${forged}`).expect(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('never leaks another tenant\'s notifications to a genuinely minted cross-tenant token', async () => {
    const sharedExternalId = `shared-${randomBytes(5).toString('hex')}`;
    await prisma.user.create({ data: { tenantId, externalId: sharedExternalId, email: `${sharedExternalId}-a@example.test` } });
    const otherTenantUser = await prisma.user.create({ data: { tenantId: otherTenantId, externalId: sharedExternalId, email: `${sharedExternalId}-b@example.test` } });
    await createInAppNotification(tenantId, (await prisma.user.findFirstOrThrow({ where: { tenantId, externalId: sharedExternalId } })).id, { title: 'Tenant A only' });

    const otherTenantToken = await mintToken(otherTenantApiKey, otherTenantUser.externalId);
    const response = await request(api.app).get('/v1/inbox').set('Authorization', `Bearer ${otherTenantToken}`).expect(200);
    expect(response.body.data.items).toHaveLength(0);
  });

  // Full delivery path --------------------------------------------------------------

  it('delivers a real IN_APP notification through the worker and exposes it via GET /v1/inbox', async () => {
    const user = await createUser(tenantId, 'delivery');
    const token = await mintToken(apiKey, user.externalId);
    const created = await request(api.app).post('/v1/notifications').set('Authorization', `Bearer ${apiKey}`).send({
      user_id: user.externalId,
      notification: { title: 'Real delivery', message: 'Delivered through the queue and worker.', priority: 'NORMAL', category: 'transactional' },
      channels: ['IN_APP'],
    }).expect(202);
    const deliveryId = created.body.data.delivery_ids[0] as string;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (delivery?.status === DeliveryStatus.SENT) {
        expect(delivery.provider).toBe('in_app');
        expect(delivery.channel).toBe(Channel.IN_APP);
        const inbox = await request(api.app).get('/v1/inbox').set('Authorization', `Bearer ${token}`).expect(200);
        expect(inbox.body.data.items).toContainEqual(expect.objectContaining({ id: created.body.data.id, title: 'Real delivery' }));
        return;
      }
      await delay(100);
    }
    throw new Error('Expected the worker to process the IN_APP delivery');
  });

  // State transitions ---------------------------------------------------------------

  it('transitions read/unread/seen/archive over HTTP, idempotently', async () => {
    const user = await createUser(tenantId, 'transitions');
    const token = await mintToken(apiKey, user.externalId);
    const notification = await createInAppNotification(tenantId, user.id);
    const authorization = `Bearer ${token}`;

    const read = await request(api.app).post(`/v1/inbox/${notification.id}/read`).set('Authorization', authorization).expect(200);
    expect(read.body.data.read_at).not.toBeNull();
    expect(read.body.data.seen_at).not.toBeNull();
    const firstSeenAt = read.body.data.seen_at as string;

    // Repeating `read` is idempotent on the *fields it guarantees* (both stay set), but
    // read_at itself is not frozen to the first call's timestamp — only seen_at is, via
    // `current.seenAt ?? now`. Assert that earliest-seen-at guarantee explicitly.
    await delay(5);
    const readAgain = await request(api.app).post(`/v1/inbox/${notification.id}/read`).set('Authorization', authorization).expect(200);
    expect(readAgain.body.data.read_at).not.toBeNull();
    expect(readAgain.body.data.seen_at).toBe(firstSeenAt);

    const unread = await request(api.app).post(`/v1/inbox/${notification.id}/unread`).set('Authorization', authorization).expect(200);
    expect(unread.body.data.read_at).toBeNull();
    expect(unread.body.data.seen_at).toBe(firstSeenAt);

    const unreadAgain = await request(api.app).post(`/v1/inbox/${notification.id}/unread`).set('Authorization', authorization).expect(200);
    expect(unreadAgain.body.data.read_at).toBeNull();

    const secondNotification = await createInAppNotification(tenantId, user.id, { title: 'Seen only' });
    const seen = await request(api.app).post(`/v1/inbox/${secondNotification.id}/seen`).set('Authorization', authorization).expect(200);
    expect(seen.body.data.seen_at).not.toBeNull();
    expect(seen.body.data.read_at).toBeNull();
    const seenAgain = await request(api.app).post(`/v1/inbox/${secondNotification.id}/seen`).set('Authorization', authorization).expect(200);
    expect(seenAgain.body.data.seen_at).toBe(seen.body.data.seen_at);

    const archive = await request(api.app).post(`/v1/inbox/${notification.id}/archive`).set('Authorization', authorization).expect(200);
    expect(archive.body.data.archived_at).not.toBeNull();
    const archiveAgain = await request(api.app).post(`/v1/inbox/${notification.id}/archive`).set('Authorization', authorization).expect(200);
    expect(archiveAgain.body.data.archived_at).not.toBeNull();

    const defaultList = await request(api.app).get('/v1/inbox').set('Authorization', authorization).expect(200);
    expect(defaultList.body.data.items.map((item: { id: string }) => item.id)).not.toContain(notification.id);
  });

  // Counts and read-all ---------------------------------------------------------------

  it('computes unread/total counts and zeroes unread via read-all', async () => {
    const user = await createUser(tenantId, 'counts');
    const token = await mintToken(apiKey, user.externalId);
    const authorization = `Bearer ${token}`;
    const first = await createInAppNotification(tenantId, user.id, { title: 'Count one' });
    const second = await createInAppNotification(tenantId, user.id, { title: 'Count two' });
    const third = await createInAppNotification(tenantId, user.id, { title: 'Count three' });

    const initial = await request(api.app).get('/v1/inbox/count').set('Authorization', authorization).expect(200);
    expect(initial.body.data).toEqual({ unread: 3, total: 3 });

    await request(api.app).post(`/v1/inbox/${first.id}/read`).set('Authorization', authorization).expect(200);
    const afterRead = await request(api.app).get('/v1/inbox/count').set('Authorization', authorization).expect(200);
    expect(afterRead.body.data).toEqual({ unread: 2, total: 3 });

    await request(api.app).post(`/v1/inbox/${second.id}/archive`).set('Authorization', authorization).expect(200);
    const afterArchive = await request(api.app).get('/v1/inbox/count').set('Authorization', authorization).expect(200);
    expect(afterArchive.body.data).toEqual({ unread: 1, total: 2 });

    const readAll = await request(api.app).post('/v1/inbox/read-all').set('Authorization', authorization).expect(200);
    // `third` is the only remaining unread, non-archived item; `first` was already read.
    expect(readAll.body.data).toEqual({ updated: 1 });
    const finalCount = await request(api.app).get('/v1/inbox/count').set('Authorization', authorization).expect(200);
    expect(finalCount.body.data).toEqual({ unread: 0, total: 2 });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: third.id } })).readAt).not.toBeNull();
  });

  // Filtering and pagination ------------------------------------------------------------

  it('filters by status and archived', async () => {
    const user = await createUser(tenantId, 'filters');
    const token = await mintToken(apiKey, user.externalId);
    const authorization = `Bearer ${token}`;
    const unreadItem = await createInAppNotification(tenantId, user.id, { title: 'Unread' });
    const readItem = await createInAppNotification(tenantId, user.id, { title: 'Read' });
    const archivedItem = await createInAppNotification(tenantId, user.id, { title: 'Archived' });
    await request(api.app).post(`/v1/inbox/${readItem.id}/read`).set('Authorization', authorization).expect(200);
    await request(api.app).post(`/v1/inbox/${archivedItem.id}/archive`).set('Authorization', authorization).expect(200);

    const unreadFilter = await request(api.app).get('/v1/inbox?status=unread').set('Authorization', authorization).expect(200);
    expect(unreadFilter.body.data.items.map((item: { id: string }) => item.id).sort()).toEqual([unreadItem.id].sort());

    const readFilter = await request(api.app).get('/v1/inbox?status=read').set('Authorization', authorization).expect(200);
    expect(readFilter.body.data.items.map((item: { id: string }) => item.id)).toEqual([readItem.id]);

    const archivedFilter = await request(api.app).get('/v1/inbox?archived=true').set('Authorization', authorization).expect(200);
    expect(archivedFilter.body.data.items.map((item: { id: string }) => item.id)).toEqual([archivedItem.id]);

    const defaultList = await request(api.app).get('/v1/inbox').set('Authorization', authorization).expect(200);
    expect(defaultList.body.data.items.map((item: { id: string }) => item.id).sort()).toEqual([unreadItem.id, readItem.id].sort());
  });

  it('paginates cursors over items sharing the same createdAt without gaps or duplicates', async () => {
    const user = await createUser(tenantId, 'pagination');
    const token = await mintToken(apiKey, user.externalId);
    const authorization = `Bearer ${token}`;
    const sharedTimestamp = new Date('2026-01-01T00:00:00.000Z');
    const total = 13;
    const created = [];
    for (let index = 0; index < total; index += 1) {
      created.push(await createInAppNotification(tenantId, user.id, { title: `Paged ${index}`, createdAt: sharedTimestamp }));
    }
    const expectedIds = new Set(created.map((notification) => notification.id));

    const seen: string[] = [];
    let cursor: string | undefined;
    const limit = 4;
    for (let page = 0; page < total; page += 1) {
      const query = cursor ? `?limit=${limit}&cursor=${cursor}` : `?limit=${limit}`;
      const response = await request(api.app).get(`/v1/inbox${query}`).set('Authorization', authorization).expect(200);
      const ids = response.body.data.items.map((item: { id: string }) => item.id) as string[];
      seen.push(...ids);
      cursor = response.body.data.next_cursor ?? undefined;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(total);
    expect(new Set(seen)).toEqual(expectedIds);
    // No duplicates: every id was returned by exactly one page.
    expect(new Set(seen).size).toBe(seen.length);
  });

  // 404s -------------------------------------------------------------------------------

  it('returns 404 for inbox actions on a notification with no IN_APP delivery', async () => {
    const user = await createUser(tenantId, 'email-only');
    const token = await mintToken(apiKey, user.externalId);
    const emailOnly = await prisma.notification.create({ data: {
      tenantId, userId: user.id, title: 'Email only', subject: 'Email only', body: 'No in-app delivery here.',
      category: 'transactional', priority: Priority.NORMAL, status: NotificationStatus.SENT,
    } });
    await prisma.delivery.create({ data: { tenantId, notificationId: emailOnly.id, channel: Channel.EMAIL, provider: 'console', status: DeliveryStatus.SENT } });

    const response = await request(api.app).post(`/v1/inbox/${emailOnly.id}/read`).set('Authorization', `Bearer ${token}`).expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
