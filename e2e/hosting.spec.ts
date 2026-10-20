import { expect, test } from '@playwright/test';

test('unknown pages return a real 404 with the custom page', async ({ page }) => {
  const res = await page.goto('/esta-pagina-no-existe');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aquí no hay nada');
});

test('fingerprinted assets are cached forever, HTML is always revalidated', async ({ page, request }) => {
  const assets: string[] = [];
  page.on('response', (r) => r.url().includes('/_astro/') && assets.push(r.url()));
  const html = await page.goto('/');
  expect(html?.headers()['cache-control']).toContain('must-revalidate');
  expect(assets.length).toBeGreaterThan(0);
  for (const url of assets) {
    const res = await request.head(url);
    expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  }
});
