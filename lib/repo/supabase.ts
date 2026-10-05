import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Book, Category, ID, Library, Memo, SearchHit } from '../types';
import type { Repo, UserInfo } from './types';
import { makeSnippet } from './snippet';

const toUser = (u: User | null | undefined): UserInfo | null =>
  u ? { id: u.id, email: u.email, name: (u.user_metadata?.full_name as string | undefined) ?? u.email } : null;

/** Supabase Auth(Google) + Postgres. 행 단위 보안으로 본인 데이터만 읽고 쓴다. */
export class SupabaseRepo implements Repo {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  private userId: string | null = null;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key);
  }

  private uid() {
    if (!this.userId) throw new Error('로그인이 필요합니다');
    return this.userId;
  }

  private check<T>(res: { data: T; error: { message: string } | null }) {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  async getUser() {
    const { data } = await this.sb.auth.getSession();
    const u = toUser(data.session?.user);
    this.userId = u?.id ?? null;
    return u;
  }

  async signIn() {
    await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  onAuthChange(cb: (user: UserInfo | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => {
      const u = toUser(session?.user);
      this.userId = u?.id ?? null;
      cb(u);
    });
    return () => data.subscription.unsubscribe();
  }

  async loadLibrary(): Promise<Library> {
    const [cats, books, stats] = await Promise.all([
      this.sb.from('categories').select('id,name,position,created_at').order('position'),
      this.sb
        .from('books')
        .select('id,category_id,title,position,color,height,created_at,updated_at,deleted_at')
        .order('position'),
      this.sb.from('book_stats').select('book_id,chars'),
    ]);
    const chars = new Map<ID, number>();
    for (const s of this.check(stats) as { book_id: ID; chars: number }[]) chars.set(s.book_id, Number(s.chars) || 0);
    return {
      categories: this.check(cats) as Category[],
      books: (this.check(books) as Omit<Book, 'chars'>[]).map((b) => ({ ...b, chars: chars.get(b.id) ?? 0 })),
    };
  }

  async loadMemos(bookId: ID) {
    const res = await this.sb
      .from('memos')
      .select('id,book_id,position,body,created_at,updated_at')
      .eq('book_id', bookId)
      .order('position');
    return this.check(res) as Memo[];
  }

  async upsertCategory(c: Category) {
    this.check(await this.sb.from('categories').upsert({ ...c, user_id: this.uid() }));
  }

  async upsertBook(b: Book) {
    const { chars: _chars, ...row } = b;
    void _chars;
    this.check(await this.sb.from('books').upsert({ ...row, user_id: this.uid() }));
  }

  async updateBookPositions(items: Pick<Book, 'id' | 'category_id' | 'position'>[]) {
    await Promise.all(
      items.map(async (it) =>
        this.check(
          await this.sb.from('books').update({ category_id: it.category_id, position: it.position }).eq('id', it.id),
        ),
      ),
    );
  }

  async hardDeleteBook(id: ID) {
    this.check(await this.sb.from('books').delete().eq('id', id));
  }

  async upsertMemo(m: Memo) {
    this.check(await this.sb.from('memos').upsert({ ...m, user_id: this.uid() }));
  }

  async updateMemoPositions(items: Pick<Memo, 'id' | 'position'>[]) {
    await Promise.all(
      items.map(async (it) => this.check(await this.sb.from('memos').update({ position: it.position }).eq('id', it.id))),
    );
  }

  async deleteMemo(id: ID) {
    this.check(await this.sb.from('memos').delete().eq('id', id));
  }

  async search(q: string): Promise<SearchHit[]> {
    const needle = q.trim();
    if (!needle) return [];
    const pattern = `%${needle.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const [byTitle, byBody] = await Promise.all([
      this.sb.from('books').select('id,title').is('deleted_at', null).ilike('title', pattern).limit(20),
      this.sb
        .from('memos')
        .select('id,book_id,body,books!inner(title,deleted_at)')
        .is('books.deleted_at', null)
        .ilike('body', pattern)
        .limit(30),
    ]);
    const hits: SearchHit[] = (this.check(byTitle) as { id: ID; title: string }[]).map((b) => ({
      bookId: b.id,
      title: b.title,
      snippet: '',
    }));
    type Row = { id: ID; book_id: ID; body: string; books: { title: string } | { title: string }[] };
    for (const m of this.check(byBody) as unknown as Row[]) {
      const title = Array.isArray(m.books) ? m.books[0]?.title : m.books.title;
      const i = m.body.toLowerCase().indexOf(needle.toLowerCase());
      hits.push({ bookId: m.book_id, memoId: m.id, title: title ?? '', snippet: makeSnippet(m.body, Math.max(0, i), needle.length) });
    }
    return hits;
  }
}
