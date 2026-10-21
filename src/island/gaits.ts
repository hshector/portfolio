// Trot and gallop for the bull, derived from its only animation (a walk cycle).
//
// Each leg's tracks are shifted in time so the legs land in the order of the new gait, and the
// leg rotations are scaled up for a longer stride. The phases were measured from the paw bones
// of the walk clip (the moment each hoof is highest, as a fraction of the cycle).

import * as THREE from 'three';

type Leg = 'front_l' | 'front_r' | 'back_l' | 'back_r';
export interface Gait {
  /** Target mid-swing phase of each leg (fraction of the cycle). */
  phase: Record<Leg, number>;
  /** How much to scale the leg rotations (1 = as in the walk). */
  amp: number;
}

export const WALK_PHASE: Record<Leg, number> = { back_l: 0.275, front_l: 0.525, back_r: 0.642, front_r: 0.917 };

export const GAITS = {
  // diagonal pairs move together
  trot: { phase: { back_l: 0.275, front_r: 0.275, front_l: 0.775, back_r: 0.775 }, amp: 1.25 },
  // transverse gallop: both hind legs, then both fore legs, close together
  gallop: { phase: { back_l: 0.0, back_r: 0.1, front_l: 0.42, front_r: 0.52 }, amp: 1.5 },
} satisfies Record<string, Gait>;

const LEG = /^(front_l|front_r|back_l|back_r)_/;
// KeyframeTrack.createInterpolant exists at runtime but is missing from @types/three
const interpolant = (tr: THREE.KeyframeTrack) => (tr as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }).createInterpolant();

export function deriveClip(walk: THREE.AnimationClip, name: string, gait: Gait, samples = 48) {
  const T = walk.duration, tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion(), mean = new THREE.Quaternion(), inv = new THREE.Quaternion(), d = new THREE.Quaternion();
  for (const tr of walk.tracks) {
    const leg = (tr.name.split('.')[0].match(LEG) || [])[1] as Leg | undefined;
    if (!leg) { tracks.push(tr.clone()); continue; }
    const shift = (((gait.phase[leg] - WALK_PHASE[leg]) % 1) + 1) % 1;
    const ip = interpolant(tr), size = tr.getValueSize();
    const times = new Float32Array(samples), values = new Float32Array(samples * size);
    for (let i = 0; i < samples; i++) {
      const t = (T * i) / samples;
      times[i] = t;
      const s = ((((t - shift * T) % T) + T) % T);
      values.set(ip.evaluate(s) as Float32Array, i * size);
    }
    if (tr.ValueTypeName === 'quaternion' && gait.amp !== 1) {
      // scale each rotation's angle away from the track's average rotation
      // (Quaternion.slerp clamps t to [0, 1], so this is done by hand)
      const m = [0, 0, 0, 0];
      for (let i = 0; i < samples; i++) {
        const dot = values[0] * values[i * 4] + values[1] * values[i * 4 + 1] + values[2] * values[i * 4 + 2] + values[3] * values[i * 4 + 3];
        for (let c = 0; c < 4; c++) m[c] += values[i * 4 + c] * (dot < 0 ? -1 : 1);
      }
      mean.fromArray(m).normalize();
      inv.copy(mean).invert();
      for (let i = 0; i < samples; i++) {
        q.fromArray(values, i * 4);
        d.multiplyQuaternions(inv, q);
        if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
        const sn = Math.sqrt(Math.max(0, 1 - d.w * d.w));
        if (sn > 1e-6) {
          const half = Math.acos(Math.min(1, d.w)) * gait.amp, k = Math.sin(half) / sn;
          d.set(d.x * k, d.y * k, d.z * k, Math.cos(half));
        }
        q.multiplyQuaternions(mean, d).toArray(values, i * 4);
      }
    }
    const Track = tr.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack;
    tracks.push(new Track(tr.name, times, values));
  }
  return new THREE.AnimationClip(name, T, tracks);
}

/** A one-frame clip holding a model's pose as loaded (its rest pose). */
export function restClip(root: THREE.Object3D, walk: THREE.AnimationClip) {
  const tracks: THREE.KeyframeTrack[] = [];
  const nodes = new Set(walk.tracks.map((t) => t.name.split('.')[0]));
  root.traverse((o) => {
    if (!nodes.has(o.name)) return;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, [0], o.quaternion.toArray()));
    tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.position`, [0], o.position.toArray()));
    tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.scale`, [0], o.scale.toArray()));
  });
  return new THREE.AnimationClip('rest', walk.duration, tracks);
}

/** A one-frame clip holding the walk's pose at one moment (a standing pose). */
export function poseClip(walk: THREE.AnimationClip, at: number, name = 'pose') {
  const tracks = walk.tracks.map((tr) => {
    const v = interpolant(tr).evaluate(at * walk.duration) as Float32Array;
    const Track = tr.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    return new Track(tr.name, [0], Array.from(v));
  });
  return new THREE.AnimationClip(name, walk.duration, tracks);
}
