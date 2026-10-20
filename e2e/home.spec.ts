import { expect, test } from '@playwright/test';

test('home shows both projects without errors or sideways scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Héctor Sanchis');
  await expect(page.getByRole('heading', { name: 'WarrenIA' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notas de lectura' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Temáticas' }).getByRole('listitem')).toHaveCount(6);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
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
