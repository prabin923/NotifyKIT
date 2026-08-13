import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('Workflows') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('v1/workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}
  @Get() @RequirePermissions('workflows:manage') list(@Req() request: PlatformRequest) { return this.workflows.list(request.apiClient!.tenantId); }
  @Post() @RequirePermissions('workflows:manage') create(@Req() request: PlatformRequest, @Body() body: CreateWorkflowDto) { return this.workflows.create(request.apiClient!.tenantId, { name: body.name, eventType: body.event_type, definition: body.definition, status: body.status }); }
  @Patch(':id') @RequirePermissions('workflows:manage') update(@Req() request: PlatformRequest, @Param('id') id: string, @Body() body: UpdateWorkflowDto) { return this.workflows.update(request.apiClient!.tenantId, id, body); }
}
