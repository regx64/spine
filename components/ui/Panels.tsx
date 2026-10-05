'use client';

import { useEffect, useRef, useState } from 'react';
import { getRepo } from '@/lib/repo';
import { useStore } from '@/lib/store';
import { rig, world } from '@/lib/rig';
import { MIN_EYE } from '@/lib/rig';
import { nearestC } from '@/lib/geometry';
import { closeToShelf, driveTo, finishNow } from '@/lib/director';
import type { SearchHit } from '@/lib/types';

const close = () => useStore.getState().set({ panel: null });

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="panel" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <header>
        <h2>{title}</h2>
        <button onClick={close} aria-label="닫기">
          ✕
        </button>
      </header>
      {children}
    </aside>
  );
}

/** 검색 결과를 고르면 사다리가 그 책 앞으로 이동한다 */
export function goToBook(bookId: string) {
  const s = useStore.getState();
  if (s.phase === 'open' || s.phase === 'opening') {
    closeToShelf();
    finishNow();
  }
  const l = world.layout;
  const slot = l?.slots.get(bookId);
  if (!l || !slot) return s.showToast('책장에서 찾지 못했습니다');
  const y = Math.max(MIN_EYE, Math.min(l.maxHeight - 0.2, slot.y + slot.book.height * 0.6));
  s.set({ highlightId: null });
  driveTo(nearestC(rig.c, slot.c, l.n), y, () => {
    useStore.getState().set({ highlightId: bookId });
    setTimeout(() => useStore.getState().highlightId === bookId && useStore.getState().set({ highlightId: null }), 2500);
  });
}

export function SearchPanel() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  useEffect(() => {
    if (!q.trim()) return setHits(null);
    let live = true;
    const t = setTimeout(async () => {
      // 저장되지 않은 최근 입력까지 찾도록 먼저 저장을 끝낸다
      await useStore.getState().flush();
      const res = await getRepo()
        .search(q)
        .catch(() => []);
      if (live) setHits(res);
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Panel title="검색">
      <input
        ref={ref}
        className="search-input"
        placeholder="제목이나 본문"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
          if (e.key === 'Enter' && hits?.[0]) {
            close();
            goToBook(hits[0].bookId);
          }
        }}
      />
      <ul className="list">
        {hits?.length === 0 && <li className="muted">찾은 것이 없습니다</li>}
        {hits?.map((h, i) => (
          <li key={i}>
            <button
              onClick={() => {
                close();
                goToBook(h.bookId);
              }}
            >
              <strong>{h.title}</strong>
              {h.snippet && <span className="snippet">{h.snippet}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function TrashPanel() {
  const books = useStore((s) => s.books);
  const categories = useStore((s) => s.categories);
  const trashed = books.filter((b) => b.deleted_at).sort((a, b) => (b.deleted_at! > a.deleted_at! ? 1 : -1));
  return (
    <Panel title="휴지통">
      <ul className="list">
        {trashed.length === 0 && <li className="muted">비어 있습니다</li>}
        {trashed.map((b) => (
          <li key={b.id} className="trash-row">
            <span className="swatch" style={{ background: b.color }} />
            <span className="grow">
              <strong>{b.title}</strong>
              <span className="snippet">
                {categories.find((c) => c.id === b.category_id)?.name ?? ''} ·{' '}
                {new Date(b.deleted_at!).toLocaleDateString('ko-KR')}
              </span>
            </span>
            <button onClick={() => useStore.getState().restoreBook(b.id)}>복구</button>
            <button
              className="danger"
              onClick={() => confirm(`"${b.title}"을(를) 영구히 지울까요?`) && useStore.getState().hardDeleteBook(b.id)}
            >
              영구 삭제
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const user = useStore((s) => s.user);
  const mode = useStore((s) => s.mode);
  return (
    <Panel title="설정">
      <label className="toggle">
        <input type="checkbox" checked={settings.motionSkip} onChange={(e) => setSettings({ motionSkip: e.target.checked })} />
        모션 스킵 (모든 모션을 0.2초 페이드로)
      </label>
      <label className="toggle">
        <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} />
        효과음
      </label>
      <div className="account">
        {mode === 'local' ? (
          <p className="muted">
            로컬 모드: 이 브라우저에만 저장됩니다. Supabase 환경 변수를 넣으면 Google 로그인과 서버 저장이 켜집니다.
          </p>
        ) : (
          <>
            <p>{user?.name ?? user?.email}</p>
            <button onClick={() => useStore.getState().signOut()}>로그아웃</button>
          </>
        )}
      </div>
    </Panel>
  );
}
