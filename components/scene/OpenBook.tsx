'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BOOK_DEPTH, slotPose, thicknessFor, type TowerLayout } from '@/lib/geometry';
import { anim, flipTo, type PoseId } from '@/lib/director';
import { heldPose, standPose, trashPose, world } from '@/lib/rig';
import { useStore } from '@/lib/store';
import { bookPages, PAGE, type BookPages } from '@/lib/paginate';
import { bakePage, coverTexture, pagePx, paperTexture, spineTexture } from '@/lib/textures';
import type { Book, Memo } from '@/lib/types';
import { PageView, claims } from './PageViews';

const COVER = 0.003;
const OVERHANG = 0.004;
const EMPTY: Memo[] = [];

type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion };

function poseFor(id: PoseId, layout: TowerLayout, book: Book, T: number): Pose {
  const slot = layout.slots.get(book.id);
  switch (id) {
    case 'shelf':
    case 'pulled':
      if (slot) return slotPose(layout, slot, id === 'pulled' ? 0.24 : 0);
      return heldPose(layout);
    case 'stand': {
      const p = standPose(layout);
      // 독서대 면에 닫힌 책의 바닥이 닿게 두께 절반만큼 띄운다
      p.pos.add(new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat).multiplyScalar(T / 2 + 0.004));
      return p;
    }
    case 'held':
      return heldPose(layout);
    case 'trash':
      return trashPose(layout);
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export function OpenBook({ layout }: { layout: TowerLayout }) {
  const activeId = useStore((s) => s.activeBookId);
  const book = useStore((s) => s.books.find((b) => b.id === s.activeBookId));
  if (!activeId || !book) return null;
  return <BookModel key={book.id} book={book} layout={layout} />;
}

function BookModel({ book, layout }: { book: Book; layout: TowerLayout }) {
  const memos = useStore((s) => s.memos[book.id]);
  const spread = useStore((s) => s.spread);
  const flipping = useStore((s) => s.flipping);
  const phase = useStore((s) => s.phase);
  const focusRequest = useStore((s) => s.focusRequest);

  const list = memos ?? EMPTY;
  const pages: BookPages = useMemo(() => bookPages(list), [list]);
  const W = BOOK_DEPTH;
  const H = book.height;
  const T = thicknessFor(book.chars);
  const block = T - 2 * COVER;
  const frac = pages.pages.length > 2 ? (spread * 2) / pages.pages.length : 0;
  const tL = Math.max(0.0012, block * frac);
  const tR = Math.max(0.0012, block - tL);

  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const leftHalf = useRef<THREE.Group>(null);
  const spine = useRef<THREE.Group>(null);
  const sheets = useRef<(THREE.Mesh | null)[]>([]);
  const backs = useRef<(THREE.Mesh | null)[]>([]);

  // 넘김이 펼친 양면 범위를 벗어나면 맞춘다 (메모를 지운 경우 등)
  useEffect(() => {
    if (spread > pages.spreads - 1) useStore.getState().set({ spread: Math.max(0, pages.spreads - 1) });
  }, [spread, pages.spreads]);

  // 다른 양면에 있는 메모로 커서를 옮겨야 하면 그 양면으로 넘긴다
  useEffect(() => {
    if (!focusRequest || phase !== 'open' || flipping) return;
    const idx = pages.pages.findIndex((p) => claims(p, focusRequest, list));
    if (idx < 0) return;
    const target = Math.floor(idx / 2);
    if (target !== spread) flipTo(target, pages.spreads - 1);
  }, [focusRequest, phase, flipping, pages, spread, list]);

  const cover = useMemo(() => coverTexture(book), [book]);
  const spineTex = useMemo(() => spineTexture(book, T), [book, T]);
  const paper = useMemo(() => paperTexture(), []);
  useEffect(() => () => (cover.dispose(), spineTex.dispose(), paper.dispose()), [cover, spineTex, paper]);

  // 넘기는 순간에만 양면의 글자를 그림으로 굽는다
  const baked = useMemo(() => {
    const f = anim.flip;
    if (!flipping || !f) return null;
    const bake = (i: number) => bakePage(pages.pages[i], i, book, list, pages.memoFirstPage);
    const fwd = f.to > f.from;
    const staticL = bake(fwd ? 2 * f.from : 2 * f.to);
    const staticR = bake(fwd ? 2 * f.to + 1 : 2 * f.from + 1);
    const sheetTex: { a: THREE.Texture; b: THREE.Texture }[] = [];
    for (let k = 0; k < f.sheets; k++) {
      // a: 오른쪽에 누워 있을 때 위를 보는 면, b: 왼쪽에 누웠을 때 위를 보는 면
      const last = k === f.sheets - 1;
      const base = fwd ? f.from + k : f.from - k - 1;
      const sa = fwd ? (k === 0 ? 2 * f.from + 1 : 2 * base + 1) : last ? 2 * f.to + 1 : 2 * base + 1;
      const sb = fwd ? (last ? 2 * f.to : 2 * (base + 1)) : k === 0 ? 2 * f.from : 2 * (base + 1);
      const b = bake(sb);
      b.repeat.x = -1;
      b.offset.x = 1;
      sheetTex.push({ a: bake(sa), b });
    }
    return { staticL, staticR, sheetTex, fwd, sheets: f.sheets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipping]);
  useEffect(
    () => () => {
      if (!baked) return;
      baked.staticL.dispose();
      baked.staticR.dispose();
      baked.sheetTex.forEach((s) => (s.a.dispose(), s.b.dispose()));
    },
    [baked],
  );

  const sheetGeos = useMemo(
    () =>
      Array.from({ length: 4 }, () => {
        const g = new THREE.PlaneGeometry(W, H, 24, 1);
        g.translate(W / 2, 0, 0);
        return g;
      }),
    [W, H],
  );
  useEffect(() => () => sheetGeos.forEach((g) => g.dispose()), [sheetGeos]);
  const flat = useMemo(() => sheetGeos.map((g) => (g.getAttribute('position').array as Float32Array).slice()), [sheetGeos]);

  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const o = outer.current;
    if (!o || !inner.current || !leftHalf.current || !spine.current) return;
    // 경로 위의 자세
    const path = anim.path;
    const p = Math.max(0, Math.min(path.length - 1, anim.p));
    const i = Math.min(path.length - 2, Math.floor(p));
    if (path.length === 1) {
      const a = poseFor(path[0], layout, book, T);
      o.position.copy(a.pos);
      o.quaternion.copy(a.quat);
    } else {
      const f = p - i;
      const a = poseFor(path[i], layout, book, T);
      const b = poseFor(path[i + 1], layout, book, T);
      tmpA.lerpVectors(a.pos, b.pos, f);
      const lift = (path[i] === 'pulled' && path[i + 1] === 'stand') || (path[i] === 'stand' && path[i + 1] === 'pulled');
      if (lift) tmpA.y += Math.sin(Math.PI * f) * 0.06;
      o.position.copy(tmpA);
      tmpQ.slerpQuaternions(a.quat, b.quat, f);
      o.quaternion.copy(tmpQ);
    }
    // 표지 열림: 왼쪽 반이 책등을 축으로 넘어가고, 책의 기준점이 책 가운데에서 책등으로 옮겨진다
    const c = smooth(Math.max(0, Math.min(1, anim.cover)));
    leftHalf.current.rotation.y = (1 - c) * Math.PI;
    spine.current.rotation.y = (1 - c) * (Math.PI / 2);
    const closedZ = (tR - tL) / 2;
    const openZ = -T / 2 + Math.max(tL, tR) + COVER;
    inner.current.position.set(-W / 2 * (1 - c), 0, closedZ + (openZ - closedZ) * c);

    // 투명도 (모션 스킵 페이드, 버리기)
    const want = anim.fade < 0.999;
    o.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (m.transparent !== want) {
          m.transparent = want;
          m.needsUpdate = true;
        }
        m.opacity = anim.fade;
      }
    });

    // 휘는 종이
    const f = anim.flip;
    for (let k = 0; k < 4; k++) {
      const front = sheets.current[k];
      const back = backs.current[k];
      if (!front || !back) continue;
      const on = !!f && !!baked && k < baked.sheets;
      front.visible = back.visible = on;
      if (!on || !f) continue;
      const n = baked!.sheets;
      const stagger = n > 1 ? 0.45 / (n - 1) : 0;
      const tk = Math.max(0, Math.min(1, (f.t - k * stagger) / (1 - (n - 1) * stagger)));
      const u = baked!.fwd ? tk : 1 - tk;
      curl(sheetGeos[k], flat[k], W, u, baked!.fwd ? -1 : 1, 0.0006 * (k + 1));
    }
  });

  const overlays = phase === 'open' && !flipping && !!memos;
  const { w: pxW, h: pxH } = pagePx(H);
  const dist = PAGE.M_PER_PX * 400;
  const leftIdx = spread * 2;
  const rightIdx = leftIdx + 1;
  const staticLeft = baked?.staticL ?? paper;
  const staticRight = baked?.staticR ?? paper;

  return (
    <group ref={outer}>
      <group ref={inner}>
        {/* 오른쪽 반: 뒤표지 + 페이지 묶음 */}
        <mesh position={[W / 2 + OVERHANG / 2, 0, -tR - COVER / 2]}>
          <boxGeometry args={[W + OVERHANG, H + OVERHANG * 2, COVER]} />
          <meshStandardMaterial color={book.color} roughness={0.75} />
        </mesh>
        <mesh position={[W / 2, 0, -tR / 2]}>
          <boxGeometry args={[W - 0.001, H, tR]} />
          <meshStandardMaterial color="#efe7d4" roughness={0.9} />
        </mesh>
        <mesh position={[W / 2, 0, 0.0002]}>
          <planeGeometry args={[W - 0.001, H]} />
          <meshStandardMaterial map={staticRight} roughness={0.95} />
        </mesh>

        {/* 책등: 닫히면 세로로 서고 펼치면 아래에 눕는다 */}
        <group ref={spine} position={[0, 0, -tR - COVER]}>
          <mesh position={[-T / 2, 0, -COVER / 2]}>
            <boxGeometry args={[T, H + OVERHANG * 2, COVER]} />
            <meshStandardMaterial attach="material-0" color={book.color} />
            <meshStandardMaterial attach="material-1" color={book.color} />
            <meshStandardMaterial attach="material-2" color={book.color} />
            <meshStandardMaterial attach="material-3" color={book.color} />
            <meshStandardMaterial attach="material-4" color={book.color} />
            <meshStandardMaterial attach="material-5" map={spineTex} roughness={0.7} />
          </mesh>
        </group>

        {/* 왼쪽 반: 앞표지 + 페이지 묶음. 펼친 상태(x<0)로 만들고 책등을 축으로 돌린다 */}
        <group ref={leftHalf}>
          <mesh position={[-W / 2 - OVERHANG / 2, 0, -tL - COVER / 2]}>
            <boxGeometry args={[W + OVERHANG, H + OVERHANG * 2, COVER]} />
            <meshStandardMaterial attach="material-0" color={book.color} />
            <meshStandardMaterial attach="material-1" color={book.color} />
            <meshStandardMaterial attach="material-2" color={book.color} />
            <meshStandardMaterial attach="material-3" color={book.color} />
            <meshStandardMaterial attach="material-4" color={book.color} />
            <meshStandardMaterial attach="material-5" map={cover} roughness={0.7} />
          </mesh>
          <mesh position={[-W / 2, 0, -tL / 2]}>
            <boxGeometry args={[W - 0.001, H, tL]} />
            <meshStandardMaterial color="#efe7d4" roughness={0.9} />
          </mesh>
          <mesh position={[-W / 2, 0, 0.0002]}>
            <planeGeometry args={[W - 0.001, H]} />
            <meshStandardMaterial map={staticLeft} roughness={0.95} />
          </mesh>
        </group>

        {/* 넘어가는 종이 (앞면 + 뒷면) */}
        {sheetGeos.map((g, k) => (
          <group key={k}>
            <mesh ref={(m) => void (sheets.current[k] = m)} geometry={g} visible={false}>
              <meshStandardMaterial map={baked?.sheetTex[k]?.a ?? paper} side={THREE.FrontSide} roughness={0.95} />
            </mesh>
            <mesh ref={(m) => void (backs.current[k] = m)} geometry={g} visible={false}>
              <meshStandardMaterial map={baked?.sheetTex[k]?.b ?? paper} side={THREE.BackSide} roughness={0.95} />
            </mesh>
          </group>
        ))}

        {/* 화면에서는 기울인 HTML 입력창을 페이지에 겹친다 */}
        {overlays && (
          <>
            <Html transform distanceFactor={dist} position={[-W / 2, 0, 0.0008]} zIndexRange={[20, 0]}>
              <PageView
                book={book}
                memos={list}
                pages={pages}
                index={leftIdx}
                side="left"
                width={pxW}
                height={pxH}
              />
            </Html>
            <Html transform distanceFactor={dist} position={[W / 2, 0, 0.0008]} zIndexRange={[20, 0]}>
              <PageView
                book={book}
                memos={list}
                pages={pages}
                index={rightIdx}
                side="right"
                width={pxW}
                height={pxH}
              />
            </Html>
          </>
        )}
      </group>
    </group>
  );
}

/**
 * 종이를 책등(x=0)을 축으로 넘긴다. u: 0 오른쪽에 누움 → 1 왼쪽에 누움.
 * 끝이 뒤처지며 휘게: 각도 φ(s) = πu + lag·sin(πu)·(s/W)
 */
function curl(geo: THREE.BufferGeometry, flat: Float32Array, W: number, u: number, lagSign: number, lift: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const base = Math.PI * u;
  const lag = lagSign * 1.1 * Math.sin(Math.PI * u);
  for (let i = 0; i < pos.count; i++) {
    const s = flat[i * 3];
    const y = flat[i * 3 + 1];
    // 호를 따라 적분 (구간 16개)
    let x = 0;
    let z = 0;
    const steps = 16;
    const ds = s / steps;
    for (let k = 0; k < steps; k++) {
      const sm = (k + 0.5) * ds;
      const phi = Math.min(Math.PI, Math.max(0, base + lag * (sm / W)));
      x += Math.cos(phi) * ds;
      z += Math.sin(phi) * ds;
    }
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z + lift;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  world.invalidate();
}
