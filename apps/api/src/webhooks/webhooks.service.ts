import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { WebhookStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { SecretCipherService } from '../common/secret-cipher.service';

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0)
    || first >= 224;
}

function publicWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('INVALID_WEBHOOK_URL', 'Webhook URL must be a valid public HTTPS URL.', 400);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipVersion = isIP(hostname);
  if (url.protocol !== 'https:' || url.username || url.password || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || ipVersion === 6 || (ipVersion === 4 && isPrivateIpv4(hostname))) {
    throw new ApiError('INVALID_WEBHOOK_URL', 'Webhook URL must use a public HTTPS hostname.', 400);
  }
  return url.toString();
}

export class WebhooksService {
  constructor(private readonly prisma: PrismaService, private readonly cipher: SecretCipherService) {}

  async create(tenantId: string, input: { url: string; events: string[]; secret?: string }) {
    const secret = input.secret ?? randomBytes(32).toString('base64url');
    const url = publicWebhookUrl(input.url);
    const webhook = await this.prisma.webhook.create({ data: { tenantId, url, events: [...new Set(input.events)], secret: this.cipher.encrypt(secret) } });
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
