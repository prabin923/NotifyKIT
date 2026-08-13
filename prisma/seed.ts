import { PrismaClient, Channel, DashboardRole, TemplateStatus, WorkflowStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../packages/shared/src/index.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const pepper = process.env.API_KEY_PEPPER ?? 'local-development-pepper-only';
  const rawKey = `nk_test_${randomBytes(24).toString('base64url')}`;
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
      tenantPolicy: { create: {} },
      dashboardUsers: {
        create: {
          email: 'owner@example.test', name: 'Demo Owner', role: DashboardRole.OWNER,
          passwordHash: await bcrypt.hash('ChangeMe123!', 12),
        },
      },
    },
  });

  await prisma.apiKey.deleteMany({ where: { tenantId: tenant.id, name: 'Local demo key' } });
  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id, name: 'Local demo key', prefix: rawKey.slice(0, 12),
      keyHash: sha256(`${pepper}:${rawKey}`), permissions: ['events:write', 'notifications:read', 'notifications:write', 'templates:read', 'templates:write', 'analytics:read', 'webhooks:manage'],
    },
  });

  await prisma.template.upsert({
    where: { tenantId_eventType_channel_language_version: { tenantId: tenant.id, eventType: 'order.created', channel: Channel.EMAIL, language: 'en', version: 1 } },
    update: { status: TemplateStatus.ACTIVE },
    create: { tenantId: tenant.id, name: 'Order created email', eventType: 'order.created', channel: Channel.EMAIL, subject: 'Order {{data.order_id}} received', body: 'Hello {{user.name}}, your order {{data.order_id}} for {{data.amount}} was received.', status: TemplateStatus.ACTIVE },
  });

  await prisma.workflow.upsert({
    where: { id: `${tenant.id}-order-created` },
    update: { status: WorkflowStatus.ACTIVE },
    create: { id: `${tenant.id}-order-created`, tenantId: tenant.id, name: 'Order created', eventType: 'order.created', status: WorkflowStatus.ACTIVE, definition: { nodes: [{ type: 'EVENT' }, { type: 'SEND_NOTIFICATION', category: 'transactional', channels: ['EMAIL'] }, { type: 'END' }] } },
  });

  console.log(`Demo dashboard: owner@example.test / ChangeMe123!`);
  console.log(`Demo API key (shown once): ${rawKey}`);
}

main().finally(() => prisma.$disconnect());
