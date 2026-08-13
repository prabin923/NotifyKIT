import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { WebhookStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { SecretCipherService } from '../common/secret-cipher.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService, private readonly cipher: SecretCipherService) {}

  async create(tenantId: string, input: { url: string; events: string[]; secret?: string }) {
    const secret = input.secret ?? randomBytes(32).toString('base64url');
    const webhook = await this.prisma.webhook.create({ data: { tenantId, url: input.url, events: [...new Set(input.events)], secret: this.cipher.encrypt(secret) } });
    return { id: webhook.id, url: webhook.url, events: webhook.events, status: webhook.status, secret };
  }

  async list(tenantId: string) {
    const hooks = await this.prisma.webhook.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return hooks.map(({ secret: _secret, ...hook }) => hook);
  }

  async update(tenantId: string, id: string, input: { status?: WebhookStatus; events?: string[] }) {
    const result = await this.prisma.webhook.updateMany({ where: { id, tenantId }, data: { status: input.status, events: input.events ? [...new Set(input.events)] : undefined } });
    if (!result.count) throw new ApiError('NOT_FOUND', 'Webhook not found.', 404);
    return this.prisma.webhook.findFirstOrThrow({ where: { id, tenantId }, select: { id: true, url: true, events: true, status: true, createdAt: true, updatedAt: true } });
  }
}
