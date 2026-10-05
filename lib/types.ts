export type ID = string;

export interface Category {
  id: ID;
  name: string;
  /** 기둥 순서 (= 기둥 인덱스). 빈 기둥이 사이에 있어도 된다. */
  position: number;
  created_at: string;
}

export interface Book {
  id: ID;
  category_id: ID;
  title: string;
  /** 카테고리 안 순서 */
  position: number;
  color: string;
  /** 책 높이 (m) */
  height: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** 메모 분량 합계 (두께 계산용). 저장하지 않고 불러올 때 계산한다. */
  chars: number;
}

export interface Memo {
  id: ID;
  book_id: ID;
  position: number;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface SearchHit {
  bookId: ID;
  memoId?: ID;
  title: string;
  snippet: string;
}

export interface Library {
  categories: Category[];
  books: Book[];
}
