import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

function isAccelerateUrl(url: string | undefined): url is string {
  return Boolean(url?.startsWith('prisma://') || url?.startsWith('prisma+postgres://'));
}

export class PrismaService extends PrismaClient {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    super(isAccelerateUrl(databaseUrl) ? { datasourceUrl: databaseUrl } : undefined);

    if (isAccelerateUrl(databaseUrl)) {
      return this.$extends(withAccelerate()) as this;
    }
  }

  async connect(): Promise<void> {
    await this.$connect();
  }

  async disconnect(): Promise<void> {
    await this.$disconnect();
  }

}
