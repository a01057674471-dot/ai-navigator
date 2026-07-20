-- AI 네비게이터 Supabase 한 번 설치 SQL
-- Supabase SQL Editor에서 이 파일 전체를 한 번에 실행하세요.
-- 이 파일에는 비밀번호나 API 키가 없습니다.

-- ========================================
-- 01 기본 테이블과 보안 정책
-- 파일: supabase-schema.sql
-- ========================================

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


-- ========================================
-- 02 초기 도구·뉴스 데이터
-- 파일: supabase-seed.sql
-- ========================================

-- AI 네비게이터 초기 데모 데이터
-- supabase-schema.sql을 먼저 실행한 뒤 이 파일을 실행하세요.

insert into public.tools (id, name, maker, logo, logo_class, categories, best_for, keywords, quality, korean, speed, privacy, ease, cost_fit, price, price_type, free_limit, strengths, reason, description, official_url, verified_at, is_published) values
('chatgpt', 'ChatGPT', 'OpenAI', '✦', 'logo-blue', array['writing', 'research', 'image', 'coding']::text[], array['범용 대화', '파일 분석', '아이디어 정리', '초안 작성']::text[], array['회의록', '문서', '글쓰기', '검색', '리서치', '코딩', '아이디어', '번역']::text[], 5, 5, 4, 3, 4, 4, '무료 / Plus', 'freemium', '무료 플랜 제공', array['멀티모달', '파일 분석', '범용성']::text[], '여러 작업을 한곳에서 처리하고 싶을 때 가장 빠르게 시작할 수 있어요.', '질문, 문서, 이미지, 아이디어 정리 등 폭넓은 작업을 지원하는 범용 AI입니다.', 'https://chatgpt.com', '데모 데이터', true),
('claude', 'Claude', 'Anthropic', '✦', 'logo-blue', array['writing', 'research', 'coding']::text[], array['긴 문서', '회의록', '대본', '코드 리뷰']::text[], array['회의록', '문서', 'pdf', '논문', '대본', '글쓰기', '코드', '정리']::text[], 5, 5, 4, 4, 4, 4, '무료 플랜 있음', 'freemium', '무료 플랜 제공', array['긴 맥락', '자연스러운 글', '구조화']::text[], '긴 맥락을 잘 이해해서 대본, 기획안, 콘텐츠 구조를 탄탄하게 만들어요.', '긴 글을 읽고 맥락을 유지하며 요약·작성·분석하는 작업에 강한 AI입니다.', 'https://claude.ai', '데모 데이터', true),
('perplexity', 'Perplexity', 'Perplexity AI', 'P', 'logo-green', array['research', 'writing']::text[], array['최신 검색', '시장 조사', '출처 확인', '자료 수집']::text[], array['검색', '조사', '시장', '뉴스', '자료', '출처', '리서치', '최신']::text[], 4, 4, 5, 3, 4, 4, '무료 / Pro', 'freemium', '무료 검색 제공', array['출처 제공', '실시간 검색', '리서치']::text[], '최신 정보를 빠르게 찾고 근거 링크까지 확인하는 데 적합해요.', '웹 검색과 답변을 결합해 조사 시작점을 빠르게 만들어주는 AI 검색 도구입니다.', 'https://www.perplexity.ai', '데모 데이터', true),
('gemini', 'Gemini', 'Google', '✧', 'logo-blue', array['research', 'writing', 'image']::text[], array['Google 생태계', '문서 요약', '검색 보조', '멀티모달']::text[], array['검색', '문서', '메일', '자료', '이미지', '요약', '구글']::text[], 4, 4, 4, 3, 4, 4, '무료 / 유료 플랜', 'freemium', '무료 플랜 제공', array['검색 연동', '멀티모달', '생태계 연동']::text[], 'Google 문서·검색 환경을 자주 쓴다면 작업 흐름을 이어가기 좋아요.', '검색과 문서·이미지 이해를 함께 활용할 수 있는 범용 AI입니다.', 'https://gemini.google.com', '데모 데이터', true),
('midjourney', 'Midjourney', 'Midjourney', '◒', 'logo-amber', array['image', 'design']::text[], array['비주얼 콘셉트', '썸네일', '스타일 탐색', '일러스트']::text[], array['이미지', '사진', '디자인', '썸네일', '그림', '비주얼', '스타일']::text[], 5, 3, 3, 3, 3, 2, '유료 중심', 'paid', '무료 사용 제한', array['비주얼 품질', '스타일 탐색', '콘셉트 시안']::text[], '감각적인 비주얼과 썸네일 시안을 여러 방향으로 탐색할 수 있어요.', '스타일이 뚜렷한 이미지와 콘셉트 시안을 만드는 이미지 생성 도구입니다.', 'https://www.midjourney.com', '데모 데이터', true),
('firefly', 'Adobe Firefly', 'Adobe', '◒', 'logo-amber', array['image', 'design']::text[], array['상업용 이미지', '생성형 채우기', 'Adobe 편집', '배경 수정']::text[], array['이미지', '디자인', '사진', '편집', '배경', '상업', '생성']::text[], 4, 3, 4, 4, 4, 4, '무료 크레딧 있음', 'freemium', '무료 크레딧 제공', array['편집 연동', '생성형 채우기', '상업 활용 고려']::text[], '이미지를 만들고 바로 편집까지 이어가야 할 때 실무 흐름이 편해요.', '이미지 생성과 편집을 Adobe 작업 환경에서 이어갈 수 있는 도구입니다.', 'https://firefly.adobe.com', '데모 데이터', true),
('canva', 'Canva Magic Studio', 'Canva', 'C', 'logo-green', array['image', 'design', 'writing']::text[], array['SNS 카드', '프레젠테이션', '템플릿 디자인', '콘텐츠 제작']::text[], array['이미지', '디자인', '카드뉴스', '프레젠테이션', '인스타그램', '콘텐츠']::text[], 4, 4, 5, 3, 5, 4, '무료 / Pro', 'freemium', '무료 템플릿 제공', array['쉬운 편집', '템플릿', '콘텐츠 패키징']::text[], '디자인 경험이 적어도 템플릿과 AI를 조합해 결과물을 빠르게 만들어요.', '이미지·프레젠테이션·SNS 콘텐츠를 템플릿과 함께 제작하는 서비스입니다.', 'https://www.canva.com', '데모 데이터', true),
('runway', 'Runway', 'Runway AI', '▶', 'logo-green', array['video', 'image', 'design']::text[], array['영상 생성', '제품 영상', '장면 시각화', '영상 편집']::text[], array['영상', '쇼츠', '릴스', '유튜브', '애니메이션', '편집', '장면']::text[], 5, 3, 3, 3, 3, 3, '무료 크레딧 제공', 'freemium', '무료 크레딧 제공', array['영상 생성', '이미지→영상', '편집 기능']::text[], '텍스트와 이미지를 짧은 영상으로 바꾸고 아이디어를 장면으로 시각화해요.', '생성형 영상과 이미지 기반 장면 제작을 지원하는 영상 제작 도구입니다.', 'https://runwayml.com', '데모 데이터', true),
('capcut', 'CapCut', 'ByteDance', '↗', 'logo-amber', array['video']::text[], array['쇼츠 편집', '자동 자막', '릴스', '모바일 영상']::text[], array['영상', '쇼츠', '릴스', '유튜브', '자막', '편집', '모바일']::text[], 4, 4, 5, 3, 5, 5, '무료 / Pro', 'freemium', '무료 편집 기능 제공', array['자동 자막', '모바일 편집', '숏폼 템플릿']::text[], '짧은 영상을 빠르게 편집하고 자막·효과를 입히는 데 실용적이에요.', '숏폼 영상 제작과 모바일 편집에 초점을 둔 영상 편집 도구입니다.', 'https://www.capcut.com', '데모 데이터', true),
('cursor', 'Cursor', 'Anysphere', '⌘', 'logo-blue', array['coding', 'writing']::text[], array['코드베이스 이해', '디버깅', '리팩터링', 'Agent 개발']::text[], array['코딩', '코드', '개발', '오류', '버그', '프로그램', '리팩터링']::text[], 5, 3, 4, 3, 3, 3, '무료 / Pro', 'freemium', '무료 사용량 제공', array['코드베이스 이해', 'Agent', '개발 생산성']::text[], '프로젝트 파일을 함께 읽으며 오류 수정과 코드 변경을 이어갈 수 있어요.', '코드베이스 맥락을 이해하고 코드 작성·수정·디버깅을 돕는 에디터입니다.', 'https://www.cursor.com', '데모 데이터', true),
('notebooklm', 'NotebookLM', 'Google', 'N', 'logo-green', array['research', 'writing']::text[], array['PDF 학습', '논문 정리', '자료 기반 질문', '오디오 요약']::text[], array['pdf', '논문', '문서', '자료', '학습', '요약', '질문']::text[], 4, 4, 4, 3, 4, 5, '무료 중심', 'free', '무료 사용 가능', array['자료 기반 답변', '출처 맥락', '학습 보조']::text[], '내가 올린 PDF와 자료 안에서만 답을 찾고 싶을 때 특히 유용해요.', '사용자가 제공한 자료를 중심으로 요약하고 질문에 답하는 학습·리서치 도구입니다.', 'https://notebooklm.google.com', '데모 데이터', true),
('gamma', 'Gamma', 'Gamma', 'G', 'logo-amber', array['design', 'writing']::text[], array['프레젠테이션', '제안서', '문서 디자인', '발표자료']::text[], array['프레젠테이션', '발표', '제안서', '문서', '디자인', '슬라이드']::text[], 4, 3, 5, 3, 4, 4, '무료 / Pro', 'freemium', '무료 생성 크레딧 제공', array['빠른 슬라이드', '문서 구조화', '공유']::text[], '빈 슬라이드에서 시작하지 않고 발표 구조와 디자인을 빠르게 만들어요.', '텍스트 아이디어를 프레젠테이션과 문서 형태로 구성해주는 도구입니다.', 'https://gamma.app', '데모 데이터', true)
on conflict (id) do update set name = excluded.name, maker = excluded.maker, logo = excluded.logo, logo_class = excluded.logo_class, categories = excluded.categories, best_for = excluded.best_for, keywords = excluded.keywords, quality = excluded.quality, korean = excluded.korean, speed = excluded.speed, privacy = excluded.privacy, ease = excluded.ease, cost_fit = excluded.cost_fit, price = excluded.price, price_type = excluded.price_type, free_limit = excluded.free_limit, strengths = excluded.strengths, reason = excluded.reason, description = excluded.description, official_url = excluded.official_url, verified_at = excluded.verified_at, is_published = excluded.is_published, updated_at = now();

insert into public.news (id, label, published_at, title, summary, insight, category, source, source_url, status) values
('video-model-workflow', 'NEW RELEASE', null, '새로운 영상 생성 모델, 짧은 제품 영상 제작에 특화', '복잡한 편집 없이 텍스트 한 줄로 제품 장면을 빠르게 구성할 수 있어요.', '영상 제작자는 생성 모델의 화질보다 반복 수정 비용과 장면 일관성을 먼저 비교해보세요.', 'video', 'AI 네비게이터 편집팀', '#', 'draft'),
('automation-stack', 'WORKFLOW', null, '반복 업무를 줄이는 AI 자동화 조합 3가지', '메일 분류부터 보고서 초안까지, 도구를 연결해 시간을 아껴보세요.', '한 번에 모든 업무를 자동화하기보다 입력·변환·검수 단계를 나누면 실패를 줄일 수 있습니다.', 'workflow', 'AI 네비게이터 편집팀', '#', 'draft'),
('conditions-first', 'INSIGHT', null, 'AI를 잘 쓰는 사람은 질문보다 ‘조건’을 먼저 정한다', '좋은 답변을 얻기 위한 실전 프레임을 예시와 함께 소개합니다.', '예산, 보안, 결과물 형식, 마감 시간을 먼저 정하면 AI 선택과 프롬프트가 동시에 쉬워집니다.', 'insight', 'AI 네비게이터 편집팀', '#', 'draft'),
('privacy-checklist', 'SAFETY', null, '회사 자료를 AI에 넣기 전 확인할 보안 체크리스트', '학습 사용 여부, 보관 기간, 팀 관리 기능을 확인하고 업무 자료를 구분하세요.', '민감한 자료는 서비스 정책뿐 아니라 조직의 승인된 도구 목록과 함께 판단해야 합니다.', 'security', 'AI 네비게이터 편집팀', '#', 'draft'),
('research-comparison', 'HOW TO', null, '시장 조사를 시작할 때 검색 AI를 고르는 기준', '출처 표시, 최신성, 검색 범위, 결과 검증 흐름을 한 번에 비교하세요.', '검색 결과 하나를 사실로 받아들이지 말고 1차 출처를 직접 열어 핵심 수치를 다시 확인하세요.', 'research', 'AI 네비게이터 편집팀', '#', 'draft')
on conflict (id) do update set label = excluded.label, title = excluded.title, summary = excluded.summary, insight = excluded.insight, category = excluded.category, source = excluded.source, source_url = excluded.source_url, status = excluded.status, updated_at = now();

-- 데모 뉴스는 기본적으로 draft입니다. 실제 출처를 검증한 뒤 관리자 화면에서 review/published로 바꾸세요.


-- ========================================
-- 03 뉴스 자동 수집용 확장
-- 파일: supabase/migrations/20260720000000_news_ingestion.sql
-- ========================================

-- AI 네비게이터 뉴스 자동 수집 확장
-- 기존 supabase-schema.sql을 이미 실행한 프로젝트에서 1회 실행하세요.

create table if not exists public.news_sources (
  id text primary key,
  name text not null,
  publisher text not null,
  feed_url text not null,
  site_url text,
  category text not null default 'insight',
  trust_level text not null default 'official' check (trust_level in ('official', 'verified', 'community')),
  enabled boolean not null default true,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news add column if not exists source_id text references public.news_sources(id) on delete set null;
alter table public.news add column if not exists external_id text;

-- 기존 데모 뉴스는 source_id/external_id가 null이므로 충돌하지 않습니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'news_source_external_key'
  ) then
    alter table public.news add constraint news_source_external_key unique (source_id, external_id);
  end if;
end $$;

create index if not exists news_source_id_idx on public.news(source_id);
create index if not exists news_review_queue_idx on public.news(status, created_at desc);

alter table public.news_sources enable row level security;

drop policy if exists "admins read news sources" on public.news_sources;
create policy "admins read news sources" on public.news_sources for select using (public.is_admin());

drop policy if exists "admins manage news sources" on public.news_sources;
create policy "admins manage news sources" on public.news_sources for all using (public.is_admin()) with check (public.is_admin());

-- 자동 수집 대상: 공식 feed만 기본 활성화합니다.
insert into public.news_sources (id, name, publisher, feed_url, site_url, category, trust_level, enabled)
values
  ('openai-news', 'OpenAI News', 'OpenAI', 'https://openai.com/news/rss.xml', 'https://openai.com/news/', 'model', 'official', true),
  ('google-blog', 'Google Blog', 'Google', 'https://blog.google/rss/', 'https://blog.google/innovation-and-ai/technology/ai/', 'model', 'official', true),
  ('huggingface-blog', 'Hugging Face Blog', 'Hugging Face', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/blog', 'open-source', 'official', true)
on conflict (id) do update set name = excluded.name, publisher = excluded.publisher, feed_url = excluded.feed_url, site_url = excluded.site_url, category = excluded.category, trust_level = excluded.trust_level, updated_at = now();

