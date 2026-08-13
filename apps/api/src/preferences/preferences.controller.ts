import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { UpsertPreferenceDto } from './dto';
import { PreferencesService } from './preferences.service';

@ApiTags('Preferences') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('v1/users/:externalUserId/preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}
  @Get() @RequirePermissions('users:manage') list(@Req() request: PlatformRequest, @Param('externalUserId') externalUserId: string) { return this.preferences.list(request.apiClient!.tenantId, externalUserId); }
  @Put() @RequirePermissions('users:manage') upsert(@Req() request: PlatformRequest, @Param('externalUserId') externalUserId: string, @Body() body: UpsertPreferenceDto) { return this.preferences.upsert(request.apiClient!.tenantId, externalUserId, body); }
}
