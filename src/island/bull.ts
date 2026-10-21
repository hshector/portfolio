// The bull: "bull walk cycle" by Lucy Greenhill (Sketchfab, CC BY 4.0), recoloured black.
//
// The model is 0.134 units long, stands on y = 0 and faces -z; it is scaled to about 3.2 m and
// turned to face +z. It only ships a walk cycle, so:
// - trot and gallop are derived from it (gaits.ts) and blended by speed, all in step;
// - standing still is two opposite moments of the walk mixed half and half, which puts the legs
//   square under the body; on top of it the bull breathes, flicks its tail and turns its head
//   towards nearby places.
// Measured from the walk (21 Oct 2026): at normal speed the planted hooves slide back at
// 0.026 model units/s, so that is the body's speed at timeScale 1.

import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GAITS, deriveClip } from './gaits';

export const BULL_SCALE = 24;
/** Ground speed (m/s) of each gait at normal playback speed. */
const NATURAL = { walk: 0.026 * BULL_SCALE, trot: 0.026 * BULL_SCALE * 1.25, gallop: 0.026 * BULL_SCALE * 1.5 };
/** Speeds (m/s) where each gait takes over. */
export const SPEED = { walk: 2.2, trot: 4.4, gallop: 7.8 };
const HOOVES = ['front_l_standardpaw_jnt_017', 'front_r_standardpaw_jnt_022', 'back_l_standardpaw_jnt_032', 'back_r_standardpaw_jnt_037'];
const SHEEN_NIGHT = new THREE.Color(0x343f66);
const STAND = 0.225; // with its opposite (0.725): the walk's most square-legged pair of moments

export interface HoofPlant { x: number; z: number; leg: number; speed: number }

export class Bull {
  readonly group = new THREE.Group();
  /** Leans and bounces with the gait; the model sits inside. */
  private readonly body = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<'standA' | 'standB' | 'walk' | 'trot' | 'gallop', THREE.AnimationAction>;
  private readonly hooves: THREE.Object3D[];
  private readonly neck?: THREE.Object3D;
  private readonly head?: THREE.Object3D;
  private readonly chest?: THREE.Object3D;
  private readonly tail: THREE.Object3D[];
  /** Bones the procedural motion turns, with their pose before it: reset every frame, because the
   *  ones the walk clip doesn't animate would otherwise keep the previous frame's turn and drift. */
  private readonly touched: [THREE.Object3D, THREE.Quaternion][] = [];
  private phase = 0;
  private readonly hoofLast = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly hoofDown = [true, true, true, true];
  private readonly lastPlant = [0, 0, 0, 0];
  private look = 0;
  private lookPitch = 0;
  private nextGlance = 3;
  private glance = 0;
  readonly weights = { stand: 1, walk: 0, trot: 0, gallop: 0 };
  private readonly fur: THREE.MeshPhysicalMaterial;

  constructor(asset: GLTF) {
    const model = cloneSkinned(asset.scene);
    // black, with a soft sheen and specular so its shape still reads against dark ground
    const fur = (this.fur = new THREE.MeshPhysicalMaterial({
      color: 0x0a0909, roughness: 0.42, specularIntensity: 0.7, sheen: 1, sheenColor: new THREE.Color(0x2c2622), sheenRoughness: 0.4, side: THREE.DoubleSide,
    }));
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = fur; m.castShadow = true; m.frustumCulled = false; }
    });
    model.scale.setScalar(BULL_SCALE);
    model.rotation.y = Math.PI;
    model.position.z = -0.065 * BULL_SCALE; // centre the body on the group's origin
    this.body.add(model);
    this.group.add(this.body);

    const walk = asset.animations[0];
    this.mixer = new THREE.AnimationMixer(model);
    const clip = (c: THREE.AnimationClip) => {
      const a = this.mixer.clipAction(c);
      a.play(); a.timeScale = 0; a.weight = 0;
      return a;
    };
    this.actions = {
      standA: clip(walk.clone()), standB: clip(walk.clone()),
      walk: clip(walk), trot: clip(deriveClip(walk, 'trot', GAITS.trot)), gallop: clip(deriveClip(walk, 'gallop', GAITS.gallop)),
    };
    this.actions.standA.time = STAND * walk.duration;
    this.actions.standB.time = ((STAND + 0.5) % 1) * walk.duration;

    const get = (n: string) => model.getObjectByName(n) ?? undefined;
    this.hooves = HOOVES.map((n) => get(n)!);
    this.neck = get('base_m_neck_jnt_024');
    this.head = get('base_m_head_jnt_025');
    this.chest = get('qspine_m_spine3ik_jnt_011');
    this.tail = ['chain_m_tail1_jnt_040', 'chain_m_tail2_jnt_041', 'chain_m_tail3_jnt_042'].map((n) => get(n)).filter((o): o is THREE.Object3D => !!o);
    for (const b of [this.neck, this.head, this.chest, ...this.tail]) if (b) this.touched.push([b, b.quaternion.clone()]);
  }

  /** By moonlight the coat catches a cold sheen, so the black bull still reads on dark ground. */
  setNight(n: number) {
    this.fur.sheenColor.set(0x2c2622).lerp(SHEEN_NIGHT, THREE.MathUtils.smoothstep(n, 0.4, 1));
  }

  /**
   * Advances the animation. speed is the bull's ground speed (m/s, negative when backing up),
   * turn its turning rate (rad/s), lookAt a world point it may glance at when slow, or null.
   * Calls onPlant for each hoof that lands.
   */
  update(dt: number, time: number, speed: number, turn: number, lookAt: THREE.Vector3 | null, onPlant: (p: HoofPlant) => void) {
    const s = Math.abs(speed), w = this.weights;
    // gait weights: stand → walk → trot → gallop, blended by speed
    const ramp = (a: number, b: number) => THREE.MathUtils.clamp((s - a) / (b - a), 0, 1);
    const moving = ramp(0.12, 0.7);
    const toTrot = ramp(3.0, 4.4), toGallop = ramp(5.6, 7.2);
    w.stand = 1 - moving;
    w.gallop = moving * toGallop;
    w.trot = moving * toTrot * (1 - toGallop);
    w.walk = moving * (1 - toTrot);
    const natural = (w.walk * NATURAL.walk + w.trot * NATURAL.trot + w.gallop * NATURAL.gallop) / Math.max(1e-3, moving) || NATURAL.walk;
    const dur = this.actions.walk.getClip().duration;
    // all gaits share one phase so they stay in step while blending
    this.phase = (this.phase + (dt * Math.sign(speed || 1) * Math.min(s / natural, 9)) / dur + 1) % 1;
    for (const k of ['walk', 'trot', 'gallop'] as const) { this.actions[k].time = this.phase * dur; this.actions[k].weight = w[k]; }
    this.actions.standA.weight = this.actions.standB.weight = w.stand * 0.5;
    for (const [b, q] of this.touched) b.quaternion.copy(q);
    this.mixer.update(0);

    // the body bounds when galloping and leans into turns
    const bounce = w.gallop * 0.12 * Math.abs(Math.sin(this.phase * Math.PI * 2));
    this.body.position.y = bounce;
    this.body.rotation.x = w.gallop * 0.05 * Math.sin(this.phase * Math.PI * 2 + 1.2);
    this.body.rotation.z = THREE.MathUtils.clamp(-turn * s * 0.02, -0.12, 0.12);

    this.group.updateMatrixWorld(true);
    this.idleLife(dt, time, w.stand, lookAt);

    // a hoof lands when it stops moving: report where (prints, dust, sound)
    this.hooves.forEach((hoof, i) => {
      const p = hoof.getWorldPosition(tmp);
      const hoofSpeed = dt > 0 ? p.distanceTo(this.hoofLast[i]) / dt : 0;
      this.hoofLast[i].copy(p);
      const down = hoofSpeed < Math.max(0.35, s * 0.45);
      if (s > 0.4 && down && !this.hoofDown[i] && time - this.lastPlant[i] > Math.max(0.12, 0.3 - s * 0.03)) {
        this.lastPlant[i] = time;
        onPlant({ x: p.x, z: p.z, leg: i, speed: s });
      }
      this.hoofDown[i] = down;
    });
  }

  /** Breathing, tail flicks and head turns, stronger when standing still. */
  private idleLife(dt: number, time: number, still: number, lookAt: THREE.Vector3 | null) {
    this.group.getWorldQuaternion(qBody);
    side.set(1, 0, 0).applyQuaternion(qBody);
    if (this.chest) turnBone(this.chest, up, 0, side, Math.sin(time * 1.6) * 0.025 * (0.4 + still));
    this.tail.forEach((b, i) => turnBone(b, up, Math.sin(time * 2.3 - i * 0.6) * 0.1 * still, side, 0));
    // where to look: a nearby place, or now and then a glance to the side
    this.nextGlance -= dt;
    if (this.nextGlance < 0) { this.glance = (Math.random() - 0.5) * 1.2; this.nextGlance = 3 + Math.random() * 5; }
    let yaw = this.glance * still;
    if (lookAt) {
      this.group.getWorldPosition(tmp);
      const heading = Math.atan2(2 * (qBody.w * qBody.y + qBody.x * qBody.z), 1 - 2 * (qBody.y * qBody.y + qBody.z * qBody.z));
      const ang = Math.atan2(lookAt.x - tmp.x, lookAt.z - tmp.z) - heading;
      yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(ang), Math.cos(ang)), -0.9, 0.9);
    }
    const pitch = still * (0.08 * Math.sin(time * 0.45) - 0.06); // a slow nod, head a little low
    const k = 1 - Math.exp(-dt * 2.5);
    this.look += (yaw * (0.35 + 0.65 * still) - this.look) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    // neck and head share the turn, 40/60
    if (this.neck) turnBone(this.neck, up, this.look * 0.4, side, this.lookPitch * 0.5);
    if (this.head) turnBone(this.head, up, this.look * 0.6, side, this.lookPitch * 0.5);
  }
}

const tmp = new THREE.Vector3();
const qBody = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
const mRot = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), pivot = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
/**
 * Turns a bone about two world axes through its own joint, keeping its children attached.
 * Done with full matrices: this rig has scale-compensation nodes, so quaternion-only maths
 * would be wrong for some bones.
 */
function turnBone(bone: THREE.Object3D, axisA: THREE.Vector3, angleA: number, axisB: THREE.Vector3, angleB: number) {
  if (!angleA && !angleB) return;
  bone.updateWorldMatrix(true, false);
  pivot.setFromMatrixPosition(bone.matrixWorld);
  qa.setFromAxisAngle(axisA, angleA); qb.setFromAxisAngle(axisB, angleB);
  mRot.makeRotationFromQuaternion(qa.multiply(qb));
  // world' = T(p) · R · T(-p) · world;  local' = parentWorld⁻¹ · world'
  mA.makeTranslation(-pivot.x, -pivot.y, -pivot.z).premultiply(mRot).premultiply(mB.makeTranslation(pivot.x, pivot.y, pivot.z));
  mA.multiply(bone.matrixWorld);
  mB.copy(bone.parent!.matrixWorld).invert().multiply(mA);
  mB.decompose(bone.position, bone.quaternion, bone.scale);
  bone.updateMatrixWorld(true);
}
