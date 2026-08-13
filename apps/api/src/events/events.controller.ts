import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { CreateEventDto } from './dto';
import { EventsService } from './events.service';

@ApiTags('Events') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post() @HttpCode(202) @RequirePermissions('events:write')
  @ApiOperation({ summary: 'Accept a universal event asynchronously' })
  @ApiResponse({ status: 202, description: 'Event accepted for notification processing' })
  async create(@Req() request: PlatformRequest, @Body() body: CreateEventDto, @Headers('idempotency-key') headerKey?: string) {
    const result = await this.events.accept(request.apiClient!.tenantId, body, headerKey);
    return { success: true, ...result, request_id: request.requestId };
  }
}
