// The bull: "bull walk cycle" by Lucy Greenhill (Sketchfab, CC BY 4.0), recoloured black.
//
// The model is 0.134 units long, stands on y = 0 and faces -z; it is scaled to about 3.2 m and
// turned to face +z. Its only clip is a walk, used here for one thing: its standing pose (two
// opposite moments of the walk mixed half and half, which puts the legs square under the body).
// Every gait is generated on top of that pose, every frame (locomotion.ts): walk, trot, canter and
// gallop from a table of footfalls, with the hooves pinned where they land and the legs posed by
// inverse kinematics. On top, the bull breathes, flicks its tail and turns its head towards
// nearby places.

import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Locomotion, type Ground } from './locomotion';

export const BULL_SCALE = 24;
/** Ground speeds (m/s): a walk, and the top gallop. Anything between trots or canters. */
export const SPEED = { walk: 1.5, gallop: 8.5 };
const SHEEN_NIGHT = new THREE.Color(0x343f66);
const STAND = 0.225; // with its opposite (0.725): the walk's most square-legged pair of moments

export interface HoofPlant { x: number; y: number; z: number; leg: number; speed: number }

export class Bull {
  readonly group = new THREE.Group();
  /** Raised, pitched and rolled by the gait; the model sits inside. */
  private readonly body = new THREE.Group();
  private readonly pose: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
  private readonly loco: Locomotion;
  private readonly neck?: THREE.Object3D;
  private readonly head?: THREE.Object3D;
  private readonly chest?: THREE.Object3D;
  private readonly tail: THREE.Object3D[];
  private look = 0;
  private lookPitch = 0;
  private nextGlance = 3;
  private glance = 0;
  /** The gait right now, for tests and the HUD: one of stand/walk/trot/canter/gallop is 1. */
  readonly weights = { stand: 1, walk: 0, trot: 0, canter: 0, gallop: 0 };
  private readonly fur: THREE.MeshPhysicalMaterial;
  /** Height at the withers, metres (measured from the mesh). */
  readonly withers: number;

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
    this.body.add(model);
    this.group.add(this.body);

    // the standing pose, once: two opposite moments of the walk, half and half
    const walk = asset.animations[0];
    const mixer = new THREE.AnimationMixer(model);
    for (const at of [STAND, STAND + 0.5]) {
      const a = mixer.clipAction(walk.clone());
      a.play(); a.weight = 0.5; a.timeScale = 0; a.time = (at % 1) * walk.duration;
    }
    mixer.update(0);
    model.traverse((o) => this.pose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
    // (stopping the mixer puts the rig back in its original pose, so the standing pose is
    // restored from the snapshot just taken)
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    this.restorePose();
    // the walk carries the body forward, so centre the standing bull on the group's origin from
    // its actual (skinned) shape, and stand it on y = 0
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.position.y -= box.min.y;
    this.pose.find(([o]) => o === model)![1].copy(model.position);

    const get = (n: string) => model.getObjectByName(n) ?? undefined;
    this.neck = get('base_m_neck_jnt_024');
    this.head = get('base_m_head_jnt_025');
    this.chest = get('qspine_m_spine3ik_jnt_011');
    this.tail = ['chain_m_tail1_jnt_040', 'chain_m_tail2_jnt_041', 'chain_m_tail3_jnt_042'].map((n) => get(n)).filter((o): o is THREE.Object3D => !!o);
    this.group.updateMatrixWorld(true);
    // height at the withers (the top of the back above the forelegs), for the gait table's scale
    const shoulder = model.getObjectByName('front_l_standardshoulder_jnt_014')!.getWorldPosition(new THREE.Vector3());
    let withers = 0;
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const v = new THREE.Vector3();
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
        if (Math.abs(v.z - shoulder.z) < 0.2 && Math.abs(v.x) < 0.2) withers = Math.max(withers, v.y);
      }
    });
    this.withers = withers;
    this.loco = new Locomotion(this.group, this.body, model, withers);
  }

  /** By moonlight the coat catches a cold sheen, so the black bull still reads on dark ground. */
  setNight(n: number) {
    this.fur.sheenColor.set(0x2c2622).lerp(SHEEN_NIGHT, THREE.MathUtils.smoothstep(n, 0.4, 1));
  }

  /** After moving the bull by hand (teleport): plant its hooves under it. */
  reset(ground: Ground) {
    this.restorePose();
    this.loco.reset(ground);
  }

  get gait() { return this.loco.gait; }
  /** Size relative to the reference animal of the gait table (for tests). */
  get gaitScale() { return this.loco.scale; }

  /**
   * One frame. The caller has already placed group (position on the ground, heading).
   * speed is the ground speed (m/s, negative when backing up), turn the turning rate (rad/s),
   * lookAt a world point it may glance at when slow, or null. onPlant is called for each hoof
   * that touches down, at the exact spot.
   */
  update(dt: number, time: number, speed: number, turn: number, lookAt: THREE.Vector3 | null, ground: Ground, onPlant: (p: HoofPlant) => void) {
    this.restorePose();
    this.group.updateMatrixWorld(true);
    const downs = this.loco.update(dt, speed, turn, ground);
    for (const d of downs) onPlant({ x: d.x, y: d.y, z: d.z, leg: d.leg, speed: Math.abs(speed) });
    const g = this.loco.gait, s = Math.abs(speed);
    const still = 1 - THREE.MathUtils.smoothstep(s, 0.05, 0.5);
    for (const k of Object.keys(this.weights) as (keyof Bull['weights'])[]) this.weights[k] = 0;
    this.weights[still > 0.5 ? 'stand' : g.name] = 1;
    this.idleLife(dt, time, still, lookAt, g.tail);
  }

  private restorePose() {
    for (const [o, p, q, s] of this.pose) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
    this.body.position.set(0, this.body.position.y, 0);
  }

  /** Breathing, tail flicks and head turns, stronger when standing still. */
  private idleLife(dt: number, time: number, still: number, lookAt: THREE.Vector3 | null, tailLift: number) {
    this.group.getWorldQuaternion(qBody);
    side.set(1, 0, 0).applyQuaternion(qBody);
    if (this.chest) turnBone(this.chest, up, 0, side, Math.sin(time * 1.6) * 0.025 * (0.4 + still));
    this.tail.forEach((b, i) => turnBone(b, up, Math.sin(time * 2.3 - i * 0.6) * 0.1 * still * (1 - tailLift), side, 0));
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
    // standing: a slow nod, head a little low; moving: the head nods with the stride (twice per
    // stride in the symmetric gaits, once in the canter and gallop) and stretches out at speed
    const g = this.loco.gait, ph = this.loco.phase * Math.PI * 2;
    const nod = g.name === 'walk' ? 0.06 * Math.sin(2 * ph) : g.name === 'trot' ? 0.025 * Math.sin(2 * ph) : 0.07 * Math.sin(ph + 1);
    const pitch = still * (0.08 * Math.sin(time * 0.45) - 0.06) + (1 - still) * (nod - 0.08 * g.tail);
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
