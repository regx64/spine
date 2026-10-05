'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { create } from 'zustand';
import { BOOK_DEPTH, rowBottom, slotPose, type BookSlot, type TowerLayout } from '@/lib/geometry';
import { useStore } from '@/lib/store';
import { openBook, placeHeld } from '@/lib/director';
import { world } from '@/lib/rig';
import type { ID } from '@/lib/types';

/** 책에 커서를 올리면 튀어나오는 거리 */
const HOVER_PULL = 0.035;

/** 책장 위 책들이 지금 튀어나와 있는 거리 (책등 제목도 같이 움직인다) */
export const pulls = new Map<ID, number>();

export interface InsertTarget {
  categoryId: ID;
  index: number;
  col: number;
  row: number;
  x: number;
  height: number;
}

export const useInsert = create<{ target: InsertTarget | null }>(() => ({ target: null }));

function bookGeometry() {
  // 1×1×1 상자를 책마다 (앞뒤 길이, 높이, 두께)로 늘린다. x+: 벽 쪽(책배), x-: 책등, ±z: 표지
  const g = new THREE.BoxGeometry(1, 1, 1);
  const count = g.getAttribute('position').count;
  const color = new Float32Array(count * 3);
  const mask = new Float32Array(count);
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (면마다 4개 꼭짓점)
  const cover = [false, true, false, false, true, true];
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      if (cover[face]) color.set([1, 1, 1], i * 3);
      else color.set([0.95, 0.91, 0.82], i * 3);
      mask[i] = cover[face] ? 1 : 0;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('coverMask', new THREE.BufferAttribute(mask, 1));
  return g;
}

function bookMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float coverMask;')
      .replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, coverMask);');
  };
  return m;
}

const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** 책은 인스턴싱으로 한 번에 그린다 */
export function Books({ layout }: { layout: TowerLayout }) {
  const slots = useMemo(() => [...layout.slots.values()], [layout]);
  const capacity = useMemo(() => Math.max(64, 2 ** Math.ceil(Math.log2(slots.length + 1))), [slots.length]);
  const geo = useMemo(bookGeometry, []);
  const mat = useMemo(bookMaterial, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const phase = useStore((s) => s.phase);
  const activeId = useStore((s) => s.activeBookId);
  const hoverId = useStore((s) => s.hoverId);
  const highlightId = useStore((s) => s.highlightId);

  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);

  const hiddenId = phase === 'idle' ? null : activeId;

  const writeMatrix = (i: number, slot: BookSlot) => {
    const mesh = ref.current!;
    if (slot.book.id === hiddenId) {
      mesh.setMatrixAt(i, HIDDEN);
      return;
    }
    const { pos, quat } = slotPose(layout, slot, pulls.get(slot.book.id) ?? 0);
    tmpM.compose(pos, quat, tmpS.set(BOOK_DEPTH, slot.book.height, slot.thickness));
    mesh.setMatrixAt(i, tmpM);
  };

  const writeColor = (i: number, slot: BookSlot) => {
    tmpC.set(slot.book.color);
    if (slot.book.id === hoverId || slot.book.id === highlightId) tmpC.lerp(new THREE.Color('#ffffff'), 0.18);
    ref.current!.setColorAt(i, tmpC);
  };

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    slots.forEach((s, i) => {
      writeMatrix(i, s);
      writeColor(i, s);
    });
    mesh.count = slots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    world.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, capacity, hiddenId, hoverId, highlightId]);

  // 커서를 올린 책이 살짝 튀어나오고 제자리로 돌아가는 움직임
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    let moved = false;
    slots.forEach((s, i) => {
      const id = s.book.id;
      const target = id === hoverId || id === highlightId ? HOVER_PULL : 0;
      const cur = pulls.get(id) ?? 0;
      if (Math.abs(cur - target) < 1e-4) {
        if (cur !== target) {
          if (target) pulls.set(id, target);
          else pulls.delete(id);
          writeMatrix(i, s);
          moved = true;
        }
        return;
      }
      pulls.set(id, cur + (target - cur) * (1 - Math.exp(-dt * 18)));
      writeMatrix(i, s);
      moved = true;
    });
    if (moved) {
      mesh.instanceMatrix.needsUpdate = true;
      world.invalidate();
    }
  });

  const slotAt = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? undefined : slots[e.instanceId];

  const insertFor = (slot: BookSlot, point: THREE.Vector3): InsertTarget | null => {
    const col = layout.columns[slot.col];
    if (!col.category) return null;
    const { pos, r } = slotPose(layout, slot);
    const after = point.clone().sub(pos).dot(r) > 0;
    const idx = col.slots.indexOf(slot) + (after ? 1 : 0);
    const x = after ? slot.x + slot.thickness / 2 + 0.001 : slot.x - slot.thickness / 2 - 0.001;
    return { categoryId: col.category.id, index: idx, col: slot.col, row: slot.row, x, height: 0.26 };
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const slot = slotAt(e);
    if (!slot) return;
    const s = useStore.getState();
    if (s.phase === 'idle') {
      if (s.hoverId !== slot.book.id) s.set({ hoverId: slot.book.id });
      document.body.style.cursor = 'pointer';
    } else if (s.phase === 'moving') {
      useInsert.setState({ target: insertFor(slot, e.point) });
      document.body.style.cursor = 'copy';
    }
  };

  const onOut = () => {
    const s = useStore.getState();
    if (s.hoverId) s.set({ hoverId: null });
    document.body.style.cursor = '';
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const slot = slotAt(e);
    if (!slot) return;
    const s = useStore.getState();
    if (s.phase === 'idle') {
      if (slot.book.id.startsWith('stress-')) return s.showToast('테스트용 책은 열 수 없습니다');
      document.body.style.cursor = '';
      openBook(slot.book.id);
    } else if (s.phase === 'moving') {
      const t = insertFor(slot, e.point);
      if (!t) return s.showToast('빈 기둥에는 먼저 카테고리 이름을 붙이세요');
      useInsert.setState({ target: null });
      placeHeld(t.categoryId, t.index);
    }
  };

  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[geo, mat, capacity]}
      frustumCulled={false}
      onPointerMove={onMove}
      onPointerOut={onOut}
      onClick={onClick}
    />
  );
}

/** 옮기는 중 끼워질 자리를 보여주는 막대 */
export function InsertMarker({ layout }: { layout: TowerLayout }) {
  const target = useInsert((s) => s.target);
  const phase = useStore((s) => s.phase);
  useEffect(() => world.invalidate(), [target, phase]);
  if (!target || phase !== 'moving') return null;
  const fake: BookSlot = {
    book: { height: target.height } as BookSlot['book'],
    col: target.col,
    row: target.row,
    x: target.x,
    y: rowBottom(target.row),
    thickness: 0.004,
    c: 0,
  };
  const { pos, quat } = slotPose(layout, fake, 0.02);
  return (
    <mesh position={pos} quaternion={quat}>
      <boxGeometry args={[BOOK_DEPTH + 0.02, target.height, 0.006]} />
      <meshBasicMaterial color="#e0a83a" transparent opacity={0.85} />
    </mesh>
  );
}
