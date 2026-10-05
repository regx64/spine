'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flipTo } from '@/lib/director';
import { useStore, type FocusRequest } from '@/lib/store';
import { PAGE, TEXT_STYLE, bookPages, memoTitle, type BookPages, type PageInfo } from '@/lib/paginate';
import { TOC_ENTRY_H, TOC_HEADER_H, textBoxOffset } from '@/lib/textures';
import type { Book, Memo } from '@/lib/types';

const INK = '#2b2722';
const MUTED = '#8a7f6e';

/** 커서를 옮길 위치를 이 페이지가 맡는가 */
export function claims(p: PageInfo, req: FocusRequest, memos: Memo[]) {
  if (p.kind !== 'memo' || p.memoId !== req.memoId) return false;
  const memo = memos.find((m) => m.id === p.memoId);
  const isLast = !!memo && p.end >= memo.body.length;
  if (req.prefer === 'prev') return (p.start < req.abs && req.abs <= p.end) || (p.nth === 0 && req.abs <= p.start);
  return (p.start <= req.abs && req.abs < p.end) || (isLast && req.abs >= p.end);
}

interface Props {
  book: Book;
  memos: Memo[];
  pages: BookPages;
  index: number;
  side: 'left' | 'right';
  width: number;
  height: number;
}

export function PageView({ book, memos, pages, index, side, width, height }: Props) {
  const info = pages.pages[index];
  const off = textBoxOffset(book.height);
  const turn = (dir: -1 | 1) => {
    const s = useStore.getState();
    flipTo(s.spread + dir, pages.spreads - 1);
  };
  const canTurn = side === 'left' ? index > 0 : index < pages.pages.length - 1;

  return (
    <div className="page" style={{ width, height, position: 'relative', color: INK, fontFamily: PAGE.FONT }}>
      <div style={{ position: 'absolute', left: off.left, top: off.top, width: PAGE.W, height: height - off.top }}>
        {info?.kind === 'toc' && <TocPage book={book} memos={memos} pages={pages} info={info} />}
        {info?.kind === 'memo' && (
          <MemoPage key={info.memoId + ':' + info.nth} memo={memos.find((m) => m.id === info.memoId)!} info={info} />
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          width: '100%',
          textAlign: 'center',
          fontSize: 11,
          color: MUTED,
          pointerEvents: 'none',
        }}
      >
        {index + 1}
      </div>
      {canTurn && (
        <button
          className={'page-edge ' + side}
          aria-label={side === 'left' ? '앞 장으로' : '다음 장으로'}
          title={side === 'left' ? '앞 장으로' : '다음 장으로'}
          onClick={() => turn(side === 'left' ? -1 : 1)}
        />
      )}
    </div>
  );
}

function TocPage({
  book,
  memos,
  pages,
  info,
}: {
  book: Book;
  memos: Memo[];
  pages: BookPages;
  info: Extract<PageInfo, { kind: 'toc' }>;
}) {
  const updateBook = useStore((s) => s.updateBook);
  const loaded = useStore((s) => !!s.memos[book.id]);
  const rows = memos.slice(info.from, Math.min(info.to, memos.length));
  const showNew = info.to > memos.length && info.from <= memos.length;

  const jump = (memo: Memo) => {
    const p = pages.memoFirstPage.get(memo.id);
    if (p !== undefined) flipTo(Math.floor(p / 2), pages.spreads - 1);
  };

  const addMemo = () => {
    const s = useStore.getState();
    const m = s.addMemo(book.id);
    const next = bookPages(useStore.getState().memos[book.id] ?? []);
    const p = next.memoFirstPage.get(m.id) ?? 0;
    s.set({ focusRequest: { memoId: m.id, abs: 0, prefer: 'next' } });
    if (Math.floor(p / 2) !== s.spread) flipTo(Math.floor(p / 2), next.spreads - 1);
  };

  const remove = (memo: Memo) => {
    if (confirm(`"${memoTitle(memo.body)}" 메모를 지울까요?`)) useStore.getState().deleteMemo(memo.id);
  };

  return (
    <div style={{ fontSize: PAGE.FONT_SIZE }}>
      {info.index === 0 && (
        <div style={{ height: TOC_HEADER_H }}>
          <div style={{ fontSize: 12, color: MUTED, height: 28, lineHeight: '28px' }}>목차</div>
          <input
            className="book-title"
            defaultValue={book.title}
            aria-label="책 제목"
            maxLength={60}
            onChange={(e) => updateBook(book.id, { title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
            {loaded ? `메모 ${memos.length}개 · ${pages.pages.length}쪽` : '불러오는 중…'}
          </div>
        </div>
      )}
      {rows.map((m) => (
        <div key={m.id} className="toc-row" style={{ height: TOC_ENTRY_H }}>
          <button className="toc-title" onClick={() => jump(m)} title="이 메모로 가기">
            {memoTitle(m.body)}
          </button>
          <span className="toc-tools">
            <button onClick={() => useStore.getState().moveMemo(m.id, -1)} title="위로" aria-label="위로">
              ↑
            </button>
            <button onClick={() => useStore.getState().moveMemo(m.id, 1)} title="아래로" aria-label="아래로">
              ↓
            </button>
            <button onClick={() => remove(m)} title="지우기" aria-label="지우기">
              ✕
            </button>
          </span>
          <span className="toc-no">{(pages.memoFirstPage.get(m.id) ?? 0) + 1}</span>
        </div>
      ))}
      {showNew && loaded && (
        <div className="toc-row" style={{ height: TOC_ENTRY_H }}>
          <button className="toc-title toc-new" onClick={addMemo}>
            + 새 메모
          </button>
        </div>
      )}
    </div>
  );
}

function MemoPage({ memo, info }: { memo: Memo; info: Extract<PageInfo, { kind: 'memo' }> }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  // 입력창이 지금 담고 있는 본문 구간
  const seg = useRef({ start: info.start, end: info.end });
  const composing = useRef(false);
  const [tick, setTick] = useState(0);
  const update = useStore((s) => s.updateMemoBody);
  const focusRequest = useStore((s) => s.focusRequest);
  const isLast = info.end >= memo.body.length;

  const request = (abs: number, prefer: 'prev' | 'next') =>
    useStore.getState().set({ focusRequest: { memoId: memo.id, abs, prefer } });

  // 페이지 나눔이 바뀌면 이 페이지의 글을 다시 채운다 (한글 조합 중에는 미룬다)
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el || composing.current) return;
    const want = memo.body.slice(info.start, info.end);
    if (el.value === want && seg.current.start === info.start) {
      seg.current = { start: info.start, end: info.end };
      return;
    }
    const focused = document.activeElement === el;
    const caret = seg.current.start + el.selectionStart;
    el.value = want;
    seg.current = { start: info.start, end: info.end };
    if (!focused) return;
    // 넘친 글을 따라 다음 페이지로 (또는 당겨진 글을 따라 앞 페이지로)
    if (caret > info.end || caret < info.start) request(caret, 'prev');
    else el.setSelectionRange(caret - info.start, caret - info.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memo.body, info.start, info.end, tick]);

  // 커서 이동 요청을 이 페이지가 맡으면 포커스
  useEffect(() => {
    const el = ta.current;
    if (!el || !focusRequest) return;
    const memos = useStore.getState().memos[memo.book_id] ?? [];
    if (!claims(info, focusRequest, memos)) return;
    const at = Math.max(0, Math.min(el.value.length, focusRequest.abs - info.start));
    el.focus({ preventScroll: true });
    el.setSelectionRange(at, at);
    useStore.getState().set({ focusRequest: null });
  }, [focusRequest, info, memo.book_id]);

  const onInput = () => {
    const el = ta.current!;
    const body = useStore.getState().memos[memo.book_id]?.find((m) => m.id === memo.id)?.body ?? '';
    const { start, end } = seg.current;
    const next = body.slice(0, start) + el.value + body.slice(end);
    seg.current = { start, end: start + el.value.length };
    if (next !== body) update(memo.id, next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (composing.current || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (e.key === 'Backspace' && atStart && info.nth > 0) {
      e.preventDefault();
      const body = memo.body;
      update(memo.id, body.slice(0, info.start - 1) + body.slice(info.start));
      request(info.start - 1, 'prev');
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && atStart && info.nth > 0) {
      e.preventDefault();
      request(info.start, 'prev');
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && atEnd && !isLast) {
      e.preventDefault();
      request(info.end, 'next');
    } else if (e.key === 'Escape') {
      el.blur();
    }
  };

  return (
    <textarea
      ref={ta}
      className="memo-input"
      defaultValue={memo.body.slice(info.start, info.end)}
      spellCheck={false}
      placeholder={info.nth === 0 && !memo.body ? '첫 줄이 제목이 됩니다' : undefined}
      aria-label="메모"
      onInput={onInput}
      onKeyDown={onKeyDown}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false;
        onInput();
        setTick((t) => t + 1);
      }}
      style={{ ...TEXT_STYLE, color: INK, background: 'transparent', resize: 'none', outline: 'none', overflow: 'hidden', display: 'block' }}
    />
  );
}
