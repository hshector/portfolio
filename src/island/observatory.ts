// Going up the observatory without leaving the island. The camera rises over the dome and looks up,
// the island fades into the night, the library's stars leave the sky dome and gather into the 3D
// constellation in front of the camera, and the interactive constellation (src/constellation) takes
// over on the same canvas. "Volver al toro" plays it backwards.
//
// The hand-over is seamless because the stars are placed where the constellation's own camera will
// see them: same field of view, and each star at the same direction and apparent size
// (stars.ts, setMorphTarget).

import * as THREE from 'three';
import type { MountedSky } from '../constellation/app';
import { SITES, height } from './terrain';

type LibrarySky = Awaited<ReturnType<typeof import('./stars').createLibrarySky>>;

export type VisitState = 'island' | 'rising' | 'sky' | 'returning';

const RISE = { camera: [0, 2.2], hide: [0.3, 1.4], dark: [1.4, 2.8], morph: [2.3, 5.0] } as const;
const BACK = { morph: [0, 2.0], light: [1.0, 2.4], camera: [1.8, 3.8] } as const;
/** Constellation units → island metres (the constellation is ~120 units wide; 4× puts it ~600 m away, under the sky dome). */
const S = 4;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const span = (t: number, [a, b]: readonly [number, number]) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

export interface VisitHandles {
  camera: THREE.PerspectiveCamera;
  /** The library stars on the island's sky (loaded on demand). */
  stars(): Promise<LibrarySky>;
  /** The interactive constellation (loaded on demand). */
  sky(): Promise<MountedSky>;
  /** Where the follow camera would be now (to come back to). */
  followPose(): { position: THREE.Vector3; look: THREE.Vector3 };
  onState(s: VisitState): void;
}

export function createVisit(h: VisitHandles) {
  let state: VisitState = 'island';
  let t = 0, slugOnArrival: string | undefined;
  let stars: LibrarySky | null = null, sky: MountedSky | null = null;
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 45 };
  const top = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 50 };
  const islandFov = h.camera.fov;
  const tmpCam = new THREE.PerspectiveCamera();

  function setState(s: VisitState) { state = s; t = 0; h.onState(s); }

  /** The camera's pose at the top: above the dome, looking up and north. */
  function topPose() {
    const o = SITES.observatorio, oy = height(o.x, o.z);
    // (clear of the dome, 8.3 m, and of the lit telescope slit on top of it)
    tmpCam.position.set(o.x, oy + 12, o.z + 4);
    tmpCam.lookAt(o.x, oy + 12 + 0.85, o.z + 4 - 1);
    return { pos: tmpCam.position.clone(), quat: tmpCam.quaternion.clone() };
  }

  async function prepare() {
    [stars, sky] = await Promise.all([h.stars(), h.sky()]);
    const p = topPose();
    top.pos.copy(p.pos); top.quat.copy(p.quat);
    const start = sky.cameraStart();
    top.fov = start.fov;
    stars.setMorphTarget(top.pos, top.quat, start.position, start.quaternion, S, sky.pointScale());
  }

  return {
    get state() { return state; },
    get progress() { return t; },
    /** Go up. instant: straight into the sky (a link to #observatorio). */
    async go(slug?: string, instant = false) {
      if (state !== 'island') return;
      slugOnArrival = slug;
      from.pos.copy(h.camera.position); from.quat.copy(h.camera.quaternion); from.fov = h.camera.fov;
      setState('rising');
      await prepare();
      if (instant) t = RISE.morph[1];
    },
    back() {
      if (state !== 'sky') return;
      sky?.exit();
      setState('returning');
    },
    /**
     * One frame. Returns how dark the island should be (0 = normal, 1 = black), how hidden its
     * beams and clouds are, whether to force the night, and whether the island is drawn at all
     * (not while the sky is showing).
     */
    update(dt: number, time: number) {
      if (state === 'island') return { dark: 0, hide: 0, night: false, drawIsland: true };
      t += dt;
      const cam = h.camera;
      if (state === 'rising') {
        const c = span(t, RISE.camera);
        cam.position.lerpVectors(from.pos, top.pos, c);
        cam.position.y += Math.sin(Math.PI * c) * 6; // a little arc up and over
        cam.quaternion.slerpQuaternions(from.quat, top.quat, c);
        cam.fov = THREE.MathUtils.lerp(from.fov, top.fov, c);
        cam.updateProjectionMatrix();
        if (stars) stars.morph.value = span(t, RISE.morph);
        if (stars && sky && t >= RISE.morph[1]) {
          setState('sky');
          sky.enter(slugOnArrival);
        }
        return { dark: span(t, RISE.dark), hide: span(t, RISE.hide), night: true, drawIsland: true };
      }
      if (state === 'sky') {
        sky!.frame(time);
        return { dark: 1, hide: 1, night: true, drawIsland: false };
      }
      // returning
      if (stars) stars.morph.value = 1 - span(t, BACK.morph);
      const c = span(t, BACK.camera);
      const f = h.followPose();
      tmpCam.position.copy(f.position); tmpCam.lookAt(f.look);
      cam.position.lerpVectors(top.pos, f.position, c);
      cam.quaternion.slerpQuaternions(top.quat, tmpCam.quaternion, c);
      cam.fov = THREE.MathUtils.lerp(top.fov, islandFov, c);
      cam.updateProjectionMatrix();
      if (t >= BACK.camera[1]) setState('island');
      return { dark: 1 - span(t, BACK.light), hide: 1 - span(t, BACK.light), night: true, drawIsland: true };
    },
  };
}
export type Visit = ReturnType<typeof createVisit>;
