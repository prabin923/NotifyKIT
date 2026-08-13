import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';
import { TemplatesService } from './templates.service';

@ApiTags('Templates')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('v1/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}
  @Get() @RequirePermissions('templates:read') list(@Req() request: PlatformRequest) { return this.templates.list(request.apiClient!.tenantId); }
  @Post() @RequirePermissions('templates:write') create(@Req() request: PlatformRequest, @Body() body: CreateTemplateDto) { return this.templates.create(request.apiClient!.tenantId, { name: body.name, eventType: body.event_type, channel: body.channel, subject: body.subject, body: body.body, language: body.language, version: body.version, status: body.status }); }
  @Patch(':id') @RequirePermissions('templates:write') update(@Req() request: PlatformRequest, @Param('id') id: string, @Body() body: UpdateTemplateDto) { return this.templates.update(request.apiClient!.tenantId, id, body); }
}
