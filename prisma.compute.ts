import { defineComputeConfig } from '@prisma/compute-sdk/config';

export default defineComputeConfig({
  region: 'ap-southeast-1',
  apps: {
    api: {
      name: 'notifykit-api',
      root: 'apps/api',
      framework: 'custom',
      httpPort: 3000,
      build: {
        command: 'npm run build:compute',
        outputDirectory: 'dist',
        entrypoint: 'main.js',
      },
    },
  },
});
