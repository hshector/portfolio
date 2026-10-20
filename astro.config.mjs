// @ts-check
import { defineConfig } from 'astro/config';

// Static output: every page is real HTML served from Cloudflare's CDN.
export default defineConfig({
  // Real URL is known after the first deploy (<name>.<account>.workers.dev); set SITE_URL then.
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
});
