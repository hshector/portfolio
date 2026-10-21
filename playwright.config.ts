import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH lets environments with a preinstalled Chromium skip the download.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// CI runners have no GPU: use Chromium's software WebGL so the constellation really renders.
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4321', launchOptions: { executablePath, args } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath, args } } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions: { executablePath, args } } },
  ],
  // Serve dist/ with wrangler: the same asset engine Cloudflare uses in production,
  // so 404 handling and _headers are tested for real. Needs `npm run build` first.
  webServer: {
    command: 'npx wrangler dev --port 4321 --ip 127.0.0.1',
    url: 'http://localhost:4321',
    env: { WRANGLER_SEND_METRICS: 'false' },
    reuseExistingServer: !process.env.CI,
  },
});
