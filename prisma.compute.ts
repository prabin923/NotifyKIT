import { defineComputeConfig } from '@prisma/compute-sdk/config';

export default defineComputeConfig({
  region: 'ap-southeast-1',
  apps: {
    api: {
      name: 'notifykit-api',
      root: 'apps/api',
      framework: 'nestjs',
    },
  },
});
