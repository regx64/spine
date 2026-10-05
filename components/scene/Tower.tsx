'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThreeEvent } from '@react-three/fiber';
import {
  BOARD,
  DIVIDER,
  PLINTH,
  ROW_H,
  SHELF_DEPTH,
  angleOf,
  dirOf,
  type TowerLayout,
} from '@/lib/geometry';
import { plateTexture, shelfShadeTexture } from '@/lib/textures';

const UP = new THREE.Vector3(0, 1, 0);

function placed(geo: THREE.BufferGeometry, pos: THREE.Vector3, rotY: number) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(pos);
  return geo.applyMatrix4(m);
}

/** 흰 원형 탑: 벽, 바닥, 기둥(선반·칸막이·뒤판), 레일. 레이아웃이 바뀔 때만 다시 만든다. */
export function Tower({
  layout,
  onColumnClick,
}: {
  layout: TowerLayout;
  onColumnClick?: (col: number, e: ThreeEvent<MouseEvent>) => void;
}) {
  const { n, R, side, columns, maxHeight } = layout;
  const shade = useMemo(() => shelfShadeTexture(), []);

  const { carcass, backs } = useMemo(() => {
    const boxes: THREE.BufferGeometry[] = [];
    const panels: THREE.BufferGeometry[] = [];
    const v = new THREE.Vector3();
    for (const col of columns) {
      const theta = angleOf(col.index, n);
      const d = dirOf(theta);
      const mid = R - SHELF_DEPTH / 2;
      // 받침
      boxes.push(placed(new THREE.BoxGeometry(side, PLINTH, SHELF_DEPTH), v.copy(d).multiplyScalar(mid).setY(PLINTH / 2), -theta));
      // 선반 (맨 위 판 포함)
      for (let r = 0; r <= col.rows; r++) {
        const y = PLINTH + r * ROW_H + BOARD / 2;
        boxes.push(placed(new THREE.BoxGeometry(side, BOARD, SHELF_DEPTH), v.copy(d).multiplyScalar(mid).setY(y), -theta));
      }
      // 뒤판(안쪽을 봄): 칸마다 위쪽이 어두운 음영이 반복되게 v를 칸 높이 단위로
      const h = col.height - PLINTH;
      const plane = new THREE.PlaneGeometry(side, h, 1, 1);
      const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (h / ROW_H));
      panels.push(placed(plane, v.copy(d).multiplyScalar(R - 0.001).setY(PLINTH + h / 2), -theta));
    }
    // 기둥 사이 칸막이 (꼭짓점마다, 양옆 중 높은 기둥 높이)
    const apothemScale = 1 / Math.cos(Math.PI / n);
    for (let i = 0; i < n; i++) {
      const a = angleOf(i + 0.5, n);
      const h = Math.max(columns[i].height, columns[(i + 1) % n].height);
      const d = dirOf(a);
      const geo = new THREE.BoxGeometry(DIVIDER, h, SHELF_DEPTH * apothemScale + 0.01);
      boxes.push(placed(geo, v.copy(d).multiplyScalar((R - SHELF_DEPTH / 2) * apothemScale).setY(h / 2), -a));
    }
    const carcass = mergeGeometries(boxes, false)!;
    const backs = mergeGeometries(panels, false)!;
    boxes.forEach((g) => g.dispose());
    panels.forEach((g) => g.dispose());
    return { carcass, backs };
  }, [columns, n, R, side]);

  useEffect(
    () => () => {
      carcass.dispose();
      backs.dispose();
    },
    [carcass, backs],
  );

  const wallR = R / Math.cos(Math.PI / n) + 0.03;
  const wallH = maxHeight + 3;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onColumnClick) return;
    const p = e.point;
    const theta = Math.atan2(p.x, -p.z);
    const col = (((Math.round(theta / ((Math.PI * 2) / n)) % n) + n) % n) as number;
    onColumnClick(col, e);
  };

  return (
    <group>
      {/* 벽 (천장 없음) */}
      <mesh position={[0, wallH / 2, 0]}>
        <cylinderGeometry args={[wallR, wallR, wallH, 64, 1, true]} />
        <meshStandardMaterial color="#f4f2ee" side={THREE.BackSide} roughness={0.95} />
      </mesh>
      {/* 바닥 */}
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[wallR, 64]} />
        <meshStandardMaterial color="#e6e1d8" roughness={0.9} />
      </mesh>
      <mesh geometry={carcass}>
        <meshStandardMaterial color="#f7f6f3" roughness={0.7} />
      </mesh>
      <mesh geometry={backs} onClick={handleClick}>
        <meshStandardMaterial map={shade} color="#ffffff" roughness={0.95} />
      </mesh>
      {/* 사다리가 걸리는 레일 */}
      {[maxHeight + 0.08, 0.04].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[R - SHELF_DEPTH - 0.05, 0.011, 8, 128]} />
          <meshStandardMaterial color="#b08d4f" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <Plates layout={layout} />
    </group>
  );
}

function Plates({ layout }: { layout: TowerLayout }) {
  return (
    <>
      {layout.columns.map((col) =>
        col.category ? <Plate key={col.index} layout={layout} col={col.index} name={col.category.name} /> : null,
      )}
    </>
  );
}

function Plate({ layout, col, name }: { layout: TowerLayout; col: number; name: string }) {
  const tex = useMemo(() => plateTexture(name), [name]);
  useEffect(() => () => tex.dispose(), [tex]);
  const theta = angleOf(col, layout.n);
  const d = dirOf(theta);
  const pos = d.clone().multiplyScalar(layout.R - SHELF_DEPTH - 0.002).setY(PLINTH / 2);
  const quat = new THREE.Quaternion().setFromAxisAngle(UP, -theta);
  return (
    <mesh position={pos} quaternion={quat}>
      <planeGeometry args={[0.2, 0.05]} />
      <meshStandardMaterial map={tex} roughness={0.55} metalness={0} />
    </mesh>
  );
}
