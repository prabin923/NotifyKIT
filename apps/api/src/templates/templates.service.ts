import { Channel, TemplateStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

export interface TemplateContext { user: { id: string; name?: string | null; email?: string | null; phone?: string | null }; data: Record<string, unknown> }

export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, input: { name: string; eventType: string; channel: Channel; subject?: string; body: string; language?: string; version?: number; status?: TemplateStatus }) {
    return this.prisma.template.create({ data: { tenantId, name: input.name, eventType: input.eventType, channel: input.channel, subject: input.subject, body: input.body, language: input.language ?? 'en', version: input.version ?? 1, status: input.status ?? TemplateStatus.DRAFT } });
  }

  async list(tenantId: string) {
    return this.prisma.template.findMany({ where: { tenantId }, orderBy: [{ eventType: 'asc' }, { channel: 'asc' }, { version: 'desc' }] });
  }

  async update(tenantId: string, id: string, input: { name?: string; subject?: string; body?: string; status?: TemplateStatus }) {
    const result = await this.prisma.template.updateMany({ where: { id, tenantId }, data: input });
    if (!result.count) throw new ApiError('NOT_FOUND', 'Template not found.', 404);
    return this.prisma.template.findFirstOrThrow({ where: { id, tenantId } });
  }

  async activeForEvent(tenantId: string, eventType: string, channels?: Channel[]): Promise<Map<Channel, { id: string; subject: string | null; body: string }>> {
    const templates = await this.prisma.template.findMany({ where: { tenantId, eventType, status: TemplateStatus.ACTIVE, ...(channels ? { channel: { in: channels } } : {}) }, orderBy: { version: 'desc' } });
    const byChannel = new Map<Channel, { id: string; subject: string | null; body: string }>();
    for (const template of templates) if (!byChannel.has(template.channel)) byChannel.set(template.channel, template);
    return byChannel;
  }

  render(source: string, context: TemplateContext): string {
    return source.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, path: string) => {
      const value = path.split('.').reduce<unknown>((current, key) => {
        if (current && typeof current === 'object' && key in current) return (current as Record<string, unknown>)[key];
        return undefined;
      }, context);
      return value === undefined || value === null ? '' : String(value);
    });
  }
}
