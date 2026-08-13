import { config } from 'dotenv';
import { resolve } from 'node:path';

// Jest runs from apps/api; load the monorepo's local development contract before
// importing AppModule, whose configuration is validated at module construction.
config({ path: resolve(__dirname, '../../..', '.env') });
