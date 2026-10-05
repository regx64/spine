import type { Book, Category, ID, Library, Memo, SearchHit } from '../types';

export interface UserInfo {
  id: string;
  email?: string;
  name?: string;
}

/** 저장소. 로컬(localStorage)과 Supabase 두 가지 구현이 있다. */
export interface Repo {
  readonly mode: 'local' | 'supabase';
  getUser(): Promise<UserInfo | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (user: UserInfo | null) => void): () => void;

  /** 첫 로딩: 카테고리, 책 목록, 책별 메모 분량 합계 */
  loadLibrary(): Promise<Library>;
  /** 메모 본문은 책을 열 때 불러온다 */
  loadMemos(bookId: ID): Promise<Memo[]>;

  upsertCategory(c: Category): Promise<void>;
  upsertBook(b: Book): Promise<void>;
  /** 위치나 카테고리만 바뀐 책 여러 권 */
  updateBookPositions(items: Pick<Book, 'id' | 'category_id' | 'position'>[]): Promise<void>;
  hardDeleteBook(id: ID): Promise<void>;

  upsertMemo(m: Memo): Promise<void>;
  updateMemoPositions(items: Pick<Memo, 'id' | 'position'>[]): Promise<void>;
  deleteMemo(id: ID): Promise<void>;

  search(q: string): Promise<SearchHit[]>;
}
