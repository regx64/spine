'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BOOK_DEPTH, slotPose, wrapC, type BookSlot, type TowerLayout } from '@/lib/geometry';
import { rig, world } from '@/lib/rig';
import { useStore } from '@/lib/store';
import { spineTexture } from '@/lib/textures';
import { pulls } from './Books';

// 책등 제목 텍스처는 화면 근처의 책만 만들고, 오래 안 쓴 것은 버린다
const cache = new Map<string, THREE.CanvasTexture>();
const CACHE_MAX = 400;

function textureFor(slot: BookSlot) {
  const b = slot.book;
  const key = `${b.id}|${b.title}|${b.color}|${slot.thickness.toFixed(3)}|${b.height}`;
  let tex = cache.get(key);
  if (tex) {
    cache.delete(key);
    cache.set(key, tex);
    return tex;
  }
  tex = spineTexture(b, slot.thickness);
  cache.set(key, tex);
  if (cache.size > CACHE_MAX) {
    const [oldKey, old] = cache.entries().next().value!;
    cache.delete(oldKey);
    old.dispose();
  }
  return tex;
}

const plane = new THREE.PlaneGeometry(1, 1);

export function SpineLabels({ layout }: { layout: TowerLayout }) {
  const [visible, setVisible] = useState<BookSlot[]>([]);
  const last = useRef({ c: NaN, y: NaN, layout: null as TowerLayout | null });

  useFrame(() => {
    const l = last.current;
    if (l.layout === layout && Math.abs(rig.c - l.c) < 0.25 && Math.abs(rig.y - l.y) < 0.15) return;
    l.c = rig.c;
    l.y = rig.y;
    l.layout = layout;
    const span = Math.max(2.6, layout.n * 0.24); // 기둥 단위로 앞뒤 이만큼
    const out: BookSlot[] = [];
    for (const s of layout.slots.values()) {
      let dc = wrapC(s.c - rig.c, layout.n);
      if (dc > layout.n / 2) dc -= layout.n;
      if (Math.abs(dc) > span) continue;
      if (Math.abs(s.y + s.book.height / 2 - rig.y) > 1.5) continue;
      out.push(s);
    }
    setVisible(out);
  });

  return (
    <group>
      {visible.map((s) => (
        <SpineLabel key={s.book.id} slot={s} layout={layout} />
      ))}
    </group>
  );
}

function SpineLabel({ slot, layout }: { slot: BookSlot; layout: TowerLayout }) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => textureFor(slot), [slot]);
  const hidden = useStore((s) => s.phase !== 'idle' && s.activeBookId === slot.book.id);
  const hot = useStore((s) => s.hoverId === slot.book.id || s.highlightId === slot.book.id);

  const place = (pull: number) => {
    const m = ref.current;
    if (!m) return;
    const { pos, quat, d, r } = slotPose(layout, slot, pull);
    pos.addScaledVector(d, -(BOOK_DEPTH / 2 + 0.0007));
    m.position.copy(pos);
    // 평면의 x → 오른쪽, y → 위, z → 안쪽(카메라 쪽)
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, new THREE.Vector3(0, 1, 0), d.clone().negate()));
    m.scale.set(slot.thickness * 0.985, slot.book.height * 0.985, 1);
    void quat;
  };

  useEffect(() => {
    place(pulls.get(slot.book.id) ?? 0);
    world.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, layout]);

  useFrame(() => {
    const p = pulls.get(slot.book.id) ?? 0;
    if (ref.current && ref.current.userData.pull !== p) {
      ref.current.userData.pull = p;
      place(p);
    }
  });

  return (
    <mesh ref={ref} geometry={plane} visible={!hidden}>
      <meshStandardMaterial
        map={tex}
        roughness={0.7}
        emissive="#ffffff"
        emissiveMap={tex}
        emissiveIntensity={hot ? 0.35 : 0}
      />
    </mesh>
  );
}
