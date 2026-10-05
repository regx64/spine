import * as THREE from 'three';
import type { TowerLayout } from './geometry';
import { CAMERA_DIST, angleOf, dirOf, rightOf } from './geometry';

/**
 * 사다리 상태. 매 프레임 바뀌므로 React 상태가 아니라 모듈 변수로 둔다.
 * c는 사다리가 서 있는 기둥 좌표(실수), y는 눈높이.
 */
export const rig = {
  c: 0,
  y: 0.68,
  tc: 0,
  ty: 0.68,
  /** 커서 위치 (-1..1) */
  mx: 0,
  my: 0,
  /** 부드럽게 따라가는 시선 */
  lx: 0,
  ly: 0,
  pitchBias: 0,
  keys: { left: false, right: false },
  /** 책을 펼친 동안 사다리는 멈춘다 */
  frozen: false,
  /** 검색 이동 중이면 tc/ty 대신 c/y를 직접 움직인다 */
  driving: false,
  /** 독서대: 0 접혀 내려감 → 1 올라와 있음 */
  stand: 0,
};

export const YAW_MAX = THREE.MathUtils.degToRad(35);
export const PITCH_MAX = THREE.MathUtils.degToRad(20);
export const MIN_EYE = 0.6;
/** 독서대 위치: 눈에서 앞으로, 아래로 (약 30cm, 30° 아래) */
export const STAND_FWD = 0.26;
export const STAND_DOWN = 0.15;
export const BASE_FOV = 70;

/** 책을 읽을 때는 펼친 양면이 화면에 꽉 차도록 화각을 좁힌다 (몸을 숙이는 느낌) */
export function readingFov(aspect: number) {
  const D = Math.hypot(STAND_FWD, STAND_DOWN);
  const halfV = Math.atan(0.165 / D);
  const halfH = Math.atan(0.2 / D);
  const vFromH = Math.atan(Math.tan(halfH) / aspect);
  return THREE.MathUtils.radToDeg(2 * Math.max(halfV, vFromH));
}

export const world = {
  layout: null as TowerLayout | null,
  camera: null as THREE.Camera | null,
  invalidate: () => {},
};

/** 시선 기울기를 뺀 사다리의 눈 위치와 축 */
export function ladderFrame(layout: TowerLayout) {
  const theta = angleOf(rig.c, layout.n);
  const d = dirOf(theta);
  const r = rightOf(theta);
  const eye = d.clone().multiplyScalar(layout.R - CAMERA_DIST);
  eye.y = rig.y;
  return { theta, d, r, eye };
}

const UP = new THREE.Vector3(0, 1, 0);

/** 사다리에 달린 독서대 위에 놓인 책의 자세. x: 오른쪽, y: 책등 방향(위쪽), z: 눈 쪽 */
export function standPose(layout: TowerLayout) {
  const { d, r, eye } = ladderFrame(layout);
  const center = eye.clone().addScaledVector(d, STAND_FWD).addScaledVector(UP, -STAND_DOWN);
  const z = eye.clone().sub(center).normalize();
  const x = r.clone();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return { pos: center, quat };
}

/** 옮기는 동안 손에 든 책 (책등이 보이게 세움) */
export function heldPose(layout: TowerLayout) {
  const { d, r, eye } = ladderFrame(layout);
  const pos = eye.clone().addScaledVector(d, 0.32).addScaledVector(r, 0.17).addScaledVector(UP, -0.2);
  const yaw = new THREE.Quaternion().setFromAxisAngle(UP, -0.5);
  const quat = new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(d.clone(), UP.clone(), r.clone()))
    .premultiply(yaw);
  return { pos, quat };
}

/** 버릴 때 독서대 아래로 떨어지는 자리 */
export function trashPose(layout: TowerLayout) {
  const { pos, quat } = standPose(layout);
  const { d } = ladderFrame(layout);
  const p = pos.clone().addScaledVector(d, 0.15);
  p.y -= 1.4;
  const tumble = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.4, 0.8));
  return { pos: p, quat: quat.clone().multiply(tumble) };
}

if (typeof window !== 'undefined') Object.assign(window, { __spine: { rig, world } });
