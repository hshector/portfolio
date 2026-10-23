// The WarrenIA demo (src/warrenia-app): a separate build of WarrenIA's web app, so React, Tailwind
// and the app's "@/" imports stay out of the rest of the site. Built into public/warrenia-app/,
// which Astro then copies to dist/. The public extract (scripts/warrenia/data.sh) goes in data/.
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const shim = (f: string) => at(`./src/warrenia-app/shims/${f}`);

export default defineConfig({
  root: at('./src/warrenia-app'),
  base: '/warrenia-app/',
  publicDir: at('./.warrenia-public'),
  plugins: [react()],
  css: { postcss: at('./src/warrenia-app') },
  resolve: {
    alias: [
      // what only exists on WarrenIA's server, replaced (see each shim)
      { find: /^@\/lib\/market\/source$/, replacement: shim('source.ts') },
      { find: /^@\/lib\/user\/store$/, replacement: shim('store.ts') },
      { find: /^@\/lib\/supabase\/\w+$/, replacement: shim('supabase.ts') },
      { find: /^@\/app\/login\/actions$/, replacement: shim('supabase.ts') },
      { find: /^next\/link$/, replacement: shim('link.tsx') },
      { find: /^next\/(navigation|cache)$/, replacement: shim('navigation.ts') },
      { find: /^server-only$/, replacement: shim('empty.ts') },
      { find: /^web-push$/, replacement: shim('web-push.ts') },
      // the demo's own pieces that the patched pages use (scripts/warrenia/demo.patch)
      { find: /^@demo\//, replacement: at('./src/warrenia-app/') },
      // the app's own modules
      { find: /^@vendor\//, replacement: at('./vendor/warrenia/web/') },
      { find: /^@\//, replacement: at('./vendor/warrenia/web/') },
    ],
  },
  define: {
    'process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY': 'undefined',
    'process.env.VAPID_PRIVATE_KEY': 'undefined',
    'process.env.VAPID_SUBJECT': 'undefined',
  },
  build: {
    outDir: at('./public/warrenia-app'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 700,
  },
});
