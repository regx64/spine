import * as THREE from 'three';
import type { Book, Category, ID } from './types';

// 치수는 모두 미터. 계획서의 출발값이고 1·2단계에서 보면서 조정한다.
export const BASE_COLUMNS = 12;
export const BASE_RADIUS = 1.2; // 기둥 면까지의 거리 (정다각형의 내접원 반지름)
export const RADIUS_STEP = 0.1; // 기둥 하나 늘 때마다
export const ROW_H = 0.3; // 칸 높이
export const MIN_ROWS = 6;
export const PLINTH = 0.1; // 맨 아래 받침 (명패 자리)
export const BOARD = 0.02; // 선반 두께
export const DIVIDER = 0.022; // 기둥 사이 칸막이
export const SHELF_DEPTH = 0.26;
export const BOOK_DEPTH = 0.15; // 모든 책의 앞뒤 길이 = 펼친 페이지 폭
export const BACK_GAP = 0.03;
export const CAMERA_DIST = 0.9; // 카메라와 벽 사이
export const MIN_THICK = 0.03;
export const MAX_THICK = 0.06;
export const FULL_CHARS = 20000; // 이 분량이면 최대 두께

export const thicknessFor = (chars: number) =>
  MIN_THICK + (MAX_THICK - MIN_THICK) * Math.min(1, Math.sqrt(Math.max(0, chars) / FULL_CHARS));

export const columnCount = (categories: Category[]) =>
  Math.max(BASE_COLUMNS, ...categories.map((c) => c.position + 1));

export const radiusFor = (n: number) => BASE_RADIUS + RADIUS_STEP * Math.max(0, n - BASE_COLUMNS);

/** 정다각형 한 변 = 기둥 폭 */
export const sideFor = (n: number, R: number) => 2 * R * Math.tan(Math.PI / n);

export const angleOf = (c: number, n: number) => (c * Math.PI * 2) / n;

/** 탑 중심에서 기둥 쪽을 보는 방향 (바깥쪽) */
export const dirOf = (theta: number, out = new THREE.Vector3()) =>
  out.set(Math.sin(theta), 0, -Math.cos(theta));

/** 벽을 바라볼 때 오른쪽 */
export const rightOf = (theta: number, out = new THREE.Vector3()) =>
  out.set(Math.cos(theta), 0, Math.sin(theta));

export interface BookSlot {
  book: Book;
  col: number;
  row: number;
  /** 기둥 왼쪽 끝에서 책 중심까지 (m) */
  x: number;
  /** 책 바닥 높이 */
  y: number;
  thickness: number;
  /** 사다리 좌표 (기둥 단위 실수) */
  c: number;
}

export interface ColumnLayout {
  index: number;
  category?: Category;
  rows: number;
  height: number;
  slots: BookSlot[];
}

export interface TowerLayout {
  n: number;
  R: number;
  side: number;
  inner: number; // 책을 놓을 수 있는 폭
  columns: ColumnLayout[];
  slots: Map<ID, BookSlot>;
  maxHeight: number;
}

export const rowBottom = (row: number) => PLINTH + row * ROW_H + BOARD;
export const columnHeight = (rows: number) => PLINTH + rows * ROW_H + BOARD;

/** 카테고리 안에서 아래 칸 왼쪽부터 순서대로 채운다. 빈틈은 두지 않는다. */
export function computeLayout(categories: Category[], books: Book[]): TowerLayout {
  const n = columnCount(categories);
  const R = radiusFor(n);
  const side = sideFor(n, R);
  // 다각형이라 안쪽으로 올수록 기둥이 좁아진다. 책 앞면 깊이에서 잰 폭만 쓴다
  const inner = sideFor(n, R - BACK_GAP - BOOK_DEPTH) - DIVIDER / Math.cos(Math.PI / n) - 0.012;
  const margin = (side - inner) / 2;
  const byCat = new Map<ID, Book[]>();
  for (const b of books) {
    if (b.deleted_at) continue;
    const arr = byCat.get(b.category_id) ?? [];
    arr.push(b);
    byCat.set(b.category_id, arr);
  }
  const catAt = new Map<number, Category>();
  for (const c of categories) catAt.set(c.position, c);

  const columns: ColumnLayout[] = [];
  const slots = new Map<ID, BookSlot>();
  let maxHeight = columnHeight(MIN_ROWS);
  for (let i = 0; i < n; i++) {
    const category = catAt.get(i);
    const list = category ? (byCat.get(category.id) ?? []).slice().sort((a, b) => a.position - b.position) : [];
    const colSlots: BookSlot[] = [];
    let row = 0;
    let cursor = 0;
    for (const book of list) {
      const t = thicknessFor(book.chars);
      if (cursor + t > inner && cursor > 0) {
        row++;
        cursor = 0;
      }
      const x = margin + cursor + t / 2;
      const slot: BookSlot = { book, col: i, row, x, y: rowBottom(row), thickness: t, c: 0 };
      const tOff = x - side / 2;
      slot.c = i + Math.atan2(tOff, R) / ((Math.PI * 2) / n);
      colSlots.push(slot);
      slots.set(book.id, slot);
      cursor += t + 0.002;
    }
    const used = list.length ? row + 1 : 0;
    const topFull = list.length > 0 && cursor + MAX_THICK > inner;
    const rows = Math.max(MIN_ROWS, used + (topFull ? 1 : 0));
    const height = columnHeight(rows);
    maxHeight = Math.max(maxHeight, height);
    columns.push({ index: i, category, rows, height, slots: colSlots });
  }
  return { n, R, side, inner, columns, slots, maxHeight };
}

/** 책장에 꽂힌 책의 중심과 축 (x: 벽 쪽, y: 위, z: 오른쪽) */
export function slotPose(layout: TowerLayout, slot: BookSlot, pull = 0) {
  const theta = angleOf(slot.col, layout.n);
  const d = dirOf(theta);
  const r = rightOf(theta);
  const depthCenter = layout.R - BACK_GAP - BOOK_DEPTH / 2 - pull;
  const pos = new THREE.Vector3()
    .addScaledVector(d, depthCenter)
    .addScaledVector(r, slot.x - layout.side / 2);
  pos.y = slot.y + slot.book.height / 2;
  const basis = new THREE.Matrix4().makeBasis(d.clone(), new THREE.Vector3(0, 1, 0), r.clone());
  const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
  return { pos, quat, d, r };
}

/** 사다리 좌표 c의 정면 기둥 */
export const frontColumn = (c: number, n: number) => ((Math.round(c) % n) + n) % n;

export const wrapC = (c: number, n: number) => ((c % n) + n) % n;

/** a에서 b로 가는 가장 짧은 사다리 좌표 */
export function nearestC(from: number, to: number, n: number) {
  let diff = wrapC(to - from, n);
  if (diff > n / 2) diff -= n;
  return from + diff;
}
