import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { RegisterDeviceDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('Users and devices') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() @RequirePermissions('users:manage') list(@Req() request: PlatformRequest) { return this.users.list(request.apiClient!.tenantId); }
  @Post(':externalUserId/devices') @RequirePermissions('devices:manage') registerDevice(@Req() request: PlatformRequest, @Param('externalUserId') externalUserId: string, @Body() body: RegisterDeviceDto) { return this.users.registerDevice(request.apiClient!.tenantId, externalUserId, { deviceToken: body.device_token, platform: body.platform, appVersion: body.app_version }); }
}
