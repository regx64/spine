'use client';

import { useEffect } from 'react';
import Scene from './scene/Scene';
import { HUD } from './ui/HUD';
import { useStore } from '@/lib/store';
import { cancelMove, closeToShelf, finishNow, isAnimating } from '@/lib/director';

export default function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);

  useEffect(() => {
    const stress = Number(new URLSearchParams(location.search).get('stress')) || 0;
    void useStore.getState().init(stress);

    // 모션 중에 한 번 더 클릭하면 즉시 끝 상태로
    const onPointerDown = () => {
      if (isAnimating()) finishNow();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useStore.getState();
      if (s.panel) return s.set({ panel: null });
      if (s.phase === 'open') closeToShelf();
      else if (s.phase === 'moving') cancelMove();
    };
    const onUnload = () => void useStore.getState().flush();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  if (status === 'signedOut') return <SignIn />;
  if (status === 'error')
    return (
      <div className="center-screen">
        <p>불러오지 못했습니다.</p>
        <p className="muted">{error}</p>
      </div>
    );

  return (
    <main className="app">
      {status === 'ready' && <Scene />}
      {status === 'ready' ? <HUD /> : <div className="center-screen muted">책장을 여는 중…</div>}
    </main>
  );
}

function SignIn() {
  return (
    <div className="center-screen">
      <h1>spine</h1>
      <p className="muted">혼자 쓰는 3D 책장 메모</p>
      <button className="primary" onClick={() => useStore.getState().signIn()}>
        Google로 로그인
      </button>
    </div>
  );
}
