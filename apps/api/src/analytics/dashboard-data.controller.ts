import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardJwtGuard } from '../auth/dashboard-jwt.guard';
import { PrismaService } from '../common/prisma.service';
import type { PlatformRequest } from '../common/request-context';
import { CreateNotificationDto } from '../notifications/dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEventDto } from '../events/dto';
import { EventsService } from '../events/events.service';
import { CreateTemplateDto } from '../templates/dto';
import { TemplatesService } from '../templates/templates.service';
import { CreateWebhookDto } from '../webhooks/dto';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateWorkflowDto } from '../workflows/dto';
import { WorkflowsService } from '../workflows/workflows.service';

@ApiTags('Dashboard') @ApiBearerAuth() @UseGuards(DashboardJwtGuard) @Controller('v1/dashboard')
export class DashboardDataController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly templatesService: TemplatesService,
    private readonly webhooksService: WebhooksService,
    private readonly workflowsService: WorkflowsService,
    private readonly eventsService: EventsService,
  ) {}
  @Get('notifications') notifications(@Req() request: PlatformRequest) { return this.prisma.notification.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { user: { select: { externalId: true, email: true } }, deliveries: true }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  @Get('events') events(@Req() request: PlatformRequest) { return this.prisma.event.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  @Get('templates') templates(@Req() request: PlatformRequest) { return this.prisma.template.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, orderBy: { updatedAt: 'desc' } }); }
  @Get('workflows') workflows(@Req() request: PlatformRequest) { return this.prisma.workflow.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, orderBy: { updatedAt: 'desc' } }); }
  @Get('users') users(@Req() request: PlatformRequest) { return this.prisma.user.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { _count: { select: { devices: true, notifications: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }); }
  @Get('devices') devices(@Req() request: PlatformRequest) { return this.prisma.device.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { user: { select: { externalId: true } } }, orderBy: { lastActiveAt: 'desc' }, take: 100 }); }
  @Get('webhooks') webhooks(@Req() request: PlatformRequest) { return this.prisma.webhook.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, select: { id: true, url: true, events: true, status: true, createdAt: true, updatedAt: true, _count: { select: { deliveries: true } } }, orderBy: { createdAt: 'desc' } }); }
  @Get('api-keys') apiKeys(@Req() request: PlatformRequest) { return this.prisma.apiKey.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, select: { id: true, name: true, prefix: true, permissions: true, status: true, expiresAt: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } }); }
  @Get('audit-logs') auditLogs(@Req() request: PlatformRequest) { return this.prisma.auditLog.findMany({ where: { tenantId: request.dashboardUser!.tenantId }, include: { actor: { select: { email: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  @Get('channels') async channels(@Req() request: PlatformRequest) { return this.prisma.delivery.groupBy({ by: ['channel', 'status'], where: { tenantId: request.dashboardUser!.tenantId }, _count: { _all: true } }); }
  @Get('providers') providers() { return { email: { mode: process.env.EMAIL_PROVIDER ?? 'console', smtp_configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM) }, push: { mode: process.env.PUSH_PROVIDER ?? 'console', fcm_configured: Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) }, webhook: { signing: 'HMAC SHA-256', encrypted_secrets: true } }; }
  @Get('settings') settings(@Req() request: PlatformRequest) { return this.prisma.tenant.findFirst({ where: { id: request.dashboardUser!.tenantId }, select: { id: true, name: true, slug: true, plan: true, status: true, tenantPolicy: true } }); }
  @Post('notifications') @HttpCode(202) createNotification(@Req() request: PlatformRequest, @Body() body: CreateNotificationDto) { return this.notificationsService.create(request.dashboardUser!.tenantId, body); }
  @Post('events') @HttpCode(202) createEvent(@Req() request: PlatformRequest, @Body() body: CreateEventDto) { return this.eventsService.accept(request.dashboardUser!.tenantId, body); }
  @Post('notifications/:id/cancel') @HttpCode(204) cancelNotification(@Req() request: PlatformRequest, @Param('id') id: string) { return this.notificationsService.cancel(request.dashboardUser!.tenantId, id); }
  @Post('templates') createTemplate(@Req() request: PlatformRequest, @Body() body: CreateTemplateDto) { return this.templatesService.create(request.dashboardUser!.tenantId, { name: body.name, eventType: body.event_type, channel: body.channel, subject: body.subject, body: body.body, language: body.language, version: body.version, status: body.status }); }
  @Post('workflows') createWorkflow(@Req() request: PlatformRequest, @Body() body: CreateWorkflowDto) { return this.workflowsService.create(request.dashboardUser!.tenantId, { name: body.name, eventType: body.event_type, definition: body.definition, status: body.status }); }
  @Post('webhooks') createWebhook(@Req() request: PlatformRequest, @Body() body: CreateWebhookDto) { return this.webhooksService.create(request.dashboardUser!.tenantId, body); }
}
