import { LocalRepo } from './local';
import { SupabaseRepo } from './supabase';
import type { Repo } from './types';

export type { Repo, UserInfo } from './types';

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (repo) return repo;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Vercel의 Supabase 연동은 프로젝트에 따라 anon 키 또는 publishable 키 이름으로 넣는다
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  repo = url && key ? new SupabaseRepo(url, key) : new LocalRepo();
  return repo;
}
