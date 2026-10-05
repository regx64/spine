import type { ID, Memo } from './types';

/**
 * 페이지 나눔. 글꼴·글자 크기·페이지 크기를 고정해 두고, 입력창과 같은 스타일의
 * 보이지 않는 요소로 줄 단위로 재서 나눈다. 경계는 저장하지 않고 매번 다시 계산한다.
 */
export const PAGE = {
  /** 1px = 0.4mm. 글 상자 300×420px = 12×16.8cm */
  M_PER_PX: 0.0004,
  W: 300,
  LINES: 21,
  LINE_H: 20,
  FONT_SIZE: 13.5,
  FONT: '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  TOC_FIRST: 13,
  TOC_OTHER: 18,
};
export const PAGE_H = PAGE.LINES * PAGE.LINE_H;

export const TEXT_STYLE = {
  width: PAGE.W,
  height: PAGE_H,
  fontFamily: PAGE.FONT,
  fontSize: PAGE.FONT_SIZE,
  lineHeight: `${PAGE.LINE_H}px`,
  whiteSpace: 'pre-wrap' as const,
  overflowWrap: 'break-word' as const,
  wordBreak: 'normal' as const,
  letterSpacing: 0,
  padding: 0,
  margin: 0,
  border: 0,
};

let mirror: HTMLDivElement | null = null;
function getMirror() {
  if (mirror) return mirror;
  mirror = document.createElement('div');
  const s = mirror.style;
  s.position = 'absolute';
  s.left = '-9999px';
  s.top = '0';
  s.visibility = 'hidden';
  s.width = PAGE.W + 'px';
  s.fontFamily = PAGE.FONT;
  s.fontSize = PAGE.FONT_SIZE + 'px';
  s.lineHeight = PAGE.LINE_H + 'px';
  s.whiteSpace = 'pre-wrap';
  s.overflowWrap = 'break-word';
  s.wordBreak = 'normal';
  s.boxSizing = 'content-box';
  document.body.appendChild(mirror);
  return mirror;
}

const fits = (text: string) => {
  const m = getMirror();
  // 끝의 줄바꿈도 한 줄로 세도록 폭 없는 글자를 붙인다
  m.textContent = text + '​';
  return m.scrollHeight <= PAGE_H + 1;
};

const isWordChar = (ch: string | undefined) => !!ch && /[A-Za-z0-9_\-'.,]/.test(ch);

/** start에서 시작하는 페이지의 끝 */
function pageEnd(body: string, start: number) {
  if (fits(body.slice(start))) return body.length;
  let lo = start + 1;
  let hi = body.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(body.slice(start, mid))) lo = mid;
    else hi = mid - 1;
  }
  let end = lo;
  // 영어 단어 중간에서 자르지 않는다
  if (isWordChar(body[end - 1]) && isWordChar(body[end])) {
    let k = end - 1;
    while (k > start && k > end - 30 && isWordChar(body[k - 1])) k--;
    if (k > start && k > end - 30) end = k;
  }
  // 다음 페이지가 빈 줄로 시작하지 않게 경계의 줄바꿈은 이 페이지가 갖는다
  if (body[end] === '\n') end++;
  return end;
}

/** 메모 하나의 페이지 경계 (각 페이지의 시작 위치). 항상 [0, ...] */
export function paginateMemo(body: string, prev?: { body: string; starts: number[] }): number[] {
  if (typeof document === 'undefined') return [0];
  const starts = [0];
  // 바뀐 곳 앞의 경계는 그대로 쓰고, 바뀐 뒤에 옛 경계와 다시 맞으면 나머지도 그대로 쓴다
  let reuseUntil = 0;
  let tailDelta = 0;
  let tailFrom = Infinity;
  if (prev) {
    let a = 0;
    const max = Math.min(prev.body.length, body.length);
    while (a < max && prev.body[a] === body[a]) a++;
    let b = 0;
    while (b < max - a && prev.body[prev.body.length - 1 - b] === body[body.length - 1 - b]) b++;
    reuseUntil = a;
    tailDelta = body.length - prev.body.length;
    tailFrom = prev.body.length - b;
    for (let i = 1; i < prev.starts.length && prev.starts[i] < reuseUntil - 1; i++) starts.push(prev.starts[i]);
  }
  let s = starts[starts.length - 1];
  const prevSet = prev ? new Set(prev.starts) : null;
  for (let guard = 0; guard < 10000; guard++) {
    const e = pageEnd(body, s);
    if (e >= body.length) break;
    starts.push(e);
    if (prev && prevSet && e - tailDelta >= tailFrom && prevSet.has(e - tailDelta)) {
      // 뒤쪽은 글이 그대로이니 옛 경계를 밀어서 쓴다
      for (const ps of prev.starts) if (ps > e - tailDelta) starts.push(ps + tailDelta);
      break;
    }
    s = e;
  }
  return starts;
}

export type PageInfo =
  | { kind: 'toc'; index: number; from: number; to: number }
  | { kind: 'memo'; memoId: ID; start: number; end: number; nth: number }
  | { kind: 'blank' };

export interface BookPages {
  pages: PageInfo[];
  memoFirstPage: Map<ID, number>;
  spreads: number;
}

const cache = new Map<ID, { body: string; starts: number[] }>();

export function memoStarts(m: Memo) {
  const prev = cache.get(m.id);
  if (prev && prev.body === m.body) return prev.starts;
  const starts = paginateMemo(m.body, prev);
  cache.set(m.id, { body: m.body, starts });
  return starts;
}

/** 책 전체 페이지: 목차(첫 장부터) → 메모마다 새 페이지에서 시작 */
export function bookPages(memos: Memo[]): BookPages {
  const entries = memos.length + 1; // + "새 메모" 줄
  const tocPages = entries <= PAGE.TOC_FIRST ? 1 : 1 + Math.ceil((entries - PAGE.TOC_FIRST) / PAGE.TOC_OTHER);
  const pages: PageInfo[] = [];
  for (let i = 0; i < tocPages; i++) {
    const from = i === 0 ? 0 : PAGE.TOC_FIRST + (i - 1) * PAGE.TOC_OTHER;
    const to = i === 0 ? PAGE.TOC_FIRST : from + PAGE.TOC_OTHER;
    pages.push({ kind: 'toc', index: i, from, to: Math.min(to, entries) });
  }
  const memoFirstPage = new Map<ID, number>();
  for (const m of memos) {
    const starts = memoStarts(m);
    memoFirstPage.set(m.id, pages.length);
    starts.forEach((st, nth) =>
      pages.push({ kind: 'memo', memoId: m.id, start: st, end: starts[nth + 1] ?? m.body.length, nth }),
    );
  }
  if (pages.length % 2) pages.push({ kind: 'blank' });
  return { pages, memoFirstPage, spreads: pages.length / 2 };
}

export const memoTitle = (body: string) => body.split('\n', 1)[0].trim() || '(제목 없음)';
