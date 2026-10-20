// @ts-check
import { defineConfig } from 'astro/config';

// Static output: every page is real HTML served from Cloudflare's CDN.
export default defineConfig({
  // Production address on Cloudflare (<worker>.<account subdomain>.workers.dev).
  site: process.env.SITE_URL ?? 'https://hector-portfolio.hectorsanchispont.workers.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
});
