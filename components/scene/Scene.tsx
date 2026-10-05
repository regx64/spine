'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { computeLayout, slotPose, type TowerLayout } from '@/lib/geometry';
import { BASE_FOV, ladderFrame, rig, standPose, world } from '@/lib/rig';
import { useStore } from '@/lib/store';
import { placeHeld } from '@/lib/director';
import { Tower } from './Tower';
import { Books, InsertMarker, useInsert } from './Books';
import { SpineLabels } from './SpineLabels';
import { CameraRig } from './CameraRig';
import { OpenBook } from './OpenBook';

// 브라우저에서 확인할 때 쓰는 손잡이
if (typeof window !== 'undefined') Object.assign(window, { __spineGeo: { slotPose } });

export function useLayout() {
  const categories = useStore((s) => s.categories);
  const books = useStore((s) => s.books);
  const phase = useStore((s) => s.phase);
  const activeId = useStore((s) => s.activeBookId);
  // 옮기는 동안 든 책의 자리는 비워서 뒤 책이 당겨지게 한다
  const excluded = phase === 'moving' ? activeId : null;
  const layout = useMemo(
    () => computeLayout(categories, excluded ? books.filter((b) => b.id !== excluded) : books),
    [categories, books, excluded],
  );
  world.layout = layout;
  return layout;
}

export default function Scene() {
  const layout = useLayout();

  const onColumnClick = (col: number) => {
    const s = useStore.getState();
    if (s.phase !== 'moving') return;
    const c = layout.columns[col];
    if (!c.category) return s.showToast('빈 기둥에는 먼저 카테고리 이름을 붙이세요');
    useInsert.setState({ target: null });
    placeHeld(c.category.id, c.slots.length);
  };

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: BASE_FOV, near: 0.02, far: 60, position: [0, 0.68, 0] }}
      onPointerMissed={() => useInsert.setState({ target: null })}
    >
      <color attach="background" args={['#f3f1ec']} />
      <hemisphereLight args={['#ffffff', '#d9d1c3', 1.6]} />
      <directionalLight position={[0.6, 12, 0.4]} intensity={1.3} />
      <ambientLight intensity={0.25} />
      <CameraRig layout={layout} />
      <Tower layout={layout} onColumnClick={onColumnClick} />
      <Books layout={layout} />
      <SpineLabels layout={layout} />
      <InsertMarker layout={layout} />
      <Ladder layout={layout} />
      <OpenBook layout={layout} />
    </Canvas>
  );
}

/** 레일 사다리와 거기 달린 독서대 */
function Ladder({ layout }: { layout: TowerLayout }) {
  const ladder = useRef<THREE.Group>(null);
  const stand = useRef<THREE.Group>(null);
  const top = layout.maxHeight + 0.1;
  const rungs = useMemo(() => Array.from({ length: Math.ceil(top / 0.3) }, (_, i) => 0.25 + i * 0.3), [top]);

  useFrame((_, dt) => {
    const { theta, eye } = ladderFrame(layout);
    if (ladder.current) {
      ladder.current.position.set(eye.x, 0, eye.z);
      ladder.current.rotation.set(0, -theta, 0);
      // 발판은 눈높이 아래까지만 보인다
      ladder.current.children.forEach((c) => {
        if (c.userData.rung) c.visible = c.position.y < rig.y - 0.45;
      });
    }
    if (stand.current) {
      // 책이 없으면 독서대는 시야 아래로 접혀 내려간다
      const phase = useStore.getState().phase;
      const want = phase === 'idle' || phase === 'moving' ? 0 : 1;
      const k = 1 - Math.exp(-dt * 8);
      rig.stand += (want - rig.stand) * k;
      if (Math.abs(want - rig.stand) > 1e-3) world.invalidate();
      else rig.stand = want;
      const p = standPose(layout);
      p.pos.y -= (1 - rig.stand) * 0.35;
      stand.current.position.copy(p.pos);
      stand.current.quaternion.copy(p.quat);
      stand.current.visible = rig.stand > 0.01;
    }
  });

  const brass = <meshStandardMaterial color="#a9844a" metalness={0.55} roughness={0.4} />;
  const wood = <meshStandardMaterial color="#8a6a48" roughness={0.6} />;

  return (
    <>
      <group ref={ladder}>
        {/* 옆 레일은 눈 옆에 있어 고개를 돌려야 보인다 */}
        {[-0.36, 0.36].map((x) => (
          <mesh key={x} position={[x, top / 2, -0.06]}>
            <boxGeometry args={[0.03, top, 0.045]} />
            {wood}
          </mesh>
        ))}
        {rungs.map((y) => (
          <mesh key={y} position={[0, y, -0.06]} userData={{ rung: true }}>
            <boxGeometry args={[0.72, 0.022, 0.05]} />
            {wood}
          </mesh>
        ))}
      </group>
      <group ref={stand}>
        {/* 독서대 판과 아래 턱 */}
        <mesh position={[0, 0, -0.006]}>
          <boxGeometry args={[0.36, 0.27, 0.01]} />
          {wood}
        </mesh>
        <mesh position={[0, -0.14, 0.012]}>
          <boxGeometry args={[0.36, 0.012, 0.028]} />
          {brass}
        </mesh>
        <mesh position={[0, -0.12, -0.2]} rotation-x={0.6}>
          <cylinderGeometry args={[0.008, 0.008, 0.4, 8]} />
          {brass}
        </mesh>
      </group>
    </>
  );
}
