import gsap from 'gsap';
import type { ID } from './types';
import { useStore } from './store';
import { STAND_DOWN, STAND_FWD, rig, world } from './rig';
import { play } from './sound';

/**
 * 책 모션 연출. 모든 모션의 시간을 여기서 조절한다.
 * 책의 자세는 경로(path) 위의 실수 p로 정하고, 각 자세는 매 프레임 다시 계산한다
 * (사다리가 움직이거나 책장 배치가 바뀌어도 따라가도록).
 */
export type PoseId = 'shelf' | 'pulled' | 'stand' | 'held' | 'trash';

export const T = {
  pull: 0.3,
  toStand: 0.6,
  openCover: 0.6,
  flip: 0.5,
  jump: 0.8,
  shelve: 1.0,
  trash: 1.0,
  search: 1.0,
  skip: 0.2,
};

/** 독서대를 볼 때 시선을 내리는 각도 */
export const READ_PITCH = -Math.atan2(STAND_DOWN, STAND_FWD);

export const anim = {
  bookId: null as ID | null,
  path: ['shelf'] as PoseId[],
  p: 0,
  /** 0 닫힘 → 1 표지 열림 */
  cover: 0,
  fade: 1,
  flip: null as null | { from: number; to: number; t: number; sheets: number },
};

let tl: gsap.core.Timeline | null = null;
let onDone: (() => void) | null = null;

const store = () => useStore.getState();
const skip = () => store().settings.motionSkip;

function complete() {
  const cb = onDone;
  onDone = null;
  tl = null;
  cb?.();
  world.invalidate();
}

/** 모션 중에 한 번 더 클릭하면 즉시 끝 상태로 간다 */
export function finishNow() {
  if (!tl) return false;
  const t = tl;
  t.progress(1, true);
  t.kill();
  complete();
  return true;
}

export const isAnimating = () => tl !== null;

function start(done: () => void) {
  finishNow();
  onDone = done;
  tl = gsap.timeline({ onComplete: complete });
  return tl;
}

/** 모션 스킵: 0.2초 페이드 (반은 사라지고, 끝 상태로 바꾼 뒤 반은 나타남) */
function fadeSwap(t: gsap.core.Timeline, end: Partial<typeof anim>, endPitch: number, fadeIn = true) {
  t.to(anim, { fade: 0, duration: T.skip / 2, ease: 'none' })
    .set(anim, end)
    .set(rig, { pitchBias: endPitch })
    .to(anim, { fade: fadeIn ? 1 : 0, duration: T.skip / 2, ease: 'none' });
}

export function openBook(id: ID) {
  const s = store();
  if (s.phase !== 'idle') return;
  s.set({ phase: 'opening', activeBookId: id, spread: 0, hoverId: null, highlightId: null });
  void s.loadMemos(id);
  rig.frozen = true;
  Object.assign(anim, { bookId: id, path: ['shelf', 'pulled', 'stand'], p: 0, cover: 0, fade: 1, flip: null });
  const t = start(() => store().set({ phase: 'open' }));
  if (skip()) return fadeSwap(t, { p: 2, cover: 1 }, READ_PITCH);
  t.call(() => play('pull'))
    .to(anim, { p: 1, duration: T.pull, ease: 'power2.out' })
    .to(anim, { p: 2, duration: T.toStand, ease: 'power2.inOut' }, '>')
    .to(rig, { pitchBias: READ_PITCH, duration: T.pull + T.toStand, ease: 'power2.inOut' }, 0)
    .call(() => play('place'))
    .to(anim, { cover: 1, duration: T.openCover, ease: 'power2.inOut' });
}

/** 새 책은 책장을 거치지 않고 독서대에 펼쳐진 채로 시작한다 */
export function openNewBook(id: ID) {
  const s = store();
  s.set({ phase: 'opening', activeBookId: id, spread: 0, hoverId: null });
  rig.frozen = true;
  Object.assign(anim, { bookId: id, path: ['stand'], p: 0, cover: 1, fade: 0, flip: null });
  const t = start(() => store().set({ phase: 'open' }));
  t.to(rig, { pitchBias: READ_PITCH, duration: skip() ? T.skip : 0.5, ease: 'power2.inOut' }).to(
    anim,
    { fade: 1, duration: skip() ? T.skip : 0.4 },
    0,
  );
}

const release = () => {
  anim.bookId = null;
  anim.flip = null;
  rig.frozen = false;
  store().set({ phase: 'idle', activeBookId: null, flipping: false });
};

/** 닫고 제자리에 꽂기 */
export function closeToShelf() {
  const s = store();
  if (s.phase !== 'open' && s.phase !== 'opening') return;
  finishNow();
  s.set({ phase: 'closing', flipping: false });
  Object.assign(anim, { path: ['shelf', 'pulled', 'stand'], p: 2, flip: null });
  const t = start(release);
  if (skip()) return fadeSwap(t, { p: 0, cover: 0 }, 0);
  t.to(anim, { cover: 0, duration: 0.35, ease: 'power2.inOut' })
    .to(anim, { p: 1, duration: 0.4, ease: 'power2.inOut' })
    .call(() => play('shelve'))
    .to(anim, { p: 0, duration: 0.25, ease: 'power2.in' })
    .to(rig, { pitchBias: 0, duration: 0.65, ease: 'power2.inOut' }, 0.35);
}

/** 옮기기: 책을 든 채로 사다리를 움직일 수 있다 */
export function startMove() {
  const s = store();
  if (s.phase !== 'open') return;
  s.set({ phase: 'moving', flipping: false });
  Object.assign(anim, { path: ['held', 'stand'], p: 1, flip: null });
  const t = start(() => {
    rig.frozen = false;
  });
  if (skip()) return fadeSwap(t, { p: 0, cover: 0 }, 0);
  t.to(anim, { cover: 0, duration: 0.35, ease: 'power2.inOut' })
    .to(anim, { p: 0, duration: 0.45, ease: 'power2.inOut' })
    .to(rig, { pitchBias: 0, duration: 0.6, ease: 'power2.inOut' }, 0.2);
}

/** 든 책을 카테고리의 index 자리에 끼운다. 다른 기둥이면 카테고리가 바뀐다 */
export function placeHeld(categoryId: ID | null, index: number) {
  const s = store();
  if (s.phase !== 'moving' || !s.activeBookId) return;
  finishNow();
  if (categoryId) s.moveBook(s.activeBookId, categoryId, index);
  s.set({ phase: 'placing', hoverId: null });
  rig.frozen = true;
  Object.assign(anim, { path: ['shelf', 'held'], p: 1 });
  const t = start(release);
  if (skip()) return fadeSwap(t, { p: 0 }, 0);
  t.call(() => play('shelve'), [], 0.35).to(anim, { p: 0, duration: 0.6, ease: 'power2.inOut' }, 0);
}

export function cancelMove() {
  placeHeld(null, 0);
}

/** 버리기: 모션 뒤 휴지통에 보관 */
export function trashOpenBook() {
  const s = store();
  if (s.phase !== 'open' || !s.activeBookId) return;
  const id = s.activeBookId;
  s.set({ phase: 'trashing', flipping: false });
  Object.assign(anim, { path: ['trash', 'stand'], p: 1, flip: null });
  const t = start(() => {
    store().trashBook(id);
    release();
  });
  if (skip()) return fadeSwap(t, { p: 0, cover: 0 }, 0, false);
  t.to(anim, { cover: 0, duration: 0.3, ease: 'power2.inOut' })
    .call(() => play('trash'))
    .to(anim, { p: 0, duration: 0.7, ease: 'power2.in' })
    .to(anim, { fade: 0, duration: 0.3 }, '-=0.3')
    .to(rig, { pitchBias: 0, duration: 0.7 }, 0.3);
}

/** 펼친 양면을 target으로. 한 장이면 0.5초, 여러 장이면 0.8초 안에 */
export function flipTo(target: number, maxSpread: number) {
  const s = store();
  const to = Math.max(0, Math.min(maxSpread, target));
  if (s.phase !== 'open' || to === s.spread) return;
  finishNow();
  const from = s.spread;
  const count = Math.abs(to - from);
  if (skip()) {
    s.set({ spread: to });
    world.invalidate();
    return;
  }
  anim.flip = { from, to, t: 0, sheets: Math.min(count, 4) };
  s.set({ flipping: true });
  const t = start(() => {
    anim.flip = null;
    store().set({ spread: to, flipping: false });
  });
  play('flip');
  t.to(anim.flip, { t: 1, duration: count === 1 ? T.flip : T.jump, ease: count === 1 ? 'power1.inOut' : 'power2.inOut' });
}

/** 검색 결과로 사다리 이동 (1초 이내) */
export function driveTo(c: number, y: number, done?: () => void) {
  rig.driving = true;
  gsap.killTweensOf(rig, 'c,y');
  gsap.to(rig, {
    c,
    y,
    duration: skip() ? T.skip : T.search,
    ease: 'power2.inOut',
    onUpdate: () => {
      rig.tc = rig.c;
      rig.ty = rig.y;
    },
    onComplete: () => {
      rig.driving = false;
      done?.();
    },
  });
}

if (typeof window !== 'undefined') {
  Object.assign(window, { __spineAnim: anim });
  // 움직임이 있을 때만 다시 그린다
  gsap.ticker.add(() => {
    if (gsap.globalTimeline.getChildren(false, true, true).length) world.invalidate();
  });
}
