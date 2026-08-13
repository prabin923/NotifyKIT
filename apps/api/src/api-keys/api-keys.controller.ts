import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardJwtGuard } from '../auth/dashboard-jwt.guard';
import { RequireRoles } from '../common/roles.decorator';
import type { PlatformRequest } from '../common/request-context';
import { AuditService } from '../common/audit.service';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';
import { DashboardRole } from '@prisma/client';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(DashboardJwtGuard)
@Controller('v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService, private readonly audit: AuditService) {}

  @Get()
  list(@Req() request: PlatformRequest) {
    return this.apiKeys.list(request.dashboardUser!.tenantId);
  }

  @Post()
  @RequireRoles(DashboardRole.OWNER, DashboardRole.ADMIN, DashboardRole.DEVELOPER)
  async create(@Req() request: PlatformRequest, @Body() body: CreateApiKeyDto) {
    const key = await this.apiKeys.create(request.dashboardUser!.tenantId, { name: body.name, permissions: body.permissions, expiresAt: body.expires_at, environment: body.environment });
    await this.audit.log({ tenantId: request.dashboardUser!.tenantId, actorUserId: request.dashboardUser!.id, action: 'api_key.created', resource: 'api_key', resourceId: key.id, ipAddress: request.ip });
    return key;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireRoles(DashboardRole.OWNER, DashboardRole.ADMIN, DashboardRole.DEVELOPER)
  async revoke(@Req() request: PlatformRequest, @Param('id') id: string): Promise<void> {
    await this.apiKeys.revoke(request.dashboardUser!.tenantId, id);
    await this.audit.log({ tenantId: request.dashboardUser!.tenantId, actorUserId: request.dashboardUser!.id, action: 'api_key.revoked', resource: 'api_key', resourceId: id, ipAddress: request.ip });
  }
}
