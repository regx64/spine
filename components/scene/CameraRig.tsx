'use client';

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type TowerLayout } from '@/lib/geometry';
import * as THREE from 'three';
import { BASE_FOV, MIN_EYE, PITCH_MAX, YAW_MAX, ladderFrame, readingFov, rig, world } from '@/lib/rig';
import { useStore } from '@/lib/store';

/** 사다리 속도 (기둥/초) */
const SPEED = 1.6;
const WHEEL = 0.0011;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export const maxEye = (layout: TowerLayout) => Math.max(MIN_EYE, layout.maxHeight - 0.2);

/** 항상 사다리 위에 있다. 휠: 위아래, A/D: 벽을 따라 좌우, 마우스: 시점 기울임 */
export function CameraRig({ layout }: { layout: TowerLayout }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    world.invalidate = invalidate;
    world.camera = camera;
  }, [invalidate, camera]);

  useEffect(() => {
    const blocked = () => rig.frozen || useStore.getState().panel !== null;
    const onWheel = (e: WheelEvent) => {
      if (blocked() || !(e.target instanceof HTMLCanvasElement)) return;
      rig.ty -= e.deltaY * WHEEL * (e.deltaMode === 1 ? 30 : 1);
      invalidate();
    };
    const setKey = (e: KeyboardEvent, down: boolean) => {
      if (down && (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey)) return;
      const k = e.code;
      if (k === 'KeyA' || k === 'ArrowLeft') rig.keys.left = down;
      else if (k === 'KeyD' || k === 'ArrowRight') rig.keys.right = down;
      else return;
      invalidate();
    };
    const onDown = (e: KeyboardEvent) => setKey(e, true);
    const onUp = (e: KeyboardEvent) => setKey(e, false);
    const onBlur = () => {
      rig.keys.left = rig.keys.right = false;
    };
    const onMouse = (e: MouseEvent) => {
      rig.mx = (e.clientX / window.innerWidth) * 2 - 1;
      rig.my = -((e.clientY / window.innerHeight) * 2 - 1);
      invalidate();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouse);
    };
  }, [invalidate]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const top = maxEye(layout);
    let active = false;
    if (!rig.frozen && !rig.driving) {
      const dir = (rig.keys.right ? 1 : 0) - (rig.keys.left ? 1 : 0);
      if (dir) {
        rig.tc += dir * SPEED * dt;
        active = true;
      }
    }
    rig.ty = Math.min(top, Math.max(MIN_EYE, rig.ty));
    if (!rig.driving) {
      const k = 1 - Math.exp(-dt * 9);
      rig.c += (rig.tc - rig.c) * k;
      rig.y += (rig.ty - rig.y) * k;
      if (Math.abs(rig.tc - rig.c) > 1e-4 || Math.abs(rig.ty - rig.y) > 1e-4) active = true;
      else {
        rig.c = rig.tc;
        rig.y = rig.ty;
      }
    } else active = true;

    // 책을 펼친 동안에는 시선이 덜 흔들린다
    const lookScale = rig.frozen ? 0.25 : 1;
    const kl = 1 - Math.exp(-dt * 6);
    const tx = rig.mx * lookScale;
    const ty = rig.my * lookScale;
    rig.lx += (tx - rig.lx) * kl;
    rig.ly += (ty - rig.ly) * kl;
    if (Math.abs(tx - rig.lx) > 1e-4 || Math.abs(ty - rig.ly) > 1e-4) active = true;

    const { theta, eye } = ladderFrame(layout);
    camera.position.copy(eye);
    camera.rotation.set(rig.ly * PITCH_MAX + rig.pitchBias, -theta - rig.lx * YAW_MAX, 0, 'YXZ');
    const cam = camera as THREE.PerspectiveCamera;
    const fov = BASE_FOV + (readingFov(cam.aspect) - BASE_FOV) * rig.stand;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    if (active) invalidate();
  });

  return null;
}
