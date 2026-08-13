import { Injectable } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string) { return this.prisma.user.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' }, take: 100 }); }
  async registerDevice(tenantId: string, externalUserId: string, input: { deviceToken: string; platform: DevicePlatform; appVersion?: string }) {
    const user = await this.prisma.user.findFirst({ where: { tenantId, externalId: externalUserId } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'The target user does not exist for this tenant.', 404);
    const existing = await this.prisma.device.findFirst({ where: { deviceToken: input.deviceToken } });
    if (existing && existing.tenantId !== tenantId) throw new ApiError('DEVICE_CONFLICT', 'This device token is already registered to another tenant.', 409);
    return this.prisma.device.upsert({ where: { deviceToken: input.deviceToken }, update: { userId: user.id, platform: input.platform, appVersion: input.appVersion, lastActiveAt: new Date() }, create: { tenantId, userId: user.id, deviceToken: input.deviceToken, platform: input.platform, appVersion: input.appVersion, lastActiveAt: new Date() } });
  }
}
