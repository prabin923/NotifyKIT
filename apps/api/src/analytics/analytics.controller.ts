import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { DashboardJwtGuard } from '../auth/dashboard-jwt.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('v1')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('analytics') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequirePermissions('analytics:read') apiOverview(@Req() request: PlatformRequest, @Query('from') from?: string, @Query('to') to?: string) { return this.analytics.overview(request.apiClient!.tenantId, from ? new Date(from) : undefined, to ? new Date(to) : undefined); }
  @Get('dashboard/overview') @ApiBearerAuth() @UseGuards(DashboardJwtGuard) dashboardOverview(@Req() request: PlatformRequest) { return this.analytics.overview(request.dashboardUser!.tenantId); }
}
