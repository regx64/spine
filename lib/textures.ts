import * as THREE from 'three';
import { PAGE, PAGE_H, memoTitle, type PageInfo } from './paginate';
import { BOOK_DEPTH } from './geometry';
import type { Book, Memo } from './types';

export const TOC_ENTRY_H = 22;
export const TOC_HEADER_H = 118;

export const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  draw(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const FONT = PAGE.FONT;

/** 책등: 책 색 바탕에 세로 제목과 위아래 띠 */
export function spineTexture(book: Book, thickness: number) {
  const W = 64;
  const H = Math.round((W * book.height) / thickness);
  return canvasTexture(W, H, (g) => {
    g.fillStyle = book.color;
    g.fillRect(0, 0, W, H);
    // 천 질감
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.25)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.06)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const ink = luminance(book.color) > 0.5 ? '#2a2620' : '#e9dcb8';
    g.fillStyle = ink;
    g.globalAlpha = 0.85;
    for (const y of [H * 0.06, H * 0.075, H * 0.925, H * 0.94]) g.fillRect(4, y, W - 8, Math.max(1.5, H * 0.004));
    g.globalAlpha = 1;
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(Math.PI / 2);
    const maxLen = H * 0.78;
    let size = Math.min(W * 0.48, 30);
    g.font = `600 ${size}px ${FONT}`;
    const title = book.title || '제목 없음';
    const w = g.measureText(title).width;
    if (w > maxLen) {
      size = Math.max(14, (size * maxLen) / w);
      g.font = `600 ${size}px ${FONT}`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let text = title;
    while (g.measureText(text).width > maxLen && text.length > 1) text = text.slice(0, -2) + '…';
    g.fillText(text, 0, 2);
    g.restore();
  });
}

/** 표지: 제목 */
export function coverTexture(book: Book) {
  const W = 256;
  const H = Math.round((W * book.height) / BOOK_DEPTH);
  return canvasTexture(W, H, (g) => {
    g.fillStyle = book.color;
    g.fillRect(0, 0, W, H);
    const ink = luminance(book.color) > 0.5 ? '#2a2620' : '#e9dcb8';
    g.strokeStyle = ink;
    g.globalAlpha = 0.7;
    g.lineWidth = 2;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.globalAlpha = 1;
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.font = `600 22px ${FONT}`;
    wrap(g, book.title || '제목 없음', W - 70).slice(0, 4).forEach((line, i) => g.fillText(line, W / 2, H * 0.3 + i * 30));
  });
}

/** 기둥 맨 아래 명패 */
export function plateTexture(name: string) {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = '#c9b48a';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#8c7650';
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = '#3a2f1d';
    g.font = `600 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let t = name;
    while (g.measureText(t).width > 230 && t.length > 1) t = t.slice(0, -2) + '…';
    g.fillText(t, 128, 34);
  });
}

/** 선반 뒤판의 미리 그린 음영 (칸 하나 높이로 반복) */
export function shelfShadeTexture() {
  const tex = canvasTexture(8, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#b9b4ab');
    grad.addColorStop(0.25, '#e3dfd8');
    grad.addColorStop(0.85, '#f1eee9');
    grad.addColorStop(1, '#d9d4cc');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    let lastSpace = -1;
    for (const ch of para) {
      const next = line + ch;
      if (g.measureText(next).width > width && line) {
        if (lastSpace > 0 && /[A-Za-z0-9]/.test(ch)) {
          out.push(line.slice(0, lastSpace));
          line = line.slice(lastSpace + 1) + ch;
        } else {
          out.push(line);
          line = ch === ' ' ? '' : ch;
        }
        lastSpace = -1;
      } else line = next;
      if (ch === ' ') lastSpace = line.length - 1;
    }
    out.push(line);
  }
  return out;
}

/** 페이지 크기 (px, 1px = PAGE.M_PER_PX m) */
export const pagePx = (bookHeight: number) => ({
  w: BOOK_DEPTH / PAGE.M_PER_PX,
  h: bookHeight / PAGE.M_PER_PX,
});

export const textBoxOffset = (bookHeight: number) => {
  const { w, h } = pagePx(bookHeight);
  return { left: (w - PAGE.W) / 2, top: Math.max(18, (h - PAGE_H) / 2 - 10) };
};

const PAPER = '#f7f2e6';
export const paperTexture = () =>
  canvasTexture(4, 4, (g) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, 4, 4);
  });

/**
 * 넘기는 순간에만 쓰는 페이지 그림. 화면의 입력창과 같은 자리에 같은 글꼴로 그린다.
 * mirror: 뒷면에 붙일 때 좌우를 뒤집는다.
 */
export function bakePage(
  info: PageInfo | undefined,
  pageNo: number,
  book: Book,
  memos: Memo[],
  memoFirstPage: Map<string, number>,
) {
  const S = 2;
  const { w, h } = pagePx(book.height);
  const off = textBoxOffset(book.height);
  return canvasTexture(Math.round(w * S), Math.round(h * S), (g) => {
    g.scale(S, S);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    if (!info || info.kind === 'blank') return;
    g.fillStyle = '#2b2722';
    g.textBaseline = 'middle';
    g.font = `${PAGE.FONT_SIZE}px ${FONT}`;
    g.translate(off.left, off.top);
    if (info.kind === 'memo') {
      const memo = memos.find((m) => m.id === info.memoId);
      const text = memo ? memo.body.slice(info.start, info.end) : '';
      wrap(g, text, PAGE.W)
        .slice(0, PAGE.LINES)
        .forEach((line, i) => g.fillText(line, 0, i * PAGE.LINE_H + PAGE.LINE_H / 2));
    } else {
      let y = 0;
      if (info.index === 0) {
        g.fillStyle = '#8a7f6e';
        g.font = `12px ${FONT}`;
        g.fillText('목차', 0, 14);
        g.fillStyle = '#2b2722';
        g.font = `600 20px ${FONT}`;
        g.fillText(book.title, 0, 50);
        y = TOC_HEADER_H;
      }
      g.font = `${PAGE.FONT_SIZE}px ${FONT}`;
      const rows: [string, string][] = memos.map((m) => [memoTitle(m.body), String((memoFirstPage.get(m.id) ?? 0) + 1)]);
      rows.push(['+ 새 메모', '']);
      rows.slice(info.from, info.to).forEach(([title, no], i) => {
        const yy = y + i * TOC_ENTRY_H + TOC_ENTRY_H / 2;
        g.fillStyle = no ? '#2b2722' : '#8a7f6e';
        let t = title;
        while (g.measureText(t).width > PAGE.W - 50 && t.length > 1) t = t.slice(0, -2) + '…';
        g.textAlign = 'left';
        g.fillText(t, 0, yy);
        g.textAlign = 'right';
        g.fillText(no, PAGE.W, yy);
      });
      g.textAlign = 'left';
    }
    g.setTransform(S, 0, 0, S, 0, 0);
    g.fillStyle = '#8a7f6e';
    g.font = `11px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(String(pageNo + 1), w / 2, h - 16);
  });
}
