import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: { tenantId: string; actorUserId?: string; action: string; resource: string; resourceId?: string; metadata?: Record<string, unknown>; ipAddress?: string }): Promise<void> {
    await this.prisma.auditLog.create({ data: { ...input, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
  }
}
