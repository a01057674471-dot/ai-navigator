-- 뉴스 상세 화면에 전체 기사 본문을 저장합니다.
alter table public.news
  add column if not exists body text;

comment on column public.news.body is 'AI 네비게이터 편집 기사 전체 본문';
