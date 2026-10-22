import { expect, test } from '@playwright/test';

// These run against the real vault (CI checks it out next to the site).

test('library index lists the six themes and searches the notes', async ({ page }) => {
  await page.goto('/biblioteca');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notas de lectura');
  await expect(page.locator('.theme')).toHaveCount(6);
  await page.getByPlaceholder('Busca un concepto, un autor o una idea').fill('Black-Scholes');
  const first = page.locator('.pagefind-ui__result-link').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/biblioteca\//);
});

test('a concept page renders its formulas and links to its books', async ({ page }) => {
  await page.goto('/biblioteca/ecuacion-de-black-scholes-edp');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ecuación de Black-Scholes (EDP)');
  await expect(page.locator('.prose .katex').first()).toBeVisible();
  await expect(page.locator('.katex-error')).toHaveCount(0);
  await page.locator('.prose a[href^="/biblioteca/"]').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a book page shows the summary and its concepts, not the chapter notes', async ({ page }) => {
  const res = await page.goto('/biblioteca/daniel-yergin-the-prize');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The Prize');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  const concepts = page.getByRole('heading', { name: /Conceptos de este libro/ });
  await expect(concepts).toBeVisible();
  expect(await page.locator('#concepts-title + ul li').count()).toBeGreaterThan(100);
  await expect(page.getByText('Capítulo 1. La fiebre del petróleo')).toHaveCount(0);
});

test('theme pages group concepts by letter', async ({ page }) => {
  await page.goto('/biblioteca/tema/finanzas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finanzas');
  await page.getByRole('navigation', { name: 'Letras' }).getByRole('link', { name: 'B', exact: true }).click();
  await expect(page).toHaveURL(/#letra-B$/);
});

test('the WarrenIA page runs the demo, with fictitious data and no advice', async ({ page }) => {
  await page.goto('/warrenia');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('WarrenIA');
  const demo = page.locator('.wdemo');
  await expect(demo.getByRole('note')).toContainText('Datos ficticios');
  await expect(demo.getByRole('note')).toContainText('No es asesoramiento financiero');
  await expect(demo.locator('.w-kpi')).toHaveText(/^[\d.]+\s€$/);
  await demo.getByRole('tab', { name: 'Plan' }).click();
  await expect(demo.getByText('Un rango, no una promesa')).toBeVisible();
  await demo.getByRole('tab', { name: 'Radar' }).click();
  await expect(demo.locator('.w-list li').first()).toContainText('Empresa Demo');
  await demo.getByRole('tab', { name: 'Cartera' }).click();
  await expect(demo.getByText('Impuesto estimado')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('long formulas scroll inside the page instead of widening it', async ({ page }) => {
  await page.goto('/biblioteca/ecuacion-de-black-scholes-edp');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
