-- AI 네비게이터 Supabase schema
-- Supabase SQL Editor에서 전체 실행하세요.
-- 브라우저에는 anon key만 사용하고 service_role key는 절대 노출하지 마세요.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tools (
  id text primary key,
  name text not null,
  maker text not null,
  logo text,
  logo_class text,
  categories text[] not null default '{}',
  best_for text[] not null default '{}',
  keywords text[] not null default '{}',
  quality smallint not null default 3 check (quality between 1 and 5),
  korean smallint not null default 3 check (korean between 1 and 5),
  speed smallint not null default 3 check (speed between 1 and 5),
  privacy smallint not null default 3 check (privacy between 1 and 5),
  ease smallint not null default 3 check (ease between 1 and 5),
  cost_fit smallint not null default 3 check (cost_fit between 1 and 5),
  price text,
  price_type text,
  free_limit text,
  strengths text[] not null default '{}',
  reason text,
  description text,
  official_url text,
  verified_at text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news (
  id text primary key,
  label text not null,
  published_at date,
  title text not null,
  summary text not null,
  insight text,
  category text,
  source text,
  source_url text,
  status text not null default 'draft' check (status in ('draft', 'review', 'published')),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_tools (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null references public.tools(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create index if not exists news_status_published_at_idx on public.news(status, published_at desc);
create index if not exists saved_tools_user_id_idx on public.saved_tools(user_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.news enable row level security;
alter table public.saved_tools enable row level security;

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles for select using (auth.uid() = id or public.is_admin());

drop policy if exists "published tools readable" on public.tools;
create policy "published tools readable" on public.tools for select using (is_published = true or public.is_admin());

drop policy if exists "admins manage tools" on public.tools;
create policy "admins manage tools" on public.tools for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "published news readable" on public.news;
create policy "published news readable" on public.news for select using (status = 'published' or public.is_admin());

drop policy if exists "admins manage news" on public.news;
create policy "admins manage news" on public.news for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users read own saves" on public.saved_tools;
create policy "users read own saves" on public.saved_tools for select using (auth.uid() = user_id);

drop policy if exists "users create own saves" on public.saved_tools;
create policy "users create own saves" on public.saved_tools for insert with check (auth.uid() = user_id);

drop policy if exists "users delete own saves" on public.saved_tools;
create policy "users delete own saves" on public.saved_tools for delete using (auth.uid() = user_id);

-- 최초 도구 데이터는 현재 data/tools.js의 객체를 Supabase Table Editor나 별도 seed script로 넣습니다.
-- 관리자 승격 예시(본인 이메일로 교체):
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
