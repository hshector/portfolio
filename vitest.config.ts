import { defineConfig } from 'vitest/config';

export default defineConfig({
  // (WarrenIA's tests import its modules as "@/lib/…")
  resolve: { alias: { '@': new URL('./vendor/warrenia/web', import.meta.url).pathname } },
  test: { include: ['tests/**/*.test.ts', 'vendor/**/*.test.ts'] },
});
