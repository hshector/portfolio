// The island, put together: renderer, world, bull, camera, day-to-night, places, map, sound,
// quality and the test API (window.__isla).
//
// Renderer: the classic WebGLRenderer. The prototype measured 60 fps on the owner's laptop and phone
// (21 Oct 2026), and WebGPURenderer's WebGL 2 fallback was 15–60× slower in our tests for the
// constellation (docs/CONSTELLATION.md), so there is nothing to gain from it here.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import toroUrl from '../assets/island/toro.glb?url';
import { IslandAudio } from './audio';
import { createBirds } from './birds';
import { Bull, SPEED } from './bull';
import { createAmbient, createDust, createPrints } from './effects';
import { createInput } from './input';
import { blend, createLightUniforms, nightAt } from './palette';
import { createShared } from './shaders';
import { createLibrarySky } from './stars';
import { createVisit } from './observatory';
import { createPavilion } from './pavilion';
import { appPath, START } from './warrenia';
import {
  DOORS, JETTY, PATHS, SITES, groundAt, height, surfaceAt, walkable, type SiteId,
} from './terrain';
import { MAP_SPAN, buildWorld, type Quality } from './world';

type Tier = 'alta' | 'media' | 'baja';
const TIERS: Record<Tier, Quality & { dpr: number }> = {
  alta: { grass: 70000, terrainRes: 220, shadows: true, shadowMap: 2048, dpr: 2 },
  media: { grass: 32000, terrainRes: 180, shadows: true, shadowMap: 1024, dpr: 1.5 },
  baja: { grass: 12000, terrainRes: 140, shadows: false, shadowMap: 512, dpr: 1 },
};
const ORDER: Tier[] = ['alta', 'media', 'baja'];

export interface PlaceInfo {
  title: string;
  text: string;
  action: string;
  href?: string;
}

export interface IslandOptions {
  root: HTMLElement;
  places: Record<SiteId, PlaceInfo>;
}

export async function startIsland({ root, places }: IslandOptions) {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const canvas = $<HTMLCanvasElement>('canvas.island-canvas');
  const params = new URLSearchParams(location.search);
  const lite = params.has('lite');
  const small = Math.min(innerWidth, innerHeight) < 700 || matchMedia('(pointer: coarse)').matches;
  let tier: Tier = (params.get('calidad') as Tier) in TIERS ? (params.get('calidad') as Tier) : small ? 'media' : 'alta';
  if (lite) tier = 'baja';
  const quality = { ...TIERS[tier], grass: lite ? 6000 : TIERS[tier].grass, terrainRes: lite ? 120 : TIERS[tier].terrainRes };

  const t0 = performance.now();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.dpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2500);
  const shared = createShared();
  const light = createLightUniforms();

  // the bull's model downloads while the island is built
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const bullAsset = loader.loadAsync(toroUrl);
  await document.fonts.load('700 44px "Bricolage Grotesque Variable"').catch(() => undefined);
  const world = buildWorld(shared, light, quality);
  const scene = world.scene;
  const bull = new Bull(await bullAsset);
  scene.add(bull.group);
  const prints = createPrints(shared, light);
  const dust = createDust(shared);
  const ambient = createAmbient(shared);
  const birds = createBirds(shared, light);
  scene.add(prints.mesh, dust.points, ambient.group, birds.group);
  const audio = new IslandAudio();

  // ---------------------------------------------------------------- state
  const start = { x: 0, z: 41, heading: Math.PI };
  const me = { ...start, speed: 0, turnRate: 0 };
  let mode: 'follow' | 'aerial' = 'follow';
  let night = 0, here: SiteId | null = null, moved = false, stars: Awaited<ReturnType<typeof createLibrarySky>> | null = null;
  let starsPromise: ReturnType<typeof createLibrarySky> | null = null;
  const obstacleGrid = new Map<string, { x: number; z: number; r: number }[]>();
  for (const ob of world.obstacles) {
    const key = `${Math.floor(ob.x / 8)},${Math.floor(ob.z / 8)}`;
    (obstacleGrid.get(key) ?? obstacleGrid.set(key, []).get(key)!).push(ob);
  }
  const free = (x: number, z: number) => {
    if (!walkable(x, z)) return false;
    const gx = Math.floor(x / 8), gz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const ob of obstacleGrid.get(`${gx + i},${gz + j}`) ?? []) if (Math.hypot(x - ob.x, z - ob.z) < ob.r + 0.9) return false;
    return true;
  };

  // ---------------------------------------------------------------- HUD
  const ui = {
    hint: $('[data-hint]'), prompt: $('[data-prompt]'), promptTitle: $('[data-prompt-title]'), promptText: $('[data-prompt-text]'),
    promptGo: $<HTMLAnchorElement>('[data-prompt-go]'), sound: $<HTMLButtonElement>('[data-sound]'), view: $<HTMLButtonElement>('[data-view]'),
    mapBtn: $<HTMLButtonElement>('[data-map-open]'), map: $<HTMLDialogElement>('dialog[data-map]'), mapCanvas: $<HTMLCanvasElement>('[data-map-canvas]'),
    joystick: $('[data-joystick]'), debug: $('[data-debug]'),
  };
  // (the terrain picture is computed the first time the map opens)
  let mapImage: HTMLCanvasElement | null = null;

  /** Nothing is going on: no trip up the observatory or into the pavilion. */
  const idle = () => visit.state === 'island' && pav.state === 'island';
  function act() {
    if (!here || !idle()) return;
    if (here === 'muelle') openMap();
    else if (here === 'observatorio') goUp();
    else if (here === 'warrenia') enterPavilion();
    // (the building site has nothing to enter yet)
  }
  function openMap() {
    if (ui.map.open) { ui.map.close(); return; }
    ui.map.showModal();
    drawMap();
  }
  function setView(m: 'follow' | 'aerial') {
    mode = m;
    ui.view.setAttribute('aria-pressed', String(m === 'aerial'));
    ui.view.setAttribute('aria-label', m === 'aerial' ? 'Volver al toro' : 'Vista satélite');
    ui.view.title = ui.view.getAttribute('aria-label')!;
  }
  const input = createInput(canvas, ui.joystick, { onAction: act, onMap: openMap, onView: () => setView(mode === 'aerial' ? 'follow' : 'aerial') });
  ui.view.addEventListener('click', () => setView(mode === 'aerial' ? 'follow' : 'aerial'));
  ui.mapBtn.addEventListener('click', openMap);
  ui.sound.addEventListener('click', async () => {
    if (audio.on) audio.disable(); else await audio.enable();
    ui.sound.setAttribute('aria-pressed', String(audio.on));
    ui.sound.setAttribute('aria-label', audio.on ? 'Silenciar' : 'Activar el sonido');
    ui.sound.title = ui.sound.getAttribute('aria-label')!;
  });
  ui.promptGo.addEventListener('click', (e) => { e.preventDefault(); act(); });
  // every link to a place (the "Saltar a…" menu) goes there in the island;
  // their hrefs are for the version without 3D
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-island-go]');
    if (!a) return;
    e.preventDefault();
    a.closest('details')?.removeAttribute('open');
    if (ui.map.open) ui.map.close();
    const where = a.dataset.islandGo;
    if (where === 'warrenia') enterPavilion();
    else if (where === 'observatorio') goUp();
    else if (where === 'obra') goToDoor('taller');
  });
  // the map is only a map: a click on the backdrop closes it
  ui.map.addEventListener('click', (e) => { if (e.target === ui.map) ui.map.close(); });

  /** The bull straight to a place's door, facing the place. */
  function goToDoor(id: SiteId) {
    const d = DOORS[id], s = SITES[id];
    placeBull(d.x, d.z, Math.atan2(s.x - d.x, s.z - d.z));
    setView('follow');
  }

  /** The map: the island from above at the screen's own resolution, the paths, each place with its
   *  name on a pill, and the bull as an arrow ("Tú"). North up. */
  function drawMap() {
    const c = ui.mapCanvas, x = c.getContext('2d')!;
    const px = Math.round(c.clientWidth * Math.min(devicePixelRatio || 1, 3)) || 440;
    if (c.width !== px) c.width = c.height = px;
    const n = px;
    mapImage ??= world.mapImage();
    x.imageSmoothingQuality = 'high';
    x.drawImage(mapImage, 0, 0, n, n);
    const toMap = (wx: number, wz: number) => [((wx / MAP_SPAN) + 0.5) * n, ((wz / MAP_SPAN) + 0.5) * n] as const;
    x.lineCap = 'round'; x.lineJoin = 'round';
    // the paths: a light line with a dark edge
    for (const [w, color] of [[n * 0.016, 'rgba(40,24,10,0.55)'], [n * 0.008, '#f6e2b6']] as const) {
      x.lineWidth = w; x.strokeStyle = color;
      for (const path of PATHS) {
        x.beginPath();
        path.forEach(([wx, wz], k) => { const [mx, mz] = toMap(wx, wz); if (k) x.lineTo(mx, mz); else x.moveTo(mx, mz); });
        x.stroke();
      }
    }
    // the jetty
    const [j0x, j0z] = toMap(JETTY.x - JETTY.halfWidth, JETTY.z0), [j1x, j1z] = toMap(JETTY.x + JETTY.halfWidth, JETTY.z1);
    x.fillStyle = '#8a6440'; x.fillRect(j0x, j0z, j1x - j0x, j1z - j0z);
    // the places: a pin, and the name on a pill on the far side from the island's centre
    const fs = Math.round(n * 0.042);
    x.font = `650 ${fs}px "Hanken Grotesk Variable", system-ui, sans-serif`;
    x.textBaseline = 'middle';
    for (const site of Object.values(SITES)) {
      const [mx, mz] = toMap(site.x, site.z);
      x.fillStyle = '#ff8a70'; x.strokeStyle = '#fff'; x.lineWidth = n * 0.006;
      x.beginPath(); x.arc(mx, mz, n * 0.02, 0, Math.PI * 2); x.fill(); x.stroke();
      const label = site.label, tw = x.measureText(label).width, ph = fs * 1.55, pw = tw + fs * 1.1;
      const vertical = Math.abs(site.z) > Math.abs(site.x);
      let lx = mx - pw / 2, ly = mz - ph / 2;
      if (vertical) ly += (site.z < 0 ? -1 : 1) * (ph / 2 + n * 0.035);
      else lx += (site.x < 0 ? -1 : 1) * (pw / 2 + n * 0.035);
      lx = Math.max(n * 0.02, Math.min(n * 0.98 - pw, lx));
      ly = Math.max(n * 0.02, Math.min(n * 0.98 - ph, ly));
      x.fillStyle = 'rgba(10,12,24,0.86)';
      x.beginPath(); x.roundRect(lx, ly, pw, ph, ph / 2); x.fill();
      x.fillStyle = '#fff'; x.textAlign = 'center';
      x.fillText(label, lx + pw / 2, ly + ph / 2 + fs * 0.04);
    }
    // north
    x.fillStyle = 'rgba(10,12,24,0.86)'; x.beginPath(); x.arc(n * 0.93, n * 0.07, n * 0.04, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText('N', n * 0.93, n * 0.07 + fs * 0.04);
    // the bull: an arrow pointing where it's heading
    const [bx, bz] = toMap(me.x, me.z);
    x.save(); x.translate(bx, bz); x.rotate(-me.heading + Math.PI);
    x.fillStyle = '#05060d'; x.strokeStyle = '#fff'; x.lineWidth = n * 0.006;
    x.beginPath(); x.moveTo(0, -n * 0.045); x.lineTo(n * 0.03, n * 0.03); x.lineTo(0, n * 0.014); x.lineTo(-n * 0.03, n * 0.03); x.closePath(); x.fill(); x.stroke();
    x.restore();
    x.font = `800 ${Math.round(fs * 0.9)}px "Hanken Grotesk Variable", system-ui, sans-serif`;
    x.lineWidth = n * 0.008; x.strokeStyle = 'rgba(5,6,13,0.85)'; x.fillStyle = '#fff'; x.textAlign = 'left';
    x.strokeText('Tú', bx + n * 0.04, bz); x.fillText('Tú', bx + n * 0.04, bz);
    if (ui.map.open) requestAnimationFrame(drawMap);
  }

  // ---------------------------------------------------------------- resize
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    shared.pixelScale.value = (h / 700) * renderer.getPixelRatio();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---------------------------------------------------------------- the bull's movement
  const lookTarget = new THREE.Vector3();
  function moveBull(dt: number, now: number) {
    const st = input.poll();
    if (input.active() && !moved) { moved = true; ui.hint.dataset.done = ''; }
    const forward = st.forward, turn = st.turn, run = st.run;
    const top = SPEED.walk + (SPEED.gallop - SPEED.walk) * run;
    const target = forward > 0 ? forward * top : forward * SPEED.walk * 0.6;
    me.speed += (target - me.speed) * Math.min(1, dt * (target > me.speed ? 1.6 : 3));
    me.turnRate += (turn * 1.8 * (0.4 + Math.min(1, Math.abs(me.speed) / 2.5)) - me.turnRate) * Math.min(1, dt * 6);
    me.heading += me.turnRate * dt;
    const nx = me.x + Math.sin(me.heading) * me.speed * dt, nz = me.z + Math.cos(me.heading) * me.speed * dt;
    // slide along obstacles instead of stopping dead
    if (free(nx, nz)) { me.x = nx; me.z = nz; }
    else if (free(nx, me.z)) me.x = nx;
    else if (free(me.x, nz)) me.z = nz;
    else me.speed *= 0.4;

    const y = groundAt(me.x, me.z);
    const ahead = groundAt(me.x + Math.sin(me.heading) * 1.4, me.z + Math.cos(me.heading) * 1.4), behind = groundAt(me.x - Math.sin(me.heading) * 1.4, me.z - Math.cos(me.heading) * 1.4);
    bull.group.position.set(me.x, y, me.z);
    bull.group.rotation.set(0, me.heading, 0);
    // a gentle lean with the slope; the legs reach the ground themselves
    bull.group.rotateX(-0.5 * Math.atan2(ahead - behind, 2.8));
    // glance at a place within 22 m when walking slowly or standing
    let near: SiteId | null = null, best = 22;
    for (const s of Object.values(SITES)) { const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < best) { best = d; near = s.id; } }
    if (near) lookTarget.set(SITES[near].x, 0, SITES[near].z);
    bull.update(dt, now, me.speed, me.turnRate, near && Math.abs(me.speed) < 1.5 ? lookTarget : null, groundAt, (p) => {
      const surface = surfaceAt(p.x, p.z), gy = groundAt(p.x, p.z);
      if (surface !== 'wood' && gy > world.seaLevel) prints.stamp(p.x, gy, p.z, me.heading, now);
      if (surface !== 'wood' && surface !== 'stone') dust.puff(p.x, gy, p.z, now, (surface === 'grass' ? 0.6 : 1.2) * (1 + Math.min(3, p.speed / 2.5)));
      audio.hoof(surface, Math.min(1, p.speed / SPEED.gallop), p.leg % 2 ? 0.15 : -0.15);
    });
    shared.bull.value.set(me.x, y, me.z);
  }

  // ---------------------------------------------------------------- camera
  const camPos = new THREE.Vector3(me.x + 30, 40, me.z + 60), camLook = new THREE.Vector3(me.x, 2, me.z);
  const want = new THREE.Vector3(), look = new THREE.Vector3();
  function cameraTarget(now: number) {
    if (mode === 'aerial') {
      const a = now * 0.05;
      want.set(Math.sin(a) * 135, 72, Math.cos(a) * 135);
      look.set(0, 2, 0);
      return;
    }
    const by = groundAt(me.x, me.z);
    // pull back a little at speed
    const back = 10 + Math.min(4, Math.abs(me.speed) * 0.5);
    want.set(me.x - Math.sin(me.heading) * back, by + 6, me.z - Math.cos(me.heading) * back);
    look.set(me.x, by + 1.4, me.z);
    // never under the ground, and never with a hill between the camera and the bull
    want.y = Math.max(want.y, height(want.x, want.z) + 2);
    for (let i = 1; i < 10; i++) {
      const t = i / 10, x = look.x + (want.x - look.x) * t, z = look.z + (want.z - look.z) * t;
      const need = height(x, z) + 0.8, lineY = look.y + (want.y - look.y) * t;
      if (lineY < need) want.y = look.y + (need - look.y) / t;
    }
  }
  function moveCamera(dt: number, now: number) {
    cameraTarget(now);
    const k = 1 - Math.exp(-dt * (mode === 'aerial' ? 0.8 : 3));
    camPos.lerp(want, k); camLook.lerp(look, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    shared.cam.value.copy(camera.position);
    shared.focus.value.set(me.x, groundAt(me.x, me.z) + 1.1, me.z);
  }

  // ---------------------------------------------------------------- day → night
  function updateLight(dt: number, forceNight = false) {
    const target = forceNight ? 1 : nightAt(me.x, me.z);
    night += (target - night) * Math.min(1, dt * 1.5);
    const v = blend(light, night);
    world.sun.color.copy(light.sunColor.value);
    world.sun.intensity = v.sunIntensity;
    world.sun.target.position.set(me.x, 0, me.z);
    world.sun.position.copy(light.sunDir.value).multiplyScalar(120).add(world.sun.target.position);
    world.hemi.color.copy(v.hemiSky); world.hemi.groundColor.copy(v.hemiGround); world.hemi.intensity = v.hemiIntensity;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(light.fog.value); fog.density = light.fogDensity.value;
    renderer.toneMappingExposure = v.exposure;
    for (const c of world.clouds) (c.material as THREE.SpriteMaterial).color.copy(v.cloud);
    ambient.setNight(night);
    bull.setNight(night);
    if (night > 0.02) loadStars().catch(() => undefined);
  }
  function loadStars() {
    starsPromise ??= createLibrarySky(shared, light.night).then((s) => { scene.add(s.points); stars = s; return s; });
    starsPromise.catch(() => (starsPromise = null));
    return starsPromise;
  }

  /** Where the follow camera would be now (to come back to after a visit). */
  function visitFollowPose() {
    const saved = mode; mode = 'follow'; cameraTarget(shared.time.value); mode = saved;
    camPos.copy(want); camLook.copy(look);
    return { position: want.clone(), look: look.clone() };
  }

  // ---------------------------------------------------------------- the observatory: up into the constellation
  let skyPromise: Promise<import('../constellation/app').MountedSky> | null = null;
  const skyRoot = root.querySelector<HTMLElement>('[data-constellation]')!;
  function loadSky() {
    skyPromise ??= import('../constellation/app').then((m) => m.mountConstellation(skyRoot, canvas, renderer));
    return skyPromise;
  }
  const visit = createVisit({
    camera,
    stars: loadStars,
    sky: loadSky,
    followPose: () => visitFollowPose(),
    onState(st) {
      root.dataset.visit = st;
      input.setEnabled(st === 'island');
      if (st === 'island') { canvas.focus({ preventScroll: true }); updatePlace(true); }
      else ui.prompt.hidden = true;
    },
  });
  /** Up the observatory (from the door, or from a link to #observatorio[/note]). */
  function goUp(slug?: string, instant = false) {
    if (!idle()) return;
    if (!instant) history.pushState(null, '', '#observatorio');
    const d = DOORS.observatorio;
    if (instant || Math.hypot(me.x - d.x, me.z - d.z) > 6) placeBull(d.x, d.z, Math.PI);
    visit.go(slug, instant);
  }
  function goDown() {
    if (visit.state !== 'sky') return;
    visit.back(); // (closes the note first, which rewrites the hash)
    if (location.hash.startsWith('#observatorio')) history.pushState(null, '', location.pathname + location.search);
  }
  skyRoot.querySelector('[data-sky-exit]')!.addEventListener('click', goDown);

  // ---------------------------------------------------------------- the pavilion: into WarrenIA
  const demoHost = root.querySelector<HTMLElement>('[data-warrenia]')!;
  let screenDrawn = false;
  function drawScreen() {
    if (screenDrawn) return;
    screenDrawn = true;
    import('./warrenia-screen').then((m) => m.drawScreen(world.screen.canvas)).then(() => world.screen.update()).catch(() => (screenDrawn = false));
  }
  let demoPromise: Promise<import('./warrenia').Demo> | null = null;
  const pav = createPavilion({
    camera, canvas, host: demoHost, screen: world.screen,
    demo: () => (demoPromise ??= import('./warrenia').then((m) => m.mountDemo(demoHost, {
      onClose: leavePavilion,
      onRoute: (p) => { if (location.hash.startsWith('#warrenia')) history.replaceState(null, '', p === START ? '#warrenia' : `#warrenia${p}`); },
    }))),
    followPose: () => visitFollowPose(),
    onState(st) {
      root.dataset.visit = st === 'island' ? 'island' : `pabellon-${st}`;
      world.setDoors(st !== 'island');
      input.setEnabled(st === 'island');
      if (st === 'island') { canvas.focus({ preventScroll: true }); updatePlace(true); }
      else ui.prompt.hidden = true;
    },
  });
  /** Into the pavilion (from its door, the menu, or a link to #warrenia[/tab]). */
  function enterPavilion(path?: string, instant = false) {
    if (!idle()) return;
    if (!instant) history.pushState(null, '', '#warrenia');
    const d = DOORS.warrenia, w = SITES.warrenia;
    if (instant || Math.hypot(me.x - d.x, me.z - d.z) > 6) placeBull(d.x, d.z, Math.atan2(w.x - d.x, w.z - d.z));
    drawScreen();
    pav.go(path, instant);
  }
  function leavePavilion() {
    if (pav.state !== 'open') return;
    pav.back();
    if (location.hash.startsWith('#warrenia')) history.pushState(null, '', location.pathname + location.search);
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pav.state === 'open' && !(e.target as HTMLElement).closest?.('select')) leavePavilion(); });

  // ---------------------------------------------------------------- links straight to a place
  type Route = { to: 'sky'; slug?: string } | { to: 'warrenia'; path?: string } | null;
  const route = (): Route => {
    const sky = location.hash.match(/^#observatorio(?:\/(.+))?$/);
    if (sky) return { to: 'sky', slug: sky[1] ? decodeURIComponent(sky[1]) : undefined };
    const w = location.hash.match(/^#warrenia(\/.*)?$/);
    if (w) return { to: 'warrenia', path: appPath(w[1]) };
    return null;
  };
  addEventListener('popstate', () => {
    const r = route();
    if (r?.to !== 'sky' && visit.state === 'sky') visit.back();
    if (r?.to !== 'warrenia' && pav.state === 'open') { pav.back(); }
    if (r?.to === 'warrenia' && pav.state === 'open') pav.demo?.show(r.path ?? START);
    if (!r || !idle()) return;
    if (r.to === 'sky') goUp(r.slug, true);
    else if (r.to === 'warrenia') enterPavilion(r.path, true);
  });
  // start loading the sky's code once the night begins, so going up is instant
  let skyPreloaded = false;
  // ---------------------------------------------------------------- places
  function updatePlace(force = false) {
    if (!idle()) return;
    let found: SiteId | null = null;
    for (const id of Object.keys(DOORS) as SiteId[]) {
      const d = DOORS[id];
      if (Math.hypot(me.x - d.x, me.z - d.z) < (id === 'muelle' ? 7 : 4.5)) found = id;
    }
    if (found === here && !force) return;
    here = found;
    ui.prompt.hidden = !found;
    if (!found) return;
    const p = places[found];
    ui.promptTitle.textContent = p.title;
    ui.promptText.textContent = p.text;
    ui.promptGo.textContent = p.action;
    ui.promptGo.href = p.href ?? '#';
    ui.prompt.toggleAttribute('data-no-action', !p.action);
  }
  // the screen is drawn when the bull comes within 40 m of the pavilion
  const nearPavilion = () => Math.hypot(me.x - SITES.warrenia.x, me.z - SITES.warrenia.z) < 40;

  // ---------------------------------------------------------------- quality from measured fps
  let frames = 0, fpsT = performance.now(), fps = 0, slowWindows = 0;
  const born = performance.now();
  function stepDown() {
    const i = ORDER.indexOf(tier);
    if (i >= ORDER.length - 1) return;
    tier = ORDER[i + 1];
    const q = TIERS[tier];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
    world.setGrassCount(q.grass);
    world.sun.castShadow = q.shadows;
    resize();
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function frame() {
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    const now = (shared.time.value += dt);
    const v = visit.update(dt, now), pv = pav.update(dt);
    if (!v.drawIsland || !pv.drawIsland) { requestAnimationFrame(frame); countFrame(nowMs); return; }
    if (!idle()) bull.update(dt, now, 0, 0, null, groundAt, () => undefined);
    else if (mode === 'follow') moveBull(dt, now); else { input.poll(); if (input.active()) setView('follow'); bull.update(dt, now, 0, 0, null, groundAt, () => undefined); }
    if (!screenDrawn && nearPavilion()) drawScreen();
    if (!skyPreloaded && night > 0.3) { skyPreloaded = true; loadStars().then(() => loadSky()).catch(() => undefined); }
    updateLight(dt, v.night);
    renderer.toneMappingExposure *= 1 - 0.97 * v.dark;
    world.setFade(v.hide);
    world.update(dt, now, night);
    prints.wash(world.seaLevel);
    dust.step(dt, now, night);
    birds.update(dt, now, shared.bull.value, night);
    if (idle()) moveCamera(dt, now);
    shared.cam.value.copy(camera.position);
    updatePlace();
    audio.update({
      night, swash: world.seaLevel / 0.14,
      shore: 1 - THREE.MathUtils.smoothstep(height(me.x, me.z), 0.6, 6),
      height: THREE.MathUtils.clamp(height(me.x, me.z) / 12, 0, 1),
      trees: 0.5,
    });
    renderer.render(scene, camera);
    countFrame(nowMs);
    requestAnimationFrame(frame);
  }
  function countFrame(nowMs: number) {
    frames++;
    if (nowMs - fpsT > 2000) {
      fps = Math.round((frames * 1000) / (nowMs - fpsT));
      frames = 0; fpsT = nowMs;
      // after a warm-up, two slow windows in a row lower the quality one step
      if (!lite && nowMs - born > 5000 && document.visibilityState === 'visible') {
        slowWindows = fps < 45 ? slowWindows + 1 : 0;
        if (slowWindows >= 2) { stepDown(); slowWindows = 0; }
      }
      if (!ui.debug.hidden) ui.debug.textContent = `${fps} fps · calidad ${tier} · ${renderer.info.render.calls} llamadas · noche ${night.toFixed(2)}`;
    }
  }

  function placeBull(x: number, z: number, heading: number) {
    Object.assign(me, { x, z, heading, speed: 0, turnRate: 0 });
    bull.group.position.set(x, groundAt(x, z), z); bull.group.rotation.set(0, heading, 0); bull.reset(groundAt);
    cameraTarget(shared.time.value); camPos.copy(want); camLook.copy(look);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }

  ui.debug.hidden = !params.has('debug');
  root.dataset.state = 'ready';
  const readyMs = Math.round(performance.now() - t0);

  // ---------------------------------------------------------------- test API
  (window as unknown as { __isla: unknown }).__isla = {
    readyMs,
    get fps() { return fps; },
    get tier() { return tier; },
    get night() { return night; },
    get here() { return here; },
    get mode() { return mode; },
    get bull() { return { x: me.x, z: me.z, heading: me.heading, speed: me.speed, gait: { ...bull.weights }, stride: { name: bull.gait.name, f: bull.gait.f, D: bull.gait.D } }; },
    get prints() { return prints.count(); },
    get scared() { return birds.scared; },
    get flocks() { return birds.perched(); },
    get stars() { return stars?.count ?? 0; },
    get sound() { return audio.on; },
    place: placeBull,
    get visit() { return visit.state; },
    get visitT() { return visit.progress; },
    goUp: (slug?: string) => goUp(slug),
    goDown,
    get pavilion() { return pav.state; },
    get demoPath() { return pav.demo?.path ?? null; },
    enterWarrenia: (path?: string) => enterPavilion(path),
    leaveWarrenia: leavePavilion,
    goToDoor,
    renderer, camera, scene, shared, bullAnim: bull, props: world.props,
  };
  requestAnimationFrame(frame);
  // a link straight to a place: #observatorio[/<note>] or #warrenia[/<tab>]
  const startIn = route();
  if (startIn?.to === 'sky') goUp(startIn.slug, true);
  else if (startIn?.to === 'warrenia') enterPavilion(startIn.path, true);
}
