import { Injectable } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async enabledChannels(tenantId: string, userId: string, category: string, requested: Channel[]): Promise<Channel[]> {
    const [preferences, policy] = await Promise.all([
      this.prisma.notificationPreference.findMany({ where: { tenantId, userId, category, channel: { in: requested } } }),
      this.prisma.tenantPolicy.findUnique({ where: { tenantId } }),
    ]);
    const disabled = new Set(preferences.filter((preference) => !preference.enabled).map((preference) => preference.channel));
    const required = category === 'security' ? new Set(policy?.mandatorySecurityChannels ?? []) : new Set<Channel>();
    return requested.filter((channel) => required.has(channel) || !disabled.has(channel));
  }

  async list(tenantId: string, userExternalId: string) {
    return this.prisma.notificationPreference.findMany({ where: { tenantId, user: { externalId: userExternalId } }, orderBy: [{ category: 'asc' }, { channel: 'asc' }] });
  }

  async upsert(tenantId: string, userExternalId: string, input: { category: string; channel: Channel; enabled: boolean }) {
    const user = await this.prisma.user.findFirstOrThrow({ where: { tenantId, externalId: userExternalId } });
    return this.prisma.notificationPreference.upsert({ where: { tenantId_userId_category_channel: { tenantId, userId: user.id, category: input.category, channel: input.channel } }, update: { enabled: input.enabled }, create: { tenantId, userId: user.id, ...input } });
  }
}
