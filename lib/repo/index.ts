import { LocalRepo } from './local';
import { SupabaseRepo } from './supabase';
import type { Repo } from './types';

export type { Repo, UserInfo } from './types';

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (repo) return repo;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  repo = url && key ? new SupabaseRepo(url, key) : new LocalRepo();
  return repo;
}
