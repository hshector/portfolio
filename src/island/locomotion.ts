// Procedural gaits for the bull: walk, trot, canter and gallop, generated every frame from a table
// of footfalls instead of a recorded clip.
//
// How it works (the same principles as majidmanzarpour/threejs-procedural-animals, MIT, whose cattle
// gait table is used below; their engine drives its own skeleton, so this is a smaller rewrite for
// the bull's rig):
// - One stride clock runs at the gait's stride frequency; each leg lands at its own offset in the
//   stride and stays down for the gait's duty factor.
// - A planted hoof is pinned to the ground where it landed (no sliding, prints exactly there); a
//   swinging hoof flies to where the leg will be half a stance ahead when it lands.
// - Each leg is posed by inverse kinematics: hoof and pastern from the ground, the cannon bone at a
//   gait-dependent fold, then the upper two bones by the law of cosines, bending the way they bend
//   in the bull's own standing pose.
// - Speed comes from longer strides at almost the same rate, as in real gallops (stride frequency
//   ~2 Hz from 7 to 11 m/s); when no hoof is down the body flies.

import * as THREE from 'three';

type Leg = 0 | 1 | 2 | 3; // front left, front right, hind left, hind right

interface GaitRow {
  name: 'walk' | 'trot' | 'canter' | 'gallop';
  /** speed (m/s), stride frequency (Hz), duty factor (fraction of the stride a hoof is down) */
  v: number; f: number; D: number;
  /** touchdown offsets in the stride: [FL, FR, HL, HR] */
  off: [number, number, number, number];
  /** hoof lift (m), girdle bob (m), spine flexion (rad), carpal fold (rad), tail lift (0…1), body drop (m) */
  lift: number; bob: number; flex: number; fold: number; tail: number; drop: number;
}

// Cattle, for a 1.45 m tall animal (threejs-procedural-animals, src/species/cow/motion.js; Copyright (c)
// 2026 Majid Manzarpour and procedural-animals contributors, MIT: licenses/threejs-procedural-animals.txt):
// lateral-sequence walk, trot in diagonal pairs, canter, and a transverse gallop with right lead.
const G = (name: GaitRow['name'], v: number, f: number, D: number, off: GaitRow['off'], lift: number, bob: number, flex: number, fold: number, tail: number, drop: number): GaitRow =>
  ({ name, v, f, D, off, lift, bob, flex, fold, tail, drop });
export const GAITS: GaitRow[] = [
  G('walk', 0.0, 0.72, 0.7, [0.25, 0.75, 0.0, 0.5], 0.07, 0.028, 0, 0.6, 0, 0),
  G('walk', 1.5, 0.9, 0.64, [0.25, 0.75, 0.0, 0.5], 0.09, 0.045, 0, 0.72, 0.1, 0),
  G('trot', 2.0, 1.35, 0.5, [0.52, 0.02, 0.0, 0.5], 0.12, 0.06, 0.01, 0.95, 0.3, 0.015),
  G('trot', 3.3, 1.55, 0.43, [0.52, 0.02, 0.0, 0.5], 0.14, 0.07, 0.015, 1.05, 0.4, 0.02),
  G('canter', 4.0, 1.7, 0.42, [0.3, 0.55, 0.0, 0.27], 0.17, 0.05, 0.05, 1.1, 0.55, 0.03),
  G('canter', 5.6, 1.8, 0.37, [0.3, 0.55, 0.0, 0.25], 0.19, 0.055, 0.065, 1.15, 0.65, 0.035),
  G('gallop', 7.0, 1.95, 0.31, [0.38, 0.52, 0.0, 0.12], 0.21, 0.06, 0.09, 1.25, 0.8, 0.05),
  G('gallop', 11, 2.15, 0.25, [0.4, 0.52, 0.0, 0.13], 0.23, 0.065, 0.11, 1.3, 1.0, 0.07),
];

const wrap = (x: number) => ((x % 1) + 1) % 1;
const ease = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** The gait for a speed, interpolated between the table's rows (offsets the short way round). */
export function gaitAt(v: number) {
  let i = 0;
  while (i < GAITS.length - 2 && v > GAITS[i + 1].v) i++;
  const a = GAITS[i], b = GAITS[i + 1];
  const t = THREE.MathUtils.clamp((v - a.v) / (b.v - a.v), 0, 1);
  const s = t * t * (3 - 2 * t);
  const k = (x: number, y: number) => x + (y - x) * s;
  const off = a.off.map((o, j) => { let d = b.off[j] - o; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return wrap(o + d * s); }) as GaitRow['off'];
  // past the last row, frequency creeps up slowly and the stride lengthens
  const f = v > b.v ? b.f + (v - b.v) * 0.02 : k(a.f, b.f);
  return { name: s < 0.5 ? a.name : b.name, v, f, D: k(a.D, b.D), off, lift: k(a.lift, b.lift), bob: k(a.bob, b.bob), flex: k(a.flex, b.flex), fold: k(a.fold, b.fold), tail: k(a.tail, b.tail), drop: k(a.drop, b.drop) };
}
export type Gait = ReturnType<typeof gaitAt>;

interface LegRig {
  front: boolean;
  /** girdle joint, elbow/stifle, carpus/hock, fetlock, hoof tip */
  bones: [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D];
  len: [number, number, number, number];
  /** standing pose, in the bull's own frame (x right, y up, z forward; metres): */
  neutral: THREE.Vector3; // hoof tip
  pastern: THREE.Vector3; // hoof tip → fetlock
  cannon: THREE.Vector3; // fetlock → carpus/hock
  pole: THREE.Vector3; // which way the middle joint sticks out
  toeHeight: number;
  /** How far the hoof can travel under the body while planted (m), from the leg's length and height. */
  sweep: number;
}

interface LegState {
  stance: boolean;
  plant: THREE.Vector3; // world
  from: THREE.Vector3; // world, where the swing started
  land: THREE.Vector3; // world, where it will land
  u: number; // stance progress 0…1
  w: number; // swing progress 0…1
  idleStep: number; // > 0 while repositioning a foot when standing
}

export interface Ground {
  (x: number, z: number): number;
}

const LEGS = [
  ['front_l_standardshoulder_jnt_014', 'front_l_standardelbow_jnt_015', 'front_l_standardwrist_jnt_016', 'front_l_standardpaw_jnt_017', 'front_l_standardtoe_jnt_018'],
  ['front_r_standardshoulder_jnt_019', 'front_r_standardelbow_jnt_020', 'front_r_standardwrist_jnt_021', 'front_r_standardpaw_jnt_022', 'front_r_standardtoe_jnt_023'],
  ['back_l_standardhip_jnt_029', 'back_l_standardknee_jnt_030', 'back_l_standardankle_jnt_031', 'back_l_standardpaw_jnt_032', 'back_l_standardtoe_jnt_033'],
  ['back_r_standardhip_jnt_034', 'back_r_standardknee_jnt_035', 'back_r_standardankle_jnt_036', 'back_r_standardpaw_jnt_037', 'back_r_standardtoe_jnt_038'],
];
const SPINE = ['qspine_m_spine1ik_jnt_09', 'qspine_m_spine2ik_jnt_010', 'qspine_m_spine3ik_jnt_011', 'qspine_m_spine4ik_jnt_012'];

export interface Touchdown { leg: Leg; x: number; y: number; z: number }

export class Locomotion {
  readonly legs: LegRig[];
  readonly state: LegState[];
  private readonly spine: THREE.Object3D[];
  private readonly tail?: THREE.Object3D;
  phase = 0;
  gait: Gait = gaitAt(0);
  /** How much the body is lifted by the gait right now (m; for tests and the camera). */
  bodyLift = 0;
  /** Size relative to the 1.45 m reference animal (the gait table is scaled by it). */
  readonly scale: number;
  private standingFor = 0;

  /**
   * group: the bull's frame (position on the ground, heading; x right, y up, z forward).
   * body: a child of group the gait may raise, pitch and roll; the model hangs below it,
   * already in its standing pose.
   */
  constructor(private group: THREE.Object3D, private body: THREE.Object3D, model: THREE.Object3D, withers: number) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const local = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    this.legs = LEGS.map((names, i) => {
      const bones = names.map((n) => model.getObjectByName(n)!) as LegRig['bones'];
      const p = bones.map(local);
      const len = [p[0].distanceTo(p[1]), p[1].distanceTo(p[2]), p[2].distanceTo(p[3]), p[3].distanceTo(p[4])] as LegRig['len'];
      // the middle joint's bend: where it sits off the line from the girdle to the carpus/hock
      const ac = p[2].clone().sub(p[0]).normalize();
      const pole = p[1].clone().sub(p[0]);
      pole.sub(ac.clone().multiplyScalar(pole.dot(ac))).normalize();
      // the hoof sweeps back under a planted leg until the leg is nearly straight: a chord of the
      // circle the girdle-to-carpus reach draws at the carpus's height
      const reach = (len[0] + len[1]) * 0.93, hC = p[0].y - p[2].y;
      // (less behind for the hind legs: a fully stretched hip pulls the rump's skin out of shape)
      const sweep = 2 * Math.sqrt(Math.max(0, reach * reach - hC * hC)) * (i < 2 ? 0.85 : 0.7);
      return { front: i < 2, bones, len, neutral: p[4].clone().setY(0), pastern: p[3].clone().sub(p[4]), cannon: p[2].clone().sub(p[3]), pole, toeHeight: p[4].y, sweep };
    });
    this.spine = SPINE.map((n) => model.getObjectByName(n)!).filter(Boolean);
    this.tail = model.getObjectByName('chain_m_tail0_jnt_039') ?? undefined;
    // the gait table's reference cow stands 1.45 m at the withers
    this.scale = withers / 1.45;
    this.state = this.legs.map((L) => {
      const w = L.neutral.clone().applyMatrix4(group.matrixWorld);
      return { stance: true, plant: w.clone(), from: w.clone(), land: w.clone(), u: 0, w: 0, idleStep: 0 };
    });
  }

  /** Puts every hoof back under the body (after teleporting). */
  reset(ground: Ground) {
    this.group.updateMatrixWorld(true);
    this.state.forEach((s, i) => {
      const w = this.legs[i].neutral.clone().applyMatrix4(this.group.matrixWorld);
      w.y = ground(w.x, w.z);
      Object.assign(s, { stance: true, u: 0, w: 0, idleStep: 0 });
      s.plant.copy(w); s.from.copy(w); s.land.copy(w);
    });
  }

  /**
   * One frame. speed in m/s (along the heading), yawRate in rad/s. The model must already be in its
   * standing pose (the caller resets it every frame). Returns the hooves that touched down.
   */
  update(dt: number, speed: number, yawRate: number, ground: Ground): Touchdown[] {
    const out: Touchdown[] = [];
    const sq = Math.sqrt(this.scale);
    const v = Math.abs(speed) / sq; // dynamically similar speed for the table
    const g = (this.gait = gaitAt(v));
    const f = g.f / sq;
    const moving = v > 0.08 || Math.abs(yawRate) > 0.25;
    if (moving) { this.phase = wrap(this.phase + f * dt); this.standingFor = 0; } else this.standingFor += dt;

    const gw = this.group.matrixWorld;
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(gw).setY(0).normalize();
    const vel = fwd.clone().multiplyScalar(speed);
    // each leg's duty factor: a stance may not sweep further than that leg reaches (the table asks
    // for v·D/f; where that is too far the hoof is down for less of the stride, the rest is flight)
    const duty = this.legs.map((L) => (Math.abs(speed) > 1e-3 ? THREE.MathUtils.clamp((f * L.sweep) / Math.abs(speed), 0.08, g.D) : g.D));

    // ---- feet
    this.legs.forEach((L, i) => {
      const s = this.state[i];
      const p = wrap(this.phase - g.off[i]);
      const D = duty[i], stanceDur = D / f;
      const neutralNow = L.neutral.clone().applyMatrix4(gw);
      if (moving) {
        const inStance = p < D;
        if (s.stance && !inStance && s.u > 0.3) {
          // lift-off
          s.stance = false; s.from.copy(s.plant); s.w = 0;
        } else if (!s.stance && inStance && s.w > 0.5) {
          // touchdown
          s.stance = true; s.plant.copy(s.land); s.u = 0;
          out.push({ leg: i as Leg, x: s.plant.x, y: s.plant.y, z: s.plant.z });
        }
        if (s.stance) {
          s.u = Math.min(1, p / D);
          // a hoof left too far behind (sharp turns, speeding up) steps early rather than dragging
          const rel = s.plant.clone().sub(neutralNow);
          if (rel.dot(fwd) < -L.sweep * 0.6 && s.u > 0.3) { s.stance = false; s.from.copy(s.plant); s.w = 0; }
        } else {
          const swingLeft = Math.max(0, (1 - p) / f);
          s.w = THREE.MathUtils.clamp((p - D) / (1 - D), s.w, 1);
          // land half a stance ahead of where the girdle will be at touchdown
          const lead = (Math.abs(speed) * stanceDur * 0.5) * Math.sign(speed || 1);
          s.land.copy(neutralNow).addScaledVector(vel, swingLeft).addScaledVector(fwd, lead);
          s.land.y = ground(s.land.x, s.land.z);
        }
      } else {
        // standing: plant every hoof; step any that ended up far from under the body, one at a time
        if (!s.stance) { s.stance = true; s.plant.copy(s.land); out.push({ leg: i as Leg, x: s.plant.x, y: s.plant.y, z: s.plant.z }); }
        s.u = 0;
        const off = s.plant.distanceTo(neutralNow);
        const someoneStepping = this.state.some((o) => o.idleStep > 0);
        if (s.idleStep > 0) {
          s.idleStep = Math.max(0, s.idleStep - dt / 0.35);
          const t = 1 - s.idleStep;
          s.land.copy(neutralNow); s.land.y = ground(s.land.x, s.land.z);
          s.plant.lerpVectors(s.from, s.land, ease(0, 1, t));
          s.plant.y += Math.sin(Math.PI * t) * 0.08 * this.scale;
          if (s.idleStep === 0) { s.plant.copy(s.land); out.push({ leg: i as Leg, x: s.plant.x, y: s.plant.y, z: s.plant.z }); }
        } else if (off > 0.22 * this.scale && !someoneStepping && this.standingFor > 0.15) {
          s.idleStep = 1; s.from.copy(s.plant);
        }
      }
    });

    // ---- body: each girdle sinks while its legs carry weight and rises when they don't (a gallop
    // has a moment with no hoof down: the whole body flies)
    const load = (a: number, b: number) => {
      const l = (j: number) => (this.state[j].stance && moving ? Math.sin(Math.PI * this.state[j].u) : 0);
      return Math.max(l(a), l(b));
    };
    const bob = moving ? g.bob * this.scale : 0;
    const front = bob * (0.5 - load(0, 1)) - g.drop * this.scale;
    const hind = bob * (0.5 - load(2, 3)) - g.drop * this.scale;
    const span = this.legs[0].neutral.z - this.legs[2].neutral.z;
    const k = 1 - Math.exp(-dt * 14);
    this.bodyLift += ((front + hind) / 2 - this.bodyLift) * k;
    this.body.position.y = this.bodyLift;
    this.body.rotation.x += (Math.atan2(hind - front, span) - this.body.rotation.x) * k;
    this.body.rotation.z = THREE.MathUtils.clamp(-yawRate * Math.abs(speed) * 0.015, -0.1, 0.1);
    this.body.updateMatrixWorld(true);

    // ---- spine: gathers when the hind legs reach under, stretches when they push off
    if (g.flex > 0.001 && moving) {
      const a = g.flex * Math.cos(Math.PI * 2 * (this.phase - 0.15)) / this.spine.length;
      for (const b of this.spine) rotateAbout(b, sideOf(this.group), a);
    }
    // ---- tail streams out behind at speed
    if (this.tail && g.tail > 0) rotateAbout(this.tail, sideOf(this.group), 0.9 * g.tail * ease(0.5, 3, v));

    // ---- legs
    this.legs.forEach((L, i) => this.solveLeg(L, this.state[i], g, moving));
    return out;
  }

  private solveLeg(L: LegRig, s: LegState, g: Gait, moving: boolean) {
    const gq = this.group.getWorldQuaternion(new THREE.Quaternion());
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
    const toWorld = (v: THREE.Vector3) => v.clone().applyQuaternion(gq);
    // hoof tip
    const toe = new THREE.Vector3();
    let swing = 0;
    if (s.stance) toe.copy(s.plant);
    else {
      swing = Math.sin(Math.PI * s.w);
      toe.lerpVectors(s.from, s.land, ease(0, 1, s.w));
      toe.y = s.from.y + (s.land.y - s.from.y) * ease(0, 1, s.w) + g.lift * this.scale * swing;
    }
    toe.y += L.toeHeight;
    // pastern: curls in the swing, rolls over the toe at the end of the stance
    const roll = s.stance && moving ? -0.5 * ease(0.7, 1, s.u) : 0;
    const pastern = toWorld(L.pastern).applyAxisAngle(side, (L.front ? 0.9 : 0.7) * swing + roll);
    const fetlock = toe.clone().add(pastern);
    // cannon: the carpus (front) folds the hoof back and up in the swing; the hock folds less
    const fold = swing * g.fold * (L.front ? 1 : 0.45);
    const cannon = toWorld(L.cannon).applyAxisAngle(side, L.front ? fold : -fold * 0.6);
    const carpus = fetlock.clone().add(cannon);
    // upper two bones: law of cosines, bending like the standing pose
    const girdle = L.bones[0].getWorldPosition(new THREE.Vector3());
    const [l1, l2] = L.len;
    const toC = carpus.clone().sub(girdle);
    let d = toC.length();
    const dir = toC.clone().divideScalar(d || 1);
    if (d > (l1 + l2) * 0.995) { d = (l1 + l2) * 0.995; carpus.copy(girdle).addScaledVector(dir, d); }
    if (d < Math.abs(l1 - l2) * 1.05) d = Math.abs(l1 - l2) * 1.05;
    const a = (l1 * l1 + d * d - l2 * l2) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pole = toWorld(L.pole);
    pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const elbow = girdle.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    // aim each bone at the next joint (parents first, so children follow)
    aim(L.bones[0], L.bones[1], elbow);
    aim(L.bones[1], L.bones[2], carpus);
    aim(L.bones[2], L.bones[3], fetlock);
    aim(L.bones[3], L.bones[4], toe);
  }
}

// ---------------------------------------------------------------- bone helpers
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();

function sideOf(o: THREE.Object3D) {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
}

/** Rotates bone (about its own joint, in world space) by q, keeping its children attached. */
function rotateWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  bone.updateWorldMatrix(true, false);
  _a.setFromMatrixPosition(bone.matrixWorld);
  _m1.makeTranslation(-_a.x, -_a.y, -_a.z).premultiply(_m2.makeRotationFromQuaternion(q)).premultiply(_m3.makeTranslation(_a.x, _a.y, _a.z));
  _m1.multiply(bone.matrixWorld);
  // local = parentWorld⁻¹ · world (full matrices: the rig has scale-compensation nodes)
  _m2.copy(bone.parent!.matrixWorld).invert().multiply(_m1);
  _m2.decompose(bone.position, bone.quaternion, bone.scale);
  bone.updateMatrixWorld(true);
}

function rotateAbout(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  rotateWorld(bone, _q.setFromAxisAngle(axis, angle));
}

/** Turns bone so that its child joint points at target. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) {
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  _a.setFromMatrixPosition(bone.matrixWorld);
  _b.setFromMatrixPosition(child.matrixWorld).sub(_a).normalize();
  _c.copy(target).sub(_a).normalize();
  if (_b.dot(_c) > 0.99999) return;
  rotateWorld(bone, _q.setFromUnitVectors(_b, _c));
}
