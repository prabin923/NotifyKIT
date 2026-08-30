import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  // No Node-only APIs are used (global fetch/AbortController only), so the output runs
  // unmodified in both Node 18+ and browsers.
  platform: 'neutral',
});
