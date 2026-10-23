import { expect, test } from '@playwright/test';

// The page under the island is for visitors without 3D (here: reduced motion, before entering).
test('home shows both projects without errors or sideways scroll', async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('HSorollaP');
  await expect(page.getByRole('heading', { name: 'WarrenIA' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notas de lectura' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Temáticas' }).getByRole('listitem')).toHaveCount(6);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  await page.close();
});

test('fonts are self-hosted, not loaded from a third party', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname !== 'localhost') external.push(r.url());
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('800 16px "Bricolage Grotesque Variable"'))).toBe(true);
});

test('the site says nothing about its author but the alias', async ({ request }) => {
  for (const path of ['/', '/warrenia', '/constelacion', '/biblioteca', '/404']) {
    // (the workers.dev address is the Cloudflare account's, and changes in its dashboard, not here)
    const html = (await (await request.get(path)).text()).replace(/https?:\/\/[^"'\s]*\.workers\.dev/g, '');
    if (path !== '/404') expect(html, path).toContain('HSorollaP');
    expect(html, path).not.toMatch(/Héctor|H&#233;ctor|Sanchis|hshector|github\.com\/hs|@gmail/i);
  }
  // nor WarrenIA's demo and its data
  for (const path of ['/warrenia-app/', '/warrenia-app/data/SOURCES.md', '/warrenia-app/data/meta.json']) {
    expect(await (await request.get(path)).text(), path).not.toMatch(/Héctor|Sanchis|hshector|@gmail/i);
  }
});
