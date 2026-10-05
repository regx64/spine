import { create } from 'zustand';
import { getRepo, type UserInfo } from './repo';
import type { Book, Category, ID, Memo } from './types';

export type Phase =
  | 'idle'
  | 'opening' // 뽑기 → 독서대 → 표지 열기
  | 'open'
  | 'closing' // 제자리에 꽂기
  | 'moving' // 책을 든 채로 사다리 이동
  | 'placing' // 든 책을 새 자리에 꽂는 중
  | 'trashing';

export type Panel = null | 'search' | 'trash' | 'settings';

export interface FocusRequest {
  memoId: ID;
  abs: number;
  /** 경계에 있을 때 앞 페이지 끝(prev)인지 다음 페이지 처음(next)인지 */
  prefer: 'prev' | 'next';
}

export interface Settings {
  motionSkip: boolean;
  sound: boolean;
}

const SETTINGS_KEY = 'spine:settings';
const loadSettings = (): Settings => {
  try {
    return { motionSkip: false, sound: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { motionSkip: false, sound: true };
  }
};

interface State {
  status: 'loading' | 'signedOut' | 'ready' | 'error';
  error: string | null;
  mode: 'local' | 'supabase';
  user: UserInfo | null;
  categories: Category[];
  books: Book[];
  memos: Record<ID, Memo[]>;
  /** 저장 대기 중인 항목 수 */
  pending: number;

  phase: Phase;
  activeBookId: ID | null;
  /** 펼친 양면 번호 (0 = 목차가 있는 첫 양면) */
  spread: number;
  /** 페이지가 넘어가는 중 (입력창 대신 구운 그림을 보여줌) */
  flipping: boolean;
  hoverId: ID | null;
  highlightId: ID | null;
  focusRequest: FocusRequest | null;
  panel: Panel;
  settings: Settings;
  toast: string | null;
}

interface Actions {
  init(stress?: number): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  set(p: Partial<State>): void;
  setSettings(p: Partial<Settings>): void;
  showToast(msg: string): void;

  createCategory(name: string, column: number): Category;
  renameCategory(id: ID, name: string): void;
  createBook(categoryId: ID): Book;
  updateBook(id: ID, patch: Partial<Pick<Book, 'title'>>): void;
  moveBook(bookId: ID, categoryId: ID, index: number): void;
  trashBook(id: ID): void;
  restoreBook(id: ID): void;
  hardDeleteBook(id: ID): void;

  loadMemos(bookId: ID): Promise<void>;
  addMemo(bookId: ID): Memo;
  updateMemoBody(memoId: ID, body: string): void;
  deleteMemo(memoId: ID): void;
  moveMemo(memoId: ID, dir: -1 | 1): void;
  flush(): Promise<void>;
}

export type Store = State & Actions;

const now = () => new Date().toISOString();
const PALETTE = ['#7a2e2e', '#2e4a7a', '#3d5c3a', '#6b4f2a', '#4a3b6b', '#8a6a2f', '#2f5f63', '#5a5a5a', '#9a4a3a', '#33465a', '#5e6b3a', '#7a5a6a'];

// 입력이 1초 멈추면 저장한다. 같은 키의 저장은 마지막 것만 남긴다.
const timers = new Map<string, { t: ReturnType<typeof setTimeout>; run: () => Promise<void> }>();

export const useStore = create<Store>()((set, get) => {
  const repo = () => getRepo();

  const fail = (e: unknown) => {
    console.error(e);
    get().showToast('저장하지 못했습니다: ' + (e instanceof Error ? e.message : String(e)));
  };

  const run = (p: Promise<unknown>) => {
    set((s) => ({ pending: s.pending + 1 }));
    p.catch(fail).finally(() => set((s) => ({ pending: s.pending - 1 })));
  };

  const debounced = (key: string, fn: () => Promise<void>, ms = 1000) => {
    const prev = timers.get(key);
    if (prev) clearTimeout(prev.t);
    else set((s) => ({ pending: s.pending + 1 }));
    const runIt = async () => {
      timers.delete(key);
      try {
        await fn();
      } catch (e) {
        fail(e);
      } finally {
        set((s) => ({ pending: s.pending - 1 }));
      }
    };
    timers.set(key, { t: setTimeout(runIt, ms), run: runIt });
  };

  const renumber = (list: Book[]) => list.map((b, i) => (b.position === i ? b : { ...b, position: i }));

  const recountChars = (bookId: ID) => {
    const memos = get().memos[bookId];
    if (!memos) return;
    const chars = memos.reduce((n, m) => n + m.body.length, 0);
    set((s) => ({ books: s.books.map((b) => (b.id === bookId && b.chars !== chars ? { ...b, chars } : b)) }));
  };

  const loadAll = async (stress?: number) => {
    const lib = await repo().loadLibrary();
    let { categories, books } = lib;
    if (stress && stress > 0) ({ categories, books } = addStress(categories, books, stress));
    set({ categories, books, status: 'ready' });
  };

  return {
    status: 'loading',
    error: null,
    mode: 'local',
    user: null,
    categories: [],
    books: [],
    memos: {},
    pending: 0,
    phase: 'idle',
    activeBookId: null,
    spread: 0,
    flipping: false,
    hoverId: null,
    highlightId: null,
    focusRequest: null,
    panel: null,
    settings: { motionSkip: false, sound: true },
    toast: null,

    async init(stress) {
      const r = repo();
      set({ mode: r.mode, settings: loadSettings() });
      // 페이지 나눔과 책등 글씨가 같은 글꼴로 재지도록 글꼴을 먼저 받는다
      await Promise.race([
        document.fonts?.load(`13.5px "Pretendard Variable"`, '가A'),
        new Promise((r) => setTimeout(r, 2500)),
      ]).catch(() => {});
      try {
        const user = await r.getUser();
        set({ user });
        r.onAuthChange((u) => {
          const had = get().user?.id;
          set({ user: u });
          if (u && u.id !== had) loadAll(stress).catch((e) => set({ status: 'error', error: String(e) }));
          if (!u) set({ status: 'signedOut', categories: [], books: [], memos: {} });
        });
        if (!user) {
          set({ status: 'signedOut' });
          return;
        }
        await loadAll(stress);
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    },
    async signIn() {
      await repo().signIn();
    },
    async signOut() {
      await get().flush();
      await repo().signOut();
    },
    set: (p) => set(p),
    setSettings(p) {
      const settings = { ...get().settings, ...p };
      set({ settings });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* 설정은 이번 세션에만 유지 */
      }
    },
    showToast(msg) {
      set({ toast: msg });
      setTimeout(() => get().toast === msg && set({ toast: null }), 3500);
    },

    createCategory(name, column) {
      const c: Category = { id: crypto.randomUUID(), name, position: column, created_at: now() };
      set((s) => ({ categories: [...s.categories, c] }));
      run(repo().upsertCategory(c));
      return c;
    },
    renameCategory(id, name) {
      set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)) }));
      const c = get().categories.find((x) => x.id === id);
      if (c) debounced('cat:' + id, () => repo().upsertCategory(c));
    },
    createBook(categoryId) {
      const siblings = get().books.filter((b) => b.category_id === categoryId && !b.deleted_at);
      const t = now();
      const b: Book = {
        id: crypto.randomUUID(),
        category_id: categoryId,
        title: '새 책',
        position: siblings.length,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        height: Math.round((0.21 + Math.random() * 0.06) * 1000) / 1000,
        created_at: t,
        updated_at: t,
        deleted_at: null,
        chars: 0,
      };
      set((s) => ({ books: [...s.books, b], memos: { ...s.memos, [b.id]: [] } }));
      run(repo().upsertBook(b));
      return b;
    },
    updateBook(id, patch) {
      set((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, ...patch, updated_at: now() } : b)) }));
      debounced('book:' + id, async () => {
        const b = get().books.find((x) => x.id === id);
        if (b) await repo().upsertBook(b);
      });
    },
    moveBook(bookId, categoryId, index) {
      const { books } = get();
      const book = books.find((b) => b.id === bookId);
      if (!book) return;
      const live = (cat: ID) =>
        books.filter((b) => b.category_id === cat && !b.deleted_at && b.id !== bookId).sort((a, b) => a.position - b.position);
      const target = live(categoryId);
      target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...book, category_id: categoryId });
      const changed = new Map<ID, Book>();
      for (const b of renumber(target)) changed.set(b.id, b);
      if (book.category_id !== categoryId) for (const b of renumber(live(book.category_id))) changed.set(b.id, b);
      const updates: Book[] = [];
      const next = books.map((b) => {
        const c = changed.get(b.id);
        if (c && (c.position !== b.position || c.category_id !== b.category_id)) {
          updates.push(c);
          return c;
        }
        return b;
      });
      set({ books: next });
      if (updates.length)
        run(repo().updateBookPositions(updates.map(({ id, category_id, position }) => ({ id, category_id, position }))));
    },
    trashBook(id) {
      const book = get().books.find((b) => b.id === id);
      if (!book) return;
      const trashed = { ...book, deleted_at: now() };
      set((s) => ({ books: s.books.map((b) => (b.id === id ? trashed : b)) }));
      run(repo().upsertBook(trashed));
      // 남은 책은 빈틈 없이 당긴다
      const rest = renumber(
        get().books.filter((b) => b.category_id === book.category_id && !b.deleted_at).sort((a, b) => a.position - b.position),
      );
      const changed = rest.filter((b) => b.position !== get().books.find((x) => x.id === b.id)?.position);
      if (changed.length) {
        const map = new Map(changed.map((b) => [b.id, b]));
        set((s) => ({ books: s.books.map((b) => map.get(b.id) ?? b) }));
        run(repo().updateBookPositions(changed.map(({ id: i, category_id, position }) => ({ id: i, category_id, position }))));
      }
    },
    restoreBook(id) {
      const book = get().books.find((b) => b.id === id);
      if (!book) return;
      const position = get().books.filter((b) => b.category_id === book.category_id && !b.deleted_at).length;
      const restored = { ...book, deleted_at: null, position };
      set((s) => ({ books: s.books.map((b) => (b.id === id ? restored : b)) }));
      run(repo().upsertBook(restored));
    },
    hardDeleteBook(id) {
      set((s) => {
        const memos = { ...s.memos };
        delete memos[id];
        return { books: s.books.filter((b) => b.id !== id), memos };
      });
      run(repo().hardDeleteBook(id));
    },

    async loadMemos(bookId) {
      if (get().memos[bookId]) return;
      try {
        const list = await repo().loadMemos(bookId);
        set((s) => ({ memos: { ...s.memos, [bookId]: list } }));
      } catch (e) {
        fail(e);
        set((s) => ({ memos: { ...s.memos, [bookId]: [] } }));
      }
    },
    addMemo(bookId) {
      const list = get().memos[bookId] ?? [];
      const t = now();
      const m: Memo = { id: crypto.randomUUID(), book_id: bookId, position: list.length, body: '', created_at: t, updated_at: t };
      set((s) => ({ memos: { ...s.memos, [bookId]: [...list, m] } }));
      run(repo().upsertMemo(m));
      return m;
    },
    updateMemoBody(memoId, body) {
      let bookId: ID | null = null;
      const memos = { ...get().memos };
      for (const [bid, list] of Object.entries(memos)) {
        const i = list.findIndex((m) => m.id === memoId);
        if (i < 0) continue;
        bookId = bid;
        const copy = list.slice();
        copy[i] = { ...copy[i], body, updated_at: now() };
        memos[bid] = copy;
        break;
      }
      if (!bookId) return;
      set({ memos });
      const bid = bookId;
      debounced('memo:' + memoId, async () => {
        const m = get().memos[bid]?.find((x) => x.id === memoId);
        if (m) await repo().upsertMemo(m);
        recountChars(bid);
      });
    },
    deleteMemo(memoId) {
      const memos = { ...get().memos };
      for (const [bid, list] of Object.entries(memos)) {
        if (!list.some((m) => m.id === memoId)) continue;
        const rest = list.filter((m) => m.id !== memoId).map((m, i) => (m.position === i ? m : { ...m, position: i }));
        memos[bid] = rest;
        set({ memos });
        const prev = timers.get('memo:' + memoId);
        if (prev) {
          clearTimeout(prev.t);
          timers.delete('memo:' + memoId);
          set((s) => ({ pending: s.pending - 1 }));
        }
        run(
          repo()
            .deleteMemo(memoId)
            .then(() => repo().updateMemoPositions(rest.map(({ id, position }) => ({ id, position })))),
        );
        recountChars(bid);
        return;
      }
    },
    moveMemo(memoId, dir) {
      const memos = { ...get().memos };
      for (const [bid, list] of Object.entries(memos)) {
        const i = list.findIndex((m) => m.id === memoId);
        if (i < 0) continue;
        const j = i + dir;
        if (j < 0 || j >= list.length) return;
        const copy = list.slice();
        [copy[i], copy[j]] = [copy[j], copy[i]];
        memos[bid] = copy.map((m, k) => (m.position === k ? m : { ...m, position: k }));
        set({ memos });
        run(repo().updateMemoPositions(memos[bid].map(({ id, position }) => ({ id, position }))));
        return;
      }
    },
    async flush() {
      await Promise.all([...timers.values()].map((t) => (clearTimeout(t.t), t.run())));
    },
  };
});

/** 1단계 완료 기준 확인용: ?stress=500 이면 저장하지 않는 가짜 책을 채운다 */
function addStress(categories: Category[], books: Book[], count: number) {
  const cats = categories.slice();
  const t = now();
  for (let i = 0; i < 12; i++) {
    if (!cats.some((c) => c.position === i)) cats.push({ id: 'stress-c' + i, name: '테스트 ' + (i + 1), position: i, created_at: t });
  }
  const extra: Book[] = [];
  for (let i = 0; i < count; i++) {
    const c = cats[i % cats.length];
    extra.push({
      id: 'stress-b' + i,
      category_id: c.id,
      title: '테스트 책 ' + (i + 1),
      position: 1000 + i,
      color: PALETTE[i % PALETTE.length],
      height: 0.2 + ((i * 7) % 8) * 0.01,
      created_at: t,
      updated_at: t,
      deleted_at: null,
      chars: (i * 2311) % 25000,
    });
  }
  return { categories: cats, books: [...books, ...extra] };
}
