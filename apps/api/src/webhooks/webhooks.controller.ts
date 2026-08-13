import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { CreateWebhookDto, UpdateWebhookDto } from './dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}
  @Get() @RequirePermissions('webhooks:manage') list(@Req() request: PlatformRequest) { return this.webhooks.list(request.apiClient!.tenantId); }
  @Post() @RequirePermissions('webhooks:manage') create(@Req() request: PlatformRequest, @Body() body: CreateWebhookDto) { return this.webhooks.create(request.apiClient!.tenantId, body); }
  @Patch(':id') @RequirePermissions('webhooks:manage') update(@Req() request: PlatformRequest, @Param('id') id: string, @Body() body: UpdateWebhookDto) { return this.webhooks.update(request.apiClient!.tenantId, id, body); }
}
