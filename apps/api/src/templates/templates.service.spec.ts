import { TemplatesService } from './templates.service';
import type { PrismaService } from '../common/prisma.service';

describe('TemplatesService', () => {
  const service = new TemplatesService({} as PrismaService);
  it('renders only dotted data paths without evaluating expressions', () => {
    const rendered = service.render('Hello {{user.name}}: {{data.amount}} {{data.currency}} {{constructor.constructor}}', { user: { id: 'u1', name: 'Asha' }, data: { amount: 2500, currency: 'NPR' } });
    expect(rendered).toBe('Hello Asha: 2500 NPR ');
  });
});
