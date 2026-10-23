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
  await expect(page.locator('[data-constellation]')).toHaveAttribute('data-state', 'ready', { timeout: 40_000 });
};
const focusOf = (page: Page) => page.evaluate(() => (window as unknown as { __constellation: Api }).__constellation.focus());

test('every note becomes a star', async ({ page, request }) => {
  const meta = await (await request.get('/data/graph.json')).json();
  await ready(page, '/constelacion');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __constellation: Api }).__constellation.visibleStars()), { timeout: 15_000 }).toBe(meta.nodes);
  // the panel lists the themes: there is no second legend over the sky
  await expect(page.locator('#legend')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Recorrer el libro' }).click();
  await expect(page.locator('#panel .tour span')).toContainText('1 de 10');
  const first = await focusOf(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel .tour span')).toContainText('2 de 10');
  expect(await focusOf(page)).not.toBe(first);
});

test('clicking a star on the canvas selects it', async ({ page }) => {
  await ready(page, '/constelacion#daniel-yergin-the-prize');
  await expect(page.locator('#panel h2')).toHaveText('The Prize');
  await page.waitForTimeout(1500); // let the camera finish its flight
  const target = await page.evaluate(() => {
    const c = (window as unknown as { __constellation: Api }).__constellation;
    const panel = document.querySelector('#sidebar')!.getBoundingClientRect();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#panel .links a')) {
      const slug = a.getAttribute('href')!.split('/').pop()!;
      const s = c.starScreen(slug);
      // Desktop: the panel is on the left. Phone: it is a sheet along the bottom.
      const sheet = panel.width > innerWidth * 0.8;
      const free = sheet ? s.x > 30 && s.x < innerWidth - 30 && s.y > 150 && s.y < panel.top - 30 : s.x > panel.right + 40 && s.y > 90 && s.x < innerWidth - 90 && s.y < innerHeight - 90;
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
    sheetTop: document.querySelector('#sidebar')!.getBoundingClientRect().top,
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
    ['#sidebar', '.zoom']
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

test('the sky names nothing until a star is chosen, and its labels never cover each other or the interface', async ({ page }) => {
  await ready(page, '/constelacion');
  await page.waitForTimeout(2200);
  expect(await checkLabels(page)).toEqual([]);

  // closer in, still no names
  await api(page, (c) => c.zoom(100));
  await page.waitForTimeout(1500);
  expect(await checkLabels(page)).toEqual([]);

  await api(page, (c) => c.select('patron-oro'));
  await expect(page.locator('#panel h2')).toHaveText('Patrón oro');
  // (once the camera has flown to it)
  await expect.poll(async () => (await api(page, (c) => c.labels())).some((l) => l.kind === 'focus' && l.text === 'Patrón oro'), { timeout: 15_000 }).toBe(true);
  const near = await checkLabels(page);
  expect(near.some((l) => l.kind === 'near')).toBe(true);

  // and none again once it is let go
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await api(page, (c) => c.labels())).length).toBe(0);
});

test('the whole sky fits the first view, also on a phone', async ({ page, request }) => {
  const meta = await (await request.get('/data/graph.json')).json();
  await ready(page, '/constelacion');
  await page.waitForTimeout(500);
  expect(await api(page, (c) => c.onScreen())).toBeGreaterThan(meta.nodes * 0.97);
});

test('the panel shows the library by theme, book and route, and folds away', async ({ page, isMobile }) => {
  await ready(page, '/constelacion');
  await expect(page.locator('#home h1')).toHaveText('Biblioteca');
  await expect(page.locator('[data-go-theme]')).toHaveCount(6);
  await page.getByRole('tab', { name: 'Libros' }).click();
  await expect(page.locator('#pane-libros .row')).toHaveCount(48);
  await page.locator('#pane-libros .row', { hasText: 'The Prize' }).click();
  await expect(page.locator('#panel h2')).toHaveText('The Prize');
  await expect(page.locator('#panel .byline')).toHaveText('Daniel Yergin · 1991');
  await expect(page.locator('#panel .stats div')).toHaveCount(3);
  expect(await focusOf(page)).toBe('daniel-yergin-the-prize');
  await page.getByRole('button', { name: 'Biblioteca' }).click();
  await expect(page.locator('#panel')).toBeHidden();
  // every suggested route is shown (each step shares ideas with the next) and can be followed
  await page.getByRole('tab', { name: 'Recorridos' }).click();
  await expect(page.locator('#pane-recorridos [data-route]:visible')).toHaveCount(3);
  await page.locator('[data-route="0"]').click();
  await expect(page.locator('#panel .tour span')).toContainText('1 de 3');
  await page.keyboard.press('Escape');
  // fold the panel away: the whole sky, with the search still at hand
  await page.locator('[data-action="toggle-panel"]:visible').first().click();
  await expect(page.locator('[data-constellation]')).toHaveAttribute('data-panel', 'collapsed');
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#search')).toBeVisible();
  if (!isMobile) await expect(page.locator('.zoom')).toBeVisible();
});
