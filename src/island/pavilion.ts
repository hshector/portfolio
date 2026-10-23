// Into the WarrenIA pavilion without leaving the island. The camera walks in through the glass and
// stops square in front of the screen on the back wall, close enough for it to fill the view; then
// the app (src/island/warrenia.ts) opens exactly over the screen's picture, and follows it if the
// window changes size. On a phone the app takes the whole screen. "Volver al toro" plays it back.

import * as THREE from 'three';
import type { Demo } from './warrenia';

export type PavilionState = 'island' | 'docking' | 'open' | 'leaving';

const DOCK = 1.8, LEAVE = 1.5;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface PavilionHandles {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** The demo's panel (hidden until it opens). */
  host: HTMLElement;
  screen: { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number };
  /** Builds the demo inside host (loaded on demand). */
  demo(): Promise<Demo>;
  followPose(): { position: THREE.Vector3; look: THREE.Vector3 };
  onState(s: PavilionState): void;
}

export function createPavilion(h: PavilionHandles) {
  let state: PavilionState = 'island', t = 0, demo: Demo | null = null, pathOnArrival: string | undefined;
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const dock = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const tmp = new THREE.PerspectiveCamera(), corner = new THREE.Vector3();
  const phone = matchMedia('(max-width: 720px)');

  function setState(s: PavilionState) { state = s; t = 0; h.onState(s); }

  /** Square in front of the screen, at the distance where it fills ~86 % of the view. */
  function dockPose() {
    const cam = h.camera, tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max(h.screen.height / (0.86 * 2 * tan), h.screen.width / (0.92 * 2 * tan * cam.aspect));
    tmp.position.copy(h.screen.center).addScaledVector(h.screen.normal, d);
    tmp.lookAt(h.screen.center);
    dock.pos.copy(tmp.position); dock.quat.copy(tmp.quaternion);
  }

  /** Lays the panel over the screen's picture (desktop; on a phone CSS makes it full screen). */
  function placePanel() {
    const cam = h.camera, s = h.screen, r = h.canvas.getBoundingClientRect();
    cam.updateMatrixWorld();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const side = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, s.normal).normalize();
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      corner.copy(s.center).addScaledVector(side, (a * s.width) / 2).addScaledVector(THREE.Object3D.DEFAULT_UP, (b * s.height) / 2).project(cam);
      const px = (corner.x * 0.5 + 0.5) * r.width, py = (-corner.y * 0.5 + 0.5) * r.height;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    Object.assign(h.host.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  }

  function open() {
    placePanel();
    h.host.hidden = false;
    requestAnimationFrame(() => h.host.setAttribute('data-open', ''));
    if (pathOnArrival) demo!.show(pathOnArrival);
    h.host.querySelector<HTMLElement>('[data-warrenia-close]')?.focus({ preventScroll: true });
  }

  addEventListener('resize', () => {
    if (state !== 'open') return;
    dockPose();
    h.camera.position.copy(dock.pos); h.camera.quaternion.copy(dock.quat);
    placePanel();
  });

  return {
    get state() { return state; },
    get progress() { return t; },
    get demo() { return demo; },
    /** Walk in. instant: straight to the open app (a link to #warrenia[/route]). */
    async go(path?: string, instant = false) {
      if (state !== 'island') return;
      pathOnArrival = path;
      from.pos.copy(h.camera.position); from.quat.copy(h.camera.quaternion);
      dockPose();
      setState('docking');
      demo = await h.demo();
      if (instant) t = DOCK;
    },
    back() {
      if (state !== 'open') return;
      h.host.removeAttribute('data-open');
      setTimeout(() => { if (state !== 'open') h.host.hidden = true; }, 450);
      setState('leaving');
    },
    /** One frame. Returns whether the island needs drawing (not behind a full-screen demo). */
    update(dt: number) {
      if (state === 'island') return { drawIsland: true };
      t += dt;
      const cam = h.camera;
      if (state === 'docking') {
        const c = ease(Math.min(1, t / DOCK));
        cam.position.lerpVectors(from.pos, dock.pos, c);
        cam.position.y += Math.sin(Math.PI * c) * 1.2;
        cam.quaternion.slerpQuaternions(from.quat, dock.quat, c);
        if (t >= DOCK && demo) { cam.position.copy(dock.pos); cam.quaternion.copy(dock.quat); setState('open'); open(); }
        return { drawIsland: true };
      }
      if (state === 'open') return { drawIsland: !phone.matches };
      const c = ease(Math.min(1, t / LEAVE));
      const f = h.followPose();
      tmp.position.copy(f.position); tmp.lookAt(f.look);
      cam.position.lerpVectors(dock.pos, f.position, c);
      cam.quaternion.slerpQuaternions(dock.quat, tmp.quaternion, c);
      if (t >= LEAVE) setState('island');
      return { drawIsland: true };
    },
  };
}
export type Pavilion = ReturnType<typeof createPavilion>;
