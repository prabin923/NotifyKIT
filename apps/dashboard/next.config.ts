import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: join(__dirname, '../..'),
};
export default nextConfig;
