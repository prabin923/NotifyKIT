import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { CreateNotificationDto } from './dto';
import { NotificationsService } from './notifications.service';
import { NotificationStatus } from '@prisma/client';

@ApiTags('Notifications') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Post() @HttpCode(202) @RequirePermissions('notifications:write') create(@Req() request: PlatformRequest, @Body() body: CreateNotificationDto) { return this.notifications.create(request.apiClient!.tenantId, body); }
  @Get() @RequirePermissions('notifications:read') list(@Req() request: PlatformRequest, @Query('status') status?: NotificationStatus, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.notifications.list(request.apiClient!.tenantId, { status, limit: limit ? Number(limit) : undefined, cursor }); }
  @Get(':id') @RequirePermissions('notifications:read') get(@Req() request: PlatformRequest, @Param('id') id: string) { return this.notifications.get(request.apiClient!.tenantId, id); }
  @Post(':id/cancel') @HttpCode(204) @RequirePermissions('notifications:write') cancel(@Req() request: PlatformRequest, @Param('id') id: string) { return this.notifications.cancel(request.apiClient!.tenantId, id); }
}
