import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service';
import { QueueService } from '../queue/queue.service';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly queue: QueueService) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() { try { await this.prisma.$queryRaw`SELECT 1`; await this.queue.health(); return { status: 'ok', database: 'ok', redis: 'ok' }; } catch { throw new ServiceUnavailableException('A required dependency is unavailable.'); } }
  @Get() health() { return this.ready(); }
}
