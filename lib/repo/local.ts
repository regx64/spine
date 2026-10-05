import type { Book, Category, ID, Library, Memo, SearchHit } from '../types';
import type { Repo, UserInfo } from './types';
import { makeSnippet } from './snippet';

const KEY = 'spine:v1';

interface DB {
  categories: Category[];
  books: Omit<Book, 'chars'>[];
  memos: Memo[];
}

/** Supabase 설정이 없을 때 쓰는 저장소. 이 브라우저에만 저장된다. */
export class LocalRepo implements Repo {
  readonly mode = 'local' as const;
  private db: DB;

  constructor() {
    this.db = this.read() ?? seed();
    this.write();
  }

  private read(): DB | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DB) : null;
    } catch {
      return null;
    }
  }

  private write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db));
    } catch {
      // 저장 공간이 없거나 막힌 경우: 이번 세션 메모리에서만 유지
    }
  }

  async getUser(): Promise<UserInfo | null> {
    return { id: 'local', name: '로컬' };
  }
  async signIn() {}
  async signOut() {}
  onAuthChange() {
    return () => {};
  }

  async loadLibrary(): Promise<Library> {
    const chars = new Map<ID, number>();
    for (const m of this.db.memos) chars.set(m.book_id, (chars.get(m.book_id) ?? 0) + m.body.length);
    return {
      categories: this.db.categories.map((c) => ({ ...c })),
      books: this.db.books.map((b) => ({ ...b, chars: chars.get(b.id) ?? 0 })),
    };
  }

  async loadMemos(bookId: ID) {
    return this.db.memos
      .filter((m) => m.book_id === bookId)
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ ...m }));
  }

  async upsertCategory(c: Category) {
    upsert(this.db.categories, { ...c });
    this.write();
  }

  async upsertBook(b: Book) {
    const { chars: _chars, ...row } = b;
    void _chars;
    upsert(this.db.books, row);
    this.write();
  }

  async updateBookPositions(items: Pick<Book, 'id' | 'category_id' | 'position'>[]) {
    for (const it of items) {
      const b = this.db.books.find((x) => x.id === it.id);
      if (b) Object.assign(b, it);
    }
    this.write();
  }

  async hardDeleteBook(id: ID) {
    this.db.books = this.db.books.filter((b) => b.id !== id);
    this.db.memos = this.db.memos.filter((m) => m.book_id !== id);
    this.write();
  }

  async upsertMemo(m: Memo) {
    upsert(this.db.memos, { ...m });
    this.write();
  }

  async updateMemoPositions(items: Pick<Memo, 'id' | 'position'>[]) {
    for (const it of items) {
      const m = this.db.memos.find((x) => x.id === it.id);
      if (m) m.position = it.position;
    }
    this.write();
  }

  async deleteMemo(id: ID) {
    this.db.memos = this.db.memos.filter((m) => m.id !== id);
    this.write();
  }

  async search(q: string): Promise<SearchHit[]> {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const live = new Map(this.db.books.filter((b) => !b.deleted_at).map((b) => [b.id, b]));
    const hits: SearchHit[] = [];
    for (const b of live.values()) {
      if (b.title.toLowerCase().includes(needle)) hits.push({ bookId: b.id, title: b.title, snippet: '' });
    }
    for (const m of this.db.memos) {
      const b = live.get(m.book_id);
      if (!b) continue;
      const i = m.body.toLowerCase().indexOf(needle);
      if (i >= 0) hits.push({ bookId: b.id, memoId: m.id, title: b.title, snippet: makeSnippet(m.body, i, needle.length) });
    }
    return hits.slice(0, 50);
  }
}

function upsert<T extends { id: ID }>(arr: T[], row: T) {
  const i = arr.findIndex((x) => x.id === row.id);
  if (i >= 0) arr[i] = row;
  else arr.push(row);
}

function seed(): DB {
  const now = new Date().toISOString();
  const cat = (name: string, position: number): Category => ({ id: crypto.randomUUID(), name, position, created_at: now });
  const categories = [cat('일기', 0), cat('읽은 책', 1), cat('아이디어', 2), cat('업무', 3)];
  const books: Omit<Book, 'chars'>[] = [];
  const memos: Memo[] = [];
  const palette = ['#7a2e2e', '#2e4a7a', '#3d5c3a', '#6b4f2a', '#4a3b6b', '#8a6a2f', '#2f5f63', '#5a5a5a'];
  const titles: Record<string, string[]> = {
    일기: ['2026 가을', '2026 여름', '여행'],
    '읽은 책': ['소설', '에세이', '과학', '역사'],
    아이디어: ['3D 책장', '사이드 프로젝트'],
    업무: ['회의록', '할 일'],
  };
  let k = 0;
  for (const c of categories) {
    (titles[c.name] ?? []).forEach((title, i) => {
      const id = crypto.randomUUID();
      books.push({
        id,
        category_id: c.id,
        title,
        position: i,
        color: palette[k++ % palette.length],
        height: 0.21 + ((k * 37) % 7) * 0.01,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      if (title === '3D 책장') {
        const bodies = [
          '처음 쓰는 메모\n책 한 권이 주제 하나, 페이지가 메모다.\n\n휠로 사다리를 오르내리고 A/D로 벽을 따라 돈다. 책을 클릭하면 꺼내서 독서대에 펼친다.',
          '페이지 넘기기\n페이지 가장자리를 누르면 한 장 넘어간다. 목차의 항목을 누르면 여러 장을 한 번에 넘긴다.',
          '닫기\nEsc나 닫기 버튼으로 제자리에 꽂는다. 옮기기를 고르면 책을 든 채로 사다리를 움직여 다른 자리에 끼울 수 있다.',
        ];
        bodies.forEach((body, j) =>
          memos.push({ id: crypto.randomUUID(), book_id: id, position: j, body, created_at: now, updated_at: now }),
        );
      }
    });
  }
  return { categories, books, memos };
}
