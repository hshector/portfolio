import { expect, test, type Page } from '@playwright/test';

// The constellation is drawn with WebGL; these tests drive it through the page and a small
// debug API it exposes (window.__constellation) to know which star is focused.

type Label = { text: string; kind: string; rect: { left: number; right: number; top: number; bottom: number } };
type Api = {
  focus(): string | null;
  labels(): Label[];
  onScreen(): number;
  zoom(distance: number): void;
  select(slug: string): void;
  visibleStars(): number;
  starScreen(slug: string): { x: number; y: number; visible: boolean };
};
const api = async <T>(page: Page, fn: (c: Api) => T): Promise<T> => {
  const handle = await page.evaluateHandle(() => (window as unknown as { __constellation: Api }).__constellation);
  return handle.evaluate(fn as never) as Promise<T>;
};
const ready = async (page: Page, url: string) => {
  await page.goto(url);
  await expect(page.locator('[data-constellation]')).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
};
const focusOf = (page: Page) => page.evaluate(() => (window as unknown as { __constellation: Api }).__constellation.focus());

test('every note becomes a star', async ({ page, request }) => {
  const meta = await (await request.get('/data/graph.json')).json();
  await ready(page, '/constelacion');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __constellation: Api }).__constellation.visibleStars()), { timeout: 15_000 }).toBe(meta.nodes);
  await expect(page.locator('#legend button')).toHaveCount(6);
});

test('search flies to a note and opens it in the panel', async ({ page }) => {
  await ready(page, '/constelacion');
  await page.locator('#search').fill('patron oro');
  await expect(page.locator('#search-results li').first()).toContainText('Patrón oro');
  await page.locator('#search').press('Enter');
  await expect(page.locator('#panel h2')).toHaveText('Patrón oro');
  await expect(page).toHaveURL(/#patron-oro$/);
  await expect(page.locator('#panel .prose')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('#panel .prose')).toContainText('sistema monetario');
});

test('a link to a note opens the sky focused on it, and links in the panel fly to their star', async ({ page }) => {
  await ready(page, '/constelacion#bitcoin');
  await expect(page.locator('#panel h2')).toHaveText('Bitcoin');
  const link = page.locator('#panel .links a[data-star]').first();
  const title = (await link.textContent())!.trim();
  await link.click();
  await expect(page.locator('#panel h2')).not.toHaveText('Bitcoin');
  expect(await focusOf(page)).not.toBe('bitcoin');
  await expect(page).not.toHaveURL(/#bitcoin$/);
  expect(title.length).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();
});

test('a book can be toured concept by concept', async ({ page }) => {
  await ready(page, '/constelacion#daniel-yergin-the-prize');
  await page.getByRole('button', { name: 'Recorrer este libro' }).click();
  await expect(page.locator('#panel .tour span')).toContainText('1 de 10');
  const first = await focusOf(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel .tour span')).toContainText('2 de 10');
  expect(await focusOf(page)).not.toBe(first);
});

test('themes can be hidden from the legend', async ({ page }) => {
  await ready(page, '/constelacion');
  const count = () => page.evaluate(() => (window as unknown as { __constellation: Api }).__constellation.visibleStars());
  await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(3000);
  const before = await count();
  const finanzas = page.locator('#legend button[data-theme="Finanzas"]');
  await finanzas.click();
  await expect(finanzas).toHaveAttribute('aria-pressed', 'false');
  expect(await count()).toBeLessThan(before - 500);
});

test('clicking a star on the canvas selects it', async ({ page }) => {
  await ready(page, '/constelacion#daniel-yergin-the-prize');
  await expect(page.locator('#panel h2')).toHaveText('The Prize');
  await page.waitForTimeout(1500); // let the camera finish its flight
  const target = await page.evaluate(() => {
    const c = (window as unknown as { __constellation: Api }).__constellation;
    const panel = document.querySelector('#panel')!.getBoundingClientRect();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#panel .links a')) {
      const slug = a.getAttribute('href')!.split('/').pop()!;
      const s = c.starScreen(slug);
      // Desktop: the panel is on the right. Phone: it is a sheet along the bottom.
      const sheet = panel.width > innerWidth * 0.8;
      const free = sheet ? s.x > 30 && s.x < innerWidth - 30 && s.y > 150 && s.y < panel.top - 30 : s.x > 40 && s.y > 90 && s.x < panel.left - 40 && s.y < innerHeight - 80;
      if (s.visible && free) return { slug, ...s };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.move(target!.x, target!.y);
  await page.mouse.click(target!.x, target!.y);
  await expect.poll(() => focusOf(page)).not.toBe('daniel-yergin-the-prize');
});

test('without WebGL it offers the list view instead', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/constelacion');
  await expect(page.locator('[data-constellation]')).toHaveAttribute('data-state', 'fallback');
  await expect(page.getByRole('link', { name: 'Ver la biblioteca en lista' })).toBeVisible();
});

test('note pages link to their star', async ({ page }) => {
  await page.goto('/biblioteca/bitcoin');
  await page.getByRole('link', { name: 'Ver en la constelación' }).click();
  await expect(page).toHaveURL(/\/constelacion#bitcoin$/);
  await expect(page.locator('#panel h2')).toHaveText('Bitcoin', { timeout: 20_000 });
});

test('on a phone the focused star stays above the reading sheet', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await ready(page, '/constelacion#bitcoin');
  await expect(page.locator('#panel h2')).toHaveText('Bitcoin');
  await page.waitForTimeout(1500);
  const { star, sheetTop, overflow } = await page.evaluate(() => ({
    star: (window as unknown as { __constellation: Api }).__constellation.starScreen('bitcoin'),
    sheetTop: document.querySelector('#panel')!.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(overflow).toBe(false);
  expect(star.visible).toBe(true);
  expect(star.y).toBeLessThan(sheetTop);
});

const overlaps = (a: Label['rect'], b: Label['rect']) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const checkLabels = async (page: Page) => {
  const labels = await api(page, (c) => c.labels());
  const ui = await page.evaluate(() =>
    ['.bar > *', '#legend button', '#panel']
      .flatMap((s) => [...document.querySelectorAll<HTMLElement>(s)])
      .filter((e) => !e.hidden && e.offsetParent)
      .map((e) => e.getBoundingClientRect().toJSON()),
  );
  for (const l of labels) {
    expect(ui.some((u) => overlaps(l.rect, u)), `"${l.text}" covers the interface`).toBe(false);
    for (const o of labels) if (o !== l) expect(overlaps(l.rect, o.rect), `"${l.text}" overlaps "${o.text}"`).toBe(false);
  }
  return labels;
};

test('labels change with the zoom level and never cover each other or the interface', async ({ page }) => {
  await ready(page, '/constelacion');
  await page.waitForTimeout(2200);
  const far = await checkLabels(page);
  expect(far.length).toBeGreaterThanOrEqual(4);
  expect(far.every((l) => l.kind === 'theme')).toBe(true);

  await api(page, (c) => c.zoom(100));
  await expect.poll(async () => (await api(page, (c) => c.labels())).some((l) => l.kind === 'book')).toBe(true);
  await checkLabels(page);

  await api(page, (c) => c.select('patron-oro'));
  await expect(page.locator('#panel h2')).toHaveText('Patrón oro');
  await page.waitForTimeout(1500);
  const near = await checkLabels(page);
  expect(near.some((l) => l.kind === 'focus' && l.text === 'Patrón oro')).toBe(true);
  expect(near.some((l) => l.kind === 'theme')).toBe(false);
});

test('the whole sky fits the first view, also on a phone', async ({ page, request }) => {
  const meta = await (await request.get('/data/graph.json')).json();
  await ready(page, '/constelacion');
  await page.waitForTimeout(500);
  expect(await api(page, (c) => c.onScreen())).toBeGreaterThan(meta.nodes * 0.97);
});
