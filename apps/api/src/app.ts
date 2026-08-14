import 'reflect-metadata';
import cors from 'cors';
import express, { type Express, type NextFunction, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import Joi from 'joi';
import { DashboardRole, NotificationStatus } from '@prisma/client';
import { AnalyticsService } from './analytics/analytics.service';
import { ApiKeysService } from './api-keys/api-keys.service';
import { CreateApiKeyDto } from './api-keys/dto';
import { AuthService } from './auth/auth.service';
import { LoginDto } from './auth/dto';
import { AuditService } from './common/audit.service';
import { ApiError } from './common/api-error';
import { errorHandler } from './common/error-handler';
import { PrismaService } from './common/prisma.service';
import { RateLimiterService } from './common/rate-limiter.service';
import { requestContext } from './common/request-context.middleware';
import type { PlatformRequest } from './common/request-context';
import { SecretCipherService } from './common/secret-cipher.service';
import { validateBody } from './common/validation';
import { CreateEventDto, UpdateEventDto } from './events/dto';
import { EventsService } from './events/events.service';
import { CreateNotificationDto } from './notifications/dto';
import { NotificationsService } from './notifications/notifications.service';
import { UpsertPreferenceDto } from './preferences/dto';
import { PreferencesService } from './preferences/preferences.service';
import { QueueService } from './queue/queue.service';
import { CreateTemplateDto, UpdateTemplateDto } from './templates/dto';
import { TemplatesService } from './templates/templates.service';
import { RegisterDeviceDto } from './users/dto';
import { UsersService } from './users/users.service';
import { CreateWebhookDto, UpdateWebhookDto } from './webhooks/dto';
import { WebhooksService } from './webhooks/webhooks.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './workflows/dto';
import { WorkflowsService } from './workflows/workflows.service';

type AsyncHandler = (request: PlatformRequest, response: Response, next: NextFunction) => Promise<void> | void;

function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => void Promise.resolve(handler(request as PlatformRequest, response, next)).catch(next);
}

function respond(request: PlatformRequest, response: Response, data: unknown, status = 200): void {
  response.status(status).json({ success: true, data, request_id: request.requestId });
}

function validateConfiguration(): void {
  const schema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
    DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres', 'prisma', 'prisma+postgres'] }).required(),
    REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRES_IN: Joi.string().default('15m'),
    API_KEY_PEPPER: Joi.string().min(24).required(),
    WEBHOOK_ENCRYPTION_KEY: Joi.string().required(),
    API_PORT: Joi.number().port().default(3000),
    OUTBOX_FLUSH_INTERVAL_MS: Joi.number().integer().min(100).max(60_000).default(5_000),
    DASHBOARD_URL: Joi.string().uri().default('http://localhost:3001'),
    CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
    EMAIL_PROVIDER: Joi.string().valid('console', 'smtp').default('console'),
    PUSH_PROVIDER: Joi.string().valid('console', 'fcm').default('console'),
  }).unknown(true);
  const { error } = schema.validate(process.env, { abortEarly: false });
  if (error) throw new Error(`Config validation error: ${error.message}`);
}

function requiredApiPermissions(apiKeys: ApiKeysService, rateLimiter: RateLimiterService, permissions: string[]): RequestHandler {
  return asyncHandler(async (request, response, next) => {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', 'Bearer API key is required.', 401);
    const apiClient = await apiKeys.authenticate(authorization.slice(7));
    request.apiClient = apiClient;
    try {
      await rateLimiter.consumeRequest(apiClient.tenantId, apiClient.keyId);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') response.setHeader('retry-after', String(error.details?.retry_after_seconds ?? 60));
      throw error;
    }
    if (!permissions.every((permission) => apiClient.permissions.includes(permission))) {
      throw new ApiError('FORBIDDEN', 'This API key does not have the required permission.', 403, { required: permissions });
    }
    next();
  });
}

function dashboardAuthentication(auth: AuthService, roles: DashboardRole[] = []): RequestHandler {
  return asyncHandler(async (request, _response, next) => {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', 'Dashboard bearer token is required.', 401);
    const user = await auth.verifyToken(authorization.slice(7));
    if (roles.length && !roles.includes(user.role)) throw new ApiError('FORBIDDEN', 'Your role does not have access to this resource.', 403);
    request.dashboardUser = user;
    next();
  });
}

function enumValue<T extends Record<string, string>>(value: unknown, values: T, field: string): T[keyof T] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !Object.values(values).includes(value)) throw new ApiError('INVALID_REQUEST', `${field} is invalid.`, 400);
  return value as T[keyof T];
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ApiError('INVALID_REQUEST', `${field} must be an ISO date.`, 400);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ApiError('INVALID_REQUEST', `${field} must be an ISO date.`, 400);
  return date;
}

function routeParam(request: PlatformRequest, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string') throw new ApiError('INVALID_REQUEST', `${name} is required.`, 400);
  return value;
}

export interface ExpressApi {
  app: Express;
  close(): Promise<void>;
}

export async function createExpressApi(): Promise<ExpressApi> {
  validateConfiguration();
  const prisma = new PrismaService();
  await prisma.connect();
  const queue = new QueueService(prisma);
  const rateLimiter = new RateLimiterService(prisma);
  await Promise.all([queue.start(), rateLimiter.start()]);

  const audit = new AuditService(prisma);
  const apiKeys = new ApiKeysService(prisma);
  const auth = new AuthService(prisma);
  const cipher = new SecretCipherService();
  const templates = new TemplatesService(prisma);
  const preferences = new PreferencesService(prisma);
  const notifications = new NotificationsService(prisma, preferences, queue, rateLimiter);
  const events = new EventsService(prisma, templates, preferences, queue, rateLimiter);
  const users = new UsersService(prisma);
  const webhooks = new WebhooksService(prisma, cipher);
  const workflows = new WorkflowsService(prisma);
  const analytics = new AnalyticsService(prisma);
  const app = express();
  const origins = (process.env.CORS_ORIGINS ?? process.env.DASHBOARD_URL ?? 'http://localhost:3001').split(',').map((value) => value.trim());

  app.disable('x-powered-by');
  app.use(requestContext as RequestHandler);
  app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }));
  app.use(cors({
    origin(origin, callback) { callback(null, !origin || origins.includes(origin)); },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/docs', (_request, response) => response.type('html').send('<!doctype html><title>NotifyKIT API</title><main><h1>NotifyKIT API</h1><p>Plain Express API. See the repository <code>docs/api.md</code> for endpoint documentation.</p></main>'));
  app.get('/health/live', (request, response) => respond(request as PlatformRequest, response, { status: 'ok' }));
  app.get('/health/ready', asyncHandler(async (request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await queue.health();
      respond(request, response, { status: 'ok', database: 'ok', redis: 'ok' });
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'A required dependency is unavailable.', 503);
    }
  }));
  app.get('/health', asyncHandler(async (request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await queue.health();
      respond(request, response, { status: 'ok', database: 'ok', redis: 'ok' });
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'A required dependency is unavailable.', 503);
    }
  }));

  app.post('/v1/auth/login', asyncHandler(async (request, response) => {
    const body = await validateBody(LoginDto, request.body);
    respond(request, response, await auth.login(body.email, body.password), 201);
  }));
  app.get('/v1/auth/me', dashboardAuthentication(auth), (request, response) => respond(request as PlatformRequest, response, (request as PlatformRequest).dashboardUser));

  const dashboard = dashboardAuthentication(auth);
  const keyManagers = dashboardAuthentication(auth, [DashboardRole.OWNER, DashboardRole.ADMIN, DashboardRole.DEVELOPER]);
  app.get('/v1/api-keys', dashboard, asyncHandler(async (request, response) => respond(request, response, await apiKeys.list(request.dashboardUser!.tenantId))));
  app.post('/v1/api-keys', keyManagers, asyncHandler(async (request, response) => {
    const body = await validateBody(CreateApiKeyDto, request.body);
    const key = await apiKeys.create(request.dashboardUser!.tenantId, { name: body.name, permissions: body.permissions, expiresAt: body.expires_at, environment: body.environment });
    await audit.log({ tenantId: request.dashboardUser!.tenantId, actorUserId: request.dashboardUser!.id, action: 'api_key.created', resource: 'api_key', resourceId: key.id, ipAddress: request.ip });
    respond(request, response, key, 201);
  }));
  app.delete('/v1/api-keys/:id', keyManagers, asyncHandler(async (request, response) => {
    const id = routeParam(request, 'id');
    await apiKeys.revoke(request.dashboardUser!.tenantId, id);
    await audit.log({ tenantId: request.dashboardUser!.tenantId, actorUserId: request.dashboardUser!.id, action: 'api_key.revoked', resource: 'api_key', resourceId: id, ipAddress: request.ip });
    response.status(204).end();
  }));

  app.post('/v1/events', requiredApiPermissions(apiKeys, rateLimiter, ['events:write']), asyncHandler(async (request, response) => {
    const body = await validateBody(CreateEventDto, request.body);
    const result = await events.accept(request.apiClient!.tenantId, body, request.header('idempotency-key'));
    response.status(202).json({ success: true, ...result, request_id: request.requestId });
  }));
  app.post('/v1/notifications', requiredApiPermissions(apiKeys, rateLimiter, ['notifications:write']), asyncHandler(async (request, response) => {
    const body = await validateBody(CreateNotificationDto, request.body);
    respond(request, response, await notifications.create(request.apiClient!.tenantId, body), 202);
  }));
  app.get('/v1/notifications', requiredApiPermissions(apiKeys, rateLimiter, ['notifications:read']), asyncHandler(async (request, response) => {
    const status = enumValue(request.query.status, NotificationStatus, 'status');
    const limit = request.query.limit === undefined ? undefined : Number(request.query.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new ApiError('INVALID_REQUEST', 'limit must be a positive integer.', 400);
    const cursor = typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
    respond(request, response, await notifications.list(request.apiClient!.tenantId, { status, limit, cursor }));
  }));
  app.get('/v1/notifications/:id', requiredApiPermissions(apiKeys, rateLimiter, ['notifications:read']), asyncHandler(async (request, response) => respond(request, response, await notifications.get(request.apiClient!.tenantId, routeParam(request, 'id')))));
  app.post('/v1/notifications/:id/cancel', requiredApiPermissions(apiKeys, rateLimiter, ['notifications:write']), asyncHandler(async (request, response) => {
    await notifications.cancel(request.apiClient!.tenantId, routeParam(request, 'id'));
    response.status(204).end();
  }));

  app.get('/v1/templates', requiredApiPermissions(apiKeys, rateLimiter, ['templates:read']), asyncHandler(async (request, response) => respond(request, response, await templates.list(request.apiClient!.tenantId))));
  app.post('/v1/templates', requiredApiPermissions(apiKeys, rateLimiter, ['templates:write']), asyncHandler(async (request, response) => {
    const body = await validateBody(CreateTemplateDto, request.body);
    respond(request, response, await templates.create(request.apiClient!.tenantId, { name: body.name, eventType: body.event_type, channel: body.channel, subject: body.subject, body: body.body, language: body.language, version: body.version, status: body.status }), 201);
  }));
  app.patch('/v1/templates/:id', requiredApiPermissions(apiKeys, rateLimiter, ['templates:write']), asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateTemplateDto, request.body);
    respond(request, response, await templates.update(request.apiClient!.tenantId, routeParam(request, 'id'), body));
  }));

  app.get('/v1/users/:externalUserId/preferences', requiredApiPermissions(apiKeys, rateLimiter, ['users:manage']), asyncHandler(async (request, response) => respond(request, response, await preferences.list(request.apiClient!.tenantId, routeParam(request, 'externalUserId')))));
  app.put('/v1/users/:externalUserId/preferences', requiredApiPermissions(apiKeys, rateLimiter, ['users:manage']), asyncHandler(async (request, response) => {
    const body = await validateBody(UpsertPreferenceDto, request.body);
    respond(request, response, await preferences.upsert(request.apiClient!.tenantId, routeParam(request, 'externalUserId'), body));
  }));
  app.get('/v1/users', requiredApiPermissions(apiKeys, rateLimiter, ['users:manage']), asyncHandler(async (request, response) => respond(request, response, await users.list(request.apiClient!.tenantId))));
  app.post('/v1/users/:externalUserId/devices', requiredApiPermissions(apiKeys, rateLimiter, ['devices:manage']), asyncHandler(async (request, response) => {
    const body = await validateBody(RegisterDeviceDto, request.body);
    respond(request, response, await users.registerDevice(request.apiClient!.tenantId, routeParam(request, 'externalUserId'), { deviceToken: body.device_token, platform: body.platform, appVersion: body.app_version }), 201);
  }));

  app.get('/v1/webhooks', requiredApiPermissions(apiKeys, rateLimiter, ['webhooks:manage']), asyncHandler(async (request, response) => respond(request, response, await webhooks.list(request.apiClient!.tenantId))));
  app.post('/v1/webhooks', requiredApiPermissions(apiKeys, rateLimiter, ['webhooks:manage']), asyncHandler(async (request, response) => {
    const body = await validateBody(CreateWebhookDto, request.body);
    respond(request, response, await webhooks.create(request.apiClient!.tenantId, body), 201);
  }));
  app.patch('/v1/webhooks/:id', requiredApiPermissions(apiKeys, rateLimiter, ['webhooks:manage']), asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateWebhookDto, request.body);
    respond(request, response, await webhooks.update(request.apiClient!.tenantId, routeParam(request, 'id'), body));
  }));

  app.get('/v1/workflows', requiredApiPermissions(apiKeys, rateLimiter, ['workflows:manage']), asyncHandler(async (request, response) => respond(request, response, await workflows.list(request.apiClient!.tenantId))));
  app.post('/v1/workflows', requiredApiPermissions(apiKeys, rateLimiter, ['workflows:manage']), asyncHandler(async (request, response) => {
    const body = await validateBody(CreateWorkflowDto, request.body);
    respond(request, response, await workflows.create(request.apiClient!.tenantId, { name: body.name, eventType: body.event_type, definition: body.definition, status: body.status }), 201);
  }));
  app.patch('/v1/workflows/:id', requiredApiPermissions(apiKeys, rateLimiter, ['workflows:manage']), asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateWorkflowDto, request.body);
    respond(request, response, await workflows.update(request.apiClient!.tenantId, routeParam(request, 'id'), body));
  }));
  app.get('/v1/analytics', requiredApiPermissions(apiKeys, rateLimiter, ['analytics:read']), asyncHandler(async (request, response) => {
    respond(request, response, await analytics.overview(request.apiClient!.tenantId, optionalDate(request.query.from, 'from'), optionalDate(request.query.to, 'to')));
  }));

  app.get('/v1/dashboard/overview', dashboard, asyncHandler(async (request, response) => respond(request, response, await analytics.overview(request.dashboardUser!.tenantId))));
  app.get('/v1/dashboard/notifications', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.notification.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { user: { select: { externalId: true, email: true } }, deliveries: true }, orderBy: { createdAt: 'desc' }, take: 100 }))));
  app.get('/v1/dashboard/events', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.event.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }))));
  app.get('/v1/dashboard/templates', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.template.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, orderBy: { updatedAt: 'desc' } }))));
  app.get('/v1/dashboard/workflows', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.workflow.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, orderBy: { updatedAt: 'desc' } }))));
  app.get('/v1/dashboard/users', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.user.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { _count: { select: { devices: true, notifications: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }))));
  app.get('/v1/dashboard/devices', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.device.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { user: { select: { externalId: true } } }, orderBy: { lastActiveAt: 'desc' }, take: 100 }))));
  app.get('/v1/dashboard/webhooks', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.webhook.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, select: { id: true, url: true, events: true, status: true, createdAt: true, updatedAt: true, _count: { select: { deliveries: true } } }, orderBy: { createdAt: 'desc' } }))));
  app.get('/v1/dashboard/api-keys', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.apiKey.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, select: { id: true, name: true, prefix: true, permissions: true, status: true, expiresAt: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } }))));
  app.get('/v1/dashboard/audit-logs', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.auditLog.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { actor: { select: { email: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }))));
  app.get('/v1/dashboard/channels', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.delivery.groupBy({ by: ['channel', 'status'], where: { tenantId: request.dashboardUser!.tenantId }, _count: { _all: true } }))));
  app.get('/v1/dashboard/providers', dashboard, (request, response) => respond(request as PlatformRequest, response, { email: { mode: process.env.EMAIL_PROVIDER ?? 'console', smtp_configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM) }, push: { mode: process.env.PUSH_PROVIDER ?? 'console', fcm_configured: Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) }, webhook: { signing: 'HMAC SHA-256', encrypted_secrets: true } }));
  app.get('/v1/dashboard/settings', dashboard, asyncHandler(async (request, response) => respond(request, response, await prisma.tenant.findFirst({ where: { id: request.dashboardUser!.tenantId }, select: { id: true, name: true, slug: true, plan: true, status: true, tenantPolicy: true } }))));
  app.post('/v1/dashboard/notifications', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(CreateNotificationDto, request.body);
    respond(request, response, await notifications.create(request.dashboardUser!.tenantId, body), 202);
  }));
  app.post('/v1/dashboard/events', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(CreateEventDto, request.body);
    respond(request, response, await events.accept(request.dashboardUser!.tenantId, body), 202);
  }));
  app.patch('/v1/dashboard/events/:id', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateEventDto, request.body);
    if (body.event === undefined && body.external_event_id === undefined && body.data === undefined) {
      throw new ApiError('INVALID_REQUEST', 'Provide at least one event field to update.', 400);
    }
    const event = await events.update(request.dashboardUser!.tenantId, routeParam(request, 'id'), body);
    await audit.log({
      tenantId: request.dashboardUser!.tenantId,
      actorUserId: request.dashboardUser!.id,
      action: 'event.updated',
      resource: 'event',
      resourceId: event.id,
      metadata: { changed_fields: Object.entries(body).filter(([, value]) => value !== undefined).map(([field]) => field) },
      ipAddress: request.ip,
    });
    respond(request, response, event);
  }));
  app.post('/v1/dashboard/notifications/:id/cancel', dashboard, asyncHandler(async (request, response) => {
    await notifications.cancel(request.dashboardUser!.tenantId, routeParam(request, 'id'));
    response.status(204).end();
  }));
  app.post('/v1/dashboard/templates', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(CreateTemplateDto, request.body);
    respond(request, response, await templates.create(request.dashboardUser!.tenantId, { name: body.name, eventType: body.event_type, channel: body.channel, subject: body.subject, body: body.body, language: body.language, version: body.version, status: body.status }), 201);
  }));
  app.patch('/v1/dashboard/templates/:id', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateTemplateDto, request.body);
    respond(request, response, await templates.update(request.dashboardUser!.tenantId, routeParam(request, 'id'), body));
  }));
  app.post('/v1/dashboard/workflows', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(CreateWorkflowDto, request.body);
    respond(request, response, await workflows.create(request.dashboardUser!.tenantId, { name: body.name, eventType: body.event_type, definition: body.definition, status: body.status }), 201);
  }));
  app.patch('/v1/dashboard/workflows/:id', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateWorkflowDto, request.body);
    respond(request, response, await workflows.update(request.dashboardUser!.tenantId, routeParam(request, 'id'), body));
  }));
  app.post('/v1/dashboard/webhooks', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(CreateWebhookDto, request.body);
    respond(request, response, await webhooks.create(request.dashboardUser!.tenantId, body), 201);
  }));
  app.patch('/v1/dashboard/webhooks/:id', dashboard, asyncHandler(async (request, response) => {
    const body = await validateBody(UpdateWebhookDto, request.body);
    respond(request, response, await webhooks.update(request.dashboardUser!.tenantId, routeParam(request, 'id'), body));
  }));

  app.use((_request, _response, next) => next(new ApiError('NOT_FOUND', 'Route not found.', 404)));
  app.use(errorHandler);

  return {
    app,
    async close(): Promise<void> {
      await Promise.allSettled([queue.stop(), rateLimiter.stop()]);
      await prisma.disconnect();
    },
  };
}
