-- 3D 책장 메모: 카테고리, 책, 메모 세 테이블.
-- 책의 위치·두께·페이지 경계는 저장하지 않고 순서와 분량에서 계산한다.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  position int not null, -- 기둥 순서
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  title text not null default '',
  position int not null, -- 카테고리 안 순서
  color text not null,
  height real not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz -- 있으면 휴지통
);

create table public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  position int not null,
  body text not null default '', -- 첫 줄이 제목
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.categories (user_id, position);
create index on public.books (user_id, category_id, position);
create index on public.memos (book_id, position);

-- 행 단위 보안: 본인 데이터만 읽고 쓴다
alter table public.categories enable row level security;
alter table public.books enable row level security;
alter table public.memos enable row level security;

create policy "own categories" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own books" on public.books
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own memos" on public.memos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 첫 로딩에 쓰는 책별 메모 분량 합계 (두께 계산용)
create view public.book_stats with (security_invoker = true) as
  select book_id, sum(char_length(body))::int as chars
  from public.memos
  group by book_id;
