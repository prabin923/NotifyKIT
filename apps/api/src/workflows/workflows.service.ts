import { Injectable } from '@nestjs/common';
import { Prisma, WorkflowStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}
  private validateDefinition(definition: Record<string, unknown>): void {
    const nodes = definition.nodes;
    if (!Array.isArray(nodes) || !nodes.some((node) => node && typeof node === 'object' && (node as Record<string, unknown>).type === 'EVENT') || !nodes.some((node) => node && typeof node === 'object' && (node as Record<string, unknown>).type === 'END')) {
      throw new ApiError('INVALID_WORKFLOW', 'Workflow definition must contain EVENT and END nodes.', 400);
    }
    const known = new Set(['EVENT', 'SEND_NOTIFICATION', 'WAIT', 'CONDITION', 'CHANNEL', 'FALLBACK', 'END']);
    if (nodes.some((node) => !node || typeof node !== 'object' || !known.has(String((node as Record<string, unknown>).type)))) throw new ApiError('INVALID_WORKFLOW', 'Workflow contains an unsupported node type.', 400);
  }
  async create(tenantId: string, input: { name: string; eventType: string; definition: Record<string, unknown>; status?: WorkflowStatus }) { this.validateDefinition(input.definition); return this.prisma.workflow.create({ data: { tenantId, name: input.name, eventType: input.eventType, definition: input.definition as Prisma.InputJsonValue, status: input.status ?? WorkflowStatus.DRAFT } }); }
  async list(tenantId: string) { return this.prisma.workflow.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } }); }
  async update(tenantId: string, id: string, input: { name?: string; definition?: Record<string, unknown>; status?: WorkflowStatus }) { if (input.definition) this.validateDefinition(input.definition); const result = await this.prisma.workflow.updateMany({ where: { tenantId, id }, data: { name: input.name, definition: input.definition as Prisma.InputJsonValue | undefined, status: input.status } }); if (!result.count) throw new ApiError('NOT_FOUND', 'Workflow not found.', 404); return this.prisma.workflow.findFirstOrThrow({ where: { tenantId, id } }); }
}
