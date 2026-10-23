import { expect, test, type Page } from '@playwright/test';

// The island is drawn with WebGL; CI renders it in software (SwiftShader), so these tests use the
// light mode (?lite: little grass, no shadows) and drive it through window.__isla.

type Isla = {
  readyMs: number;
  fps: number;
  tier: string;
  night: number;
  here: string | null;
  mode: string;
  bull: { x: number; z: number; heading: number; speed: number; gait: Record<string, number> };
  prints: number;
  scared: number;
  stars: number;
  sound: boolean;
  flocks: { x: number; z: number }[];
  visit: string;
  pavilion: string;
  whale: { state: string; seen: number };
  bottle: { x: number; z: number } | null;
  demoPath: string | null;
  place(x: number, z: number, heading: number): void;
};
const isla = <T, A = unknown>(page: Page, fn: (i: Isla, a: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function('i', 'a', `return (${src})(i, a)`)((window as unknown as { __isla: Isla }).__isla, a), [fn.toString(), arg] as const) as Promise<T>;
const open = async (page: Page, url = '/?lite') => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await expect(page.locator('[data-island]')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  return errors;
};

test.describe.configure({ timeout: 120_000 });

test('the island opens on the home page, and is the whole site', async ({ page }, info) => {
  const errors = await open(page);
  info.annotations.push({ type: 'island ready (ms)', description: String(await isla(page, (i) => i.readyMs)) });
  await expect(page.locator('[data-hint]')).toBeVisible();
  // the visitor arrives at the jetty, at sunset, and is welcomed
  await expect(page.locator('[data-prompt-title]')).toHaveText('La isla de HSorollaP');
  expect(await isla(page, (i) => i.night)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  // the page of projects underneath is only for the version without 3D
  await expect(page.locator('#proyectos')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the skip menu goes to each place inside the island, never to another page', async ({ page }) => {
  await open(page);
  const skip = page.locator('.skip');
  await skip.locator('summary').click();
  // (the hrefs are for the version without 3D)
  for (const [name, href] of [['WarrenIA', '/warrenia'], ['La biblioteca (constelación)', '/constelacion'], ['En obras: próximamente', '#proyectos']]) {
    await expect(skip.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  // the building site: the bull is put at its door
  await skip.getByRole('link', { name: 'En obras: próximamente', exact: true }).click();
  await expect(page).toHaveURL(/\/\?lite$/);
  await expect.poll(() => isla(page, (i) => i.here)).toBe('taller');
  await skip.locator('summary').click();
  await skip.getByRole('link', { name: 'WarrenIA', exact: true }).click();
  await expect.poll(() => isla(page, (i) => i.pavilion), { timeout: 60_000 }).toBe('open');
  await expect(page).toHaveURL(/\/\?lite#warrenia$/);
});

test('the bull walks with the keyboard, gallops with Shift and leaves hoofprints', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'keyboard');
  await open(page);
  await isla(page, (i) => i.place(-6, 0, Math.PI));
  await page.locator('canvas.island-canvas').click();
  await page.keyboard.down('w');
  await expect.poll(() => isla(page, (i) => i.bull.gait.walk), { timeout: 30_000 }).toBeGreaterThan(0.9);
  await page.keyboard.down('Shift');
  await expect.poll(() => isla(page, (i) => i.bull.gait.gallop), { timeout: 60_000 }).toBeGreaterThan(0.9);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  expect(await isla(page, (i) => i.bull.z)).toBeLessThan(-1);
  expect(await isla(page, (i) => i.prints)).toBeGreaterThan(4);
});

test('a finger on the island brings up a joystick that moves the bull', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch');
  await open(page);
  const z0 = await isla(page, (i) => i.bull.z);
  const box = (await page.locator('canvas.island-canvas').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height * 0.7;
  await page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas.island-canvas')!;
    const ev = (t: string, yy: number) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: yy, bubbles: true }));
    ev('pointerdown', y); ev('pointermove', y - 45);
  }, [x, y]);
  await expect(page.locator('[data-joystick]')).toBeVisible();
  await expect.poll(() => isla(page, (i) => i.bull.z), { timeout: 30_000 }).toBeLessThan(z0 - 1);
});

test('WarrenIA opens on the screen of the pavilion, and the bull waits outside', async ({ page }, info) => {
  const errors = await open(page);
  await isla(page, (i) => i.place(-24, 7.5, -Math.PI / 2));
  await expect(page.locator('[data-prompt-title]')).toHaveText('Pabellón WarrenIA');
  if (info.project.name === 'phone') await page.locator('[data-prompt-go]').click();
  else { await page.locator('canvas.island-canvas').click(); await page.keyboard.press('e'); }
  await expect.poll(() => isla(page, (i) => i.pavilion), { timeout: 60_000 }).toBe('open');
  const demo = page.locator('[data-warrenia]');
  await expect(demo).toBeVisible();
  await expect(page).toHaveURL(/#warrenia$/);
  const app = page.frameLocator('[data-warrenia] iframe');
  await expect(app.getByRole('navigation', { name: 'Main' }).first()).toBeAttached();
  // on a desktop the panel lies over the screen in the pavilion; on a phone it fills the screen
  // (once its 0.45 s zoom-in has finished)
  const island = (await page.locator('[data-island]').boundingBox())!;
  const width = async () => (await demo.boundingBox())!.width;
  if (info.project.name === 'phone') await expect.poll(width, { timeout: 10_000 }).toBeGreaterThanOrEqual(island.width - 1);
  else {
    await expect.poll(width, { timeout: 10_000 }).toBeGreaterThan(island.width * 0.6);
    expect(await width()).toBeLessThan(island.width);
  }
  // it opens on the radar, as on the wall; the app's own navigation is mirrored in the island's address
  await expect(app.locator('a[href^="#/research/"]').first()).toBeVisible({ timeout: 20_000 });
  await app.getByRole('link', { name: 'Plan' }).last().click();
  await expect(page).toHaveURL(/#warrenia\/plan$/);
  // the browser's Back goes back inside the app first (Plan → Radar), then leaves the pavilion,
  // and the bull is still at its door
  await page.goBack();
  await expect(page).toHaveURL(/#warrenia$/);
  expect(await isla(page, (i) => i.pavilion)).toBe('open');
  await page.goBack();
  await expect.poll(() => isla(page, (i) => i.pavilion), { timeout: 60_000 }).toBe('island');
  await expect(page).toHaveURL(/\/\?lite$/);
  await expect(page.locator('[data-prompt-title]')).toHaveText('Pabellón WarrenIA');
  expect(errors).toEqual([]);
});

test('a link to #warrenia/<route> opens that screen of the app in the pavilion', async ({ page }) => {
  // (#warrenia/cartera is the old demo's address for the portfolio: it still works)
  await open(page, '/?lite#warrenia/cartera');
  await expect.poll(() => isla(page, (i) => i.pavilion), { timeout: 60_000 }).toBe('open');
  await expect.poll(() => isla(page, (i) => i.demoPath)).toBe('/portfolio');
  await expect(page.frameLocator('[data-warrenia] iframe').getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
  await page.locator('[data-warrenia]').getByRole('button', { name: '← Volver al toro' }).click();
  await expect.poll(() => isla(page, (i) => i.pavilion), { timeout: 60_000 }).toBe('island');
  await expect(page).toHaveURL(/\/\?lite$/);
});

test('from the observatory the visitor rises into the constellation, and comes back down', async ({ page, request }, info) => {
  const meta = await (await request.get('/data/graph.json')).json();
  const errors = await open(page);
  await isla(page, (i) => i.place(0, -30, Math.PI));
  await expect(page.locator('[data-prompt-title]')).toHaveText('Observatorio · La biblioteca');
  await page.locator('[data-prompt-go]').click();
  await expect(page).toHaveURL(/#observatorio$/);
  await expect.poll(() => isla(page, (i) => i.visit), { timeout: 90_000 }).toBe('sky');
  await expect(page.locator('[data-constellation]')).toBeVisible();
  // the whole network is lit on arrival, with nothing chosen and no names on the sky
  type Sky = { __constellation: { visibleStars(): number; labels(): unknown[] } };
  await expect.poll(() => page.evaluate(() => (window as unknown as Sky).__constellation.visibleStars())).toBe(meta.nodes);
  expect(await page.evaluate(() => (window as unknown as Sky).__constellation.labels().length)).toBe(0);
  await page.locator('[data-constellation]').getByRole('button', { name: /Volver al toro/ }).click();
  await expect.poll(() => isla(page, (i) => i.visit), { timeout: 90_000 }).toBe('island');
  await expect(page).toHaveURL(/\/\?lite$/);
  info.annotations.push({ type: 'visit', description: 'up and down' });
  expect(errors).toEqual([]);
});

test('the observatory stands at night, under the stars of the library', async ({ page, request }) => {
  const meta = await (await request.get('/data/graph.json')).json();
  await open(page);
  await isla(page, (i) => i.place(0, -30, Math.PI));
  await expect.poll(() => isla(page, (i) => i.night), { timeout: 30_000 }).toBeGreaterThan(0.9);
  await expect.poll(() => isla(page, (i) => i.stars), { timeout: 30_000 }).toBe(meta.nodes);
  await expect(page.locator('[data-prompt-title]')).toHaveText('Observatorio · La biblioteca');
  await expect(page.locator('[data-prompt-go]')).toHaveAttribute('href', '/constelacion');
});

test('the map is only a map: it shows the island and sends the bull nowhere', async ({ page }) => {
  await open(page);
  await isla(page, (i) => i.place(-4, 14, 0));
  await page.locator('[data-map-open]').click();
  const map = page.locator('dialog[data-map]');
  await expect(map).toBeVisible();
  await expect(map.getByRole('img', { name: /Mapa de la isla/ })).toBeVisible();
  await expect(map.getByRole('button')).toHaveCount(1); // (only "Cerrar el mapa")
  // drawn at the screen's resolution, not stretched
  const { w, css } = await map.locator('canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, css: c.clientWidth }));
  expect(w).toBeGreaterThanOrEqual(Math.round(css));
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();
  expect(await isla(page, (i) => Math.hypot(i.bull.x + 4, i.bull.z - 14))).toBeLessThan(0.5);
});

test('the building site promises the next project and gives nothing away', async ({ page }) => {
  await open(page);
  await isla(page, (i) => i.place(24.5, 11, Math.PI / 2));
  await expect(page.locator('[data-prompt-title]')).toHaveText('En obras · Próximamente');
  await expect(page.locator('[data-prompt-go]')).toBeHidden();
});

test('birds take off when the bull comes close', async ({ page }) => {
  await open(page);
  // a flock pecking away from the bull (one near the jetty may already have flown off)
  const m = (await isla(page, (i) => i.flocks.filter((f) => Math.hypot(f.x - i.bull.x, f.z - i.bull.z) > 15)))[0];
  const before = await isla(page, (i) => i.scared);
  await isla(page, (i, a) => i.place(a.x, a.z + 6, Math.PI), m);
  await expect.poll(() => isla(page, (i) => i.scared), { timeout: 30_000 }).toBeGreaterThan(before);
});

test('sound stays off until the visitor turns it on', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioContexts: number; AudioContext: typeof AudioContext };
    w.__audioContexts = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real { constructor(o?: AudioContextOptions) { super(o); w.__audioContexts++; } };
  });
  await open(page);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(0);
  await page.locator('[data-sound]').click();
  await expect(page.locator('[data-sound]')).toHaveAttribute('aria-pressed', 'true');
  expect(await isla(page, (i) => i.sound)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(1);
});

test('with reduced motion the island waits to be asked', async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('/?lite');
  await expect(page.locator('[data-island]')).toHaveAttribute('data-state', 'calm');
  await expect(page.getByRole('link', { name: 'Ver los proyectos' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar en la isla igualmente' }).click();
  await expect(page.locator('[data-island]')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await page.close();
});

test('without WebGL the projects are still one click away', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });
  await page.goto('/');
  await expect(page.locator('[data-island]')).toHaveAttribute('data-state', 'nogl');
  await expect(page.getByText('Tu navegador no puede mostrar la isla en 3D.')).toBeVisible();
  await page.getByRole('link', { name: 'Ver los proyectos' }).click();
  await expect(page.getByRole('heading', { name: 'WarrenIA' })).toBeInViewport();
});

// The secrets: nothing on screen announces them.
test('a whale surfaces for whoever stands still at the end of the jetty, looking out to sea', async ({ page }) => {
  const errors = await open(page);
  expect(await isla(page, (i) => i.whale.seen)).toBe(0);
  await isla(page, (i) => i.place(0, 73, 0));
  await expect.poll(() => isla(page, (i) => i.whale.seen), { timeout: 90_000 }).toBe(1);
  expect(await isla(page, (i) => i.whale.state)).toBe('surfacing');
  expect(errors).toEqual([]);
});

test('a bottle on the beach holds an idea from the library, and leads up to it in the sky', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('[data-bottle]')).toBeHidden();
  const at = (await isla(page, (i) => i.bottle))!;
  expect(at).not.toBeNull();
  await isla(page, (i, a) => i.place(a.x, a.z, 0), at);
  const note = page.locator('[data-bottle]');
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note.getByRole('heading', { level: 2 })).not.toBeEmpty();
  const go = note.getByRole('link', { name: 'Verla en el cielo' });
  const slug = (await go.getAttribute('href'))!.split('#')[1];
  expect(slug.length).toBeGreaterThan(0);
  // the bottle is gone (another washes up later, elsewhere)
  expect(await isla(page, (i) => i.bottle)).toBeNull();
  await go.click();
  await expect(note).toBeHidden();
  await expect.poll(() => isla(page, (i) => i.visit), { timeout: 90_000 }).toBe('sky');
  expect(errors).toEqual([]);
});
