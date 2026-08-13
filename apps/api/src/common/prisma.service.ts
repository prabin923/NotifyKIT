import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

function isAccelerateUrl(url: string | undefined): url is string {
  return Boolean(url?.startsWith('prisma://') || url?.startsWith('prisma+postgres://'));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    super(isAccelerateUrl(databaseUrl) ? { datasourceUrl: databaseUrl } : undefined);

    if (isAccelerateUrl(databaseUrl)) {
      return this.$extends(withAccelerate()) as this;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => app.close());
  }
}
