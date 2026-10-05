'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { rig, world } from '@/lib/rig';
import { frontColumn, nearestC } from '@/lib/geometry';
import { cancelMove, closeToShelf, driveTo, openNewBook, startMove, trashOpenBook } from '@/lib/director';
import { SearchPanel, SettingsPanel, TrashPanel } from './Panels';

/** 지금 정면에 있는 기둥 */
function useFrontColumn() {
  const [col, setCol] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const l = world.layout;
      if (l) setCol(frontColumn(rig.c, l.n));
    }, 120);
    return () => clearInterval(id);
  }, []);
  return col;
}

export function HUD() {
  const phase = useStore((s) => s.phase);
  const panel = useStore((s) => s.panel);
  const pending = useStore((s) => s.pending);
  const mode = useStore((s) => s.mode);
  const toast = useStore((s) => s.toast);
  const categories = useStore((s) => s.categories);
  const col = useFrontColumn();
  const category = categories.find((c) => c.position === col);
  const [dialog, setDialog] = useState<null | { kind: 'new' } | { kind: 'rename'; id: string; name: string }>(null);

  const set = useStore((s) => s.set);
  const toggle = (p: 'search' | 'trash' | 'settings') => set({ panel: panel === p ? null : p });

  const newBook = () => {
    const s = useStore.getState();
    if (s.phase !== 'idle') return;
    if (!category) return s.showToast('이 기둥에는 카테고리가 없습니다. 먼저 새 카테고리를 만드세요.');
    const b = s.createBook(category.id);
    openNewBook(b.id);
  };

  const createCategory = (name: string) => {
    const s = useStore.getState();
    const l = world.layout;
    if (!l) return;
    const used = new Set(s.categories.map((c) => c.position));
    let target = -1;
    for (let k = 0; k < l.n && target < 0; k++) {
      const c = (col + k) % l.n;
      if (!used.has(c)) target = c;
    }
    if (target < 0) target = l.n; // 13번째부터는 기둥이 하나씩 늘고 탑이 커진다
    s.createCategory(name, target);
    const n = Math.max(l.n, target + 1);
    if (target !== col) driveTo(nearestC(rig.c, target, n), rig.y);
  };

  const reading = phase === 'open';
  const busy = phase !== 'idle' && phase !== 'open' && phase !== 'moving';

  return (
    <>
      <div className="hud-top">
        <div className="brand">
          <span>spine</span>
          <span className="save" title={mode === 'local' ? '이 브라우저에만 저장됩니다' : 'Supabase에 저장됩니다'}>
            {mode === 'local' ? '로컬 · ' : ''}
            {pending > 0 ? '저장 중…' : '저장됨'}
          </span>
        </div>
        <button
          className="column-name"
          title={category ? '두 번 눌러 이름 바꾸기' : undefined}
          onDoubleClick={() => category && setDialog({ kind: 'rename', id: category.id, name: category.name })}
        >
          {category ? category.name : <span className="muted">빈 책장</span>}
        </button>
        <div className="actions">
          <button onClick={() => toggle('search')} aria-pressed={panel === 'search'}>
            검색
          </button>
          <button onClick={() => toggle('trash')} aria-pressed={panel === 'trash'}>
            휴지통
          </button>
          <button onClick={() => toggle('settings')} aria-pressed={panel === 'settings'}>
            설정
          </button>
        </div>
      </div>

      <div className="hud-bottom">
        {phase === 'idle' && (
          <>
            <button onClick={newBook}>새 책</button>
            <button onClick={() => setDialog({ kind: 'new' })}>새 카테고리</button>
            <span className="hint">휠 위아래 · A/D 좌우 · 책 클릭 꺼내기</span>
          </>
        )}
        {reading && (
          <>
            <button onClick={closeToShelf} title="Esc">
              닫기
            </button>
            <button onClick={startMove}>옮기기</button>
            <button className="danger" onClick={trashOpenBook}>
              버리기
            </button>
            <span className="hint">페이지 가장자리를 누르면 넘어갑니다</span>
          </>
        )}
        {phase === 'moving' && (
          <>
            <span className="hint strong">책 사이를 눌러 끼우기 · 빈 칸을 누르면 맨 뒤에</span>
            <button onClick={cancelMove} title="Esc">
              제자리로
            </button>
          </>
        )}
        {busy && <span className="hint">…</span>}
      </div>

      {panel === 'search' && <SearchPanel />}
      {panel === 'trash' && <TrashPanel />}
      {panel === 'settings' && <SettingsPanel />}

      {dialog && (
        <NameDialog
          title={dialog.kind === 'new' ? '새 카테고리' : '카테고리 이름 바꾸기'}
          initial={dialog.kind === 'rename' ? dialog.name : ''}
          onCancel={() => setDialog(null)}
          onSubmit={(name) => {
            if (dialog.kind === 'new') createCategory(name);
            else useStore.getState().renameCategory(dialog.id, name);
            setDialog(null);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function NameDialog({
  title,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const v = ref.current?.value.trim();
          if (v) onSubmit(v);
        }}
      >
        <h2>{title}</h2>
        <input
          ref={ref}
          defaultValue={initial}
          maxLength={30}
          placeholder="이름"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="row">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="submit" className="primary">
            확인
          </button>
        </div>
      </form>
    </div>
  );
}
