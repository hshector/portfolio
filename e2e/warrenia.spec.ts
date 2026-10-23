import { expect, test, type Page } from '@playwright/test';

// WarrenIA's own web app, built static at /warrenia-app/ (src/warrenia-app) on the public extract of
// its latest night (CI downloads the real one; it has no prices). These tests do not depend on which
// companies lead the radar that night.

const open = async (page: Page, route = '/') => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/warrenia-app/#${route}`);
  return errors;
};
const radarRows = (page: Page) => page.locator('a[href^="#/research/"]');

test('the radar lists the analysed companies, and each one opens its analysis', async ({ page }) => {
  const errors = await open(page, '/radar');
  await expect(page.getByRole('heading', { level: 1, name: 'Radar' })).toBeVisible();
  await expect(radarRows(page).first()).toBeVisible({ timeout: 20_000 });
  expect(await radarRows(page).count()).toBeGreaterThan(5);
  const ticker = decodeURIComponent((await radarRows(page).first().getAttribute('href'))!.split('/').pop()!);
  await radarRows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`#/research/${ticker.replace('.', '\\.')}$`));
  await expect(page.getByText('Momentum score', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rank \d+ of \d+/)).toBeVisible();
  // no market price anywhere: the price chart is TradingView's, and only on request
  await expect(page.getByRole('button', { name: 'Show the price chart' })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/\$\d/);
  expect(errors).toEqual([]);
});

test("TradingView's chart loads only when the visitor asks for it", async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => r.url().includes('tradingview.com') && calls.push(r.url()));
  await open(page, '/radar');
  await radarRows(page).first().click();
  await expect(page.getByText('Momentum score', { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
  // (the widget itself is not loaded in the tests: the call is answered here)
  await page.route('**/*tradingview.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.getByRole('button', { name: 'Show the price chart' }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
});

test('a portfolio entered in the demo stays in this browser', async ({ page }) => {
  await open(page, '/portfolio');
  await page.getByRole('button', { name: /Instrument/ }).click();
  await page.getByLabel('Pick from your plan').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Your portfolio is empty')).toBeVisible();
  await page.getByRole('button', { name: /Transaction/ }).first().click();
  await page.locator('select[name="type"]').selectOption('deposit');
  await page.locator('input[name="amount"]').fill('1000');
  await page.getByRole('button', { name: /^Save/ }).click();
  await page.getByRole('button', { name: /Transaction/ }).first().click();
  await page.locator('select[name="type"]').selectOption('buy');
  await page.locator('input[name="quantity"]').fill('8');
  await page.locator('input[name="price"]').fill('120');
  await page.getByRole('button', { name: /^Save/ }).click();
  await expect(page.getByText('€960.00')).toBeVisible();
  await page.reload();
  await expect(page.getByText('€960.00')).toBeVisible();
  // and it is only in localStorage: nothing was sent anywhere
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('warrenia-demo:user')!).transactions.length)).toBe(2);
});

test('the public extract has no prices', async ({ request }) => {
  const radar = await (await request.get('/warrenia-app/data/radar.json')).json();
  expect(radar.rows.length).toBeGreaterThan(5);
  expect(radar.rows.every((r: { px: number | null }) => r.px === null)).toBe(true);
  const asset = await (await request.get(`/warrenia-app/data/assets/${encodeURIComponent(radar.rows[0].t)}.json`)).json();
  expect(asset.series).toBeUndefined();
  expect(asset.report).toBeDefined();
});

test('the app fits a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await open(page, '/');
  await expect(page.getByRole('navigation', { name: 'Main' }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
