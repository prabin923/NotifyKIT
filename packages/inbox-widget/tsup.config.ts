import { defineConfig } from 'tsup';

export default defineConfig([
  // Bundler consumers: `import { defineInboxWidget } from '@notification-platform/inbox-widget'`.
  {
    entry: { 'inbox-widget': 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
  },
  // `<script src="…/inbox-widget.iife.js">` path: registers <notifykit-inbox> as a side effect.
  // tsup's default iife extension is `.global.js`; pin it back to `.iife.js` for a predictable URL.
  {
    entry: { 'inbox-widget.iife': 'src/register.ts' },
    format: ['iife'],
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2022',
    outExtension: () => ({ js: '.js' }),
  },
]);
