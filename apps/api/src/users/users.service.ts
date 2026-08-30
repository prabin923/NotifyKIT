import { DevicePlatform, UserStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string) { return this.prisma.user.findMany({ where: { tenantId }, include: { _count: { select: { devices: true, notifications: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }); }

  async create(tenantId: string, input: CreateUserDto) {
    return this.prisma.user.upsert({
      where: { tenantId_externalId: { tenantId, externalId: input.external_id } },
      update: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
      create: {
        tenantId,
        externalId: input.external_id,
        name: input.name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
      },
    });
  }

  async update(tenantId: string, userId: string, input: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing) throw new ApiError('USER_NOT_FOUND', 'User not found.', 404);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async registerDevice(tenantId: string, externalUserId: string, input: { deviceToken: string; platform: DevicePlatform; appVersion?: string }) {
    const user = await this.prisma.user.findFirst({ where: { tenantId, externalId: externalUserId } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'The target user does not exist for this tenant.', 404);
    const existing = await this.prisma.device.findFirst({ where: { deviceToken: input.deviceToken } });
    if (existing && existing.tenantId !== tenantId) throw new ApiError('DEVICE_CONFLICT', 'This device token is already registered to another tenant.', 409);
    return this.prisma.device.upsert({ where: { deviceToken: input.deviceToken }, update: { userId: user.id, platform: input.platform, appVersion: input.appVersion, lastActiveAt: new Date() }, create: { tenantId, userId: user.id, deviceToken: input.deviceToken, platform: input.platform, appVersion: input.appVersion, lastActiveAt: new Date() } });
  }
}
