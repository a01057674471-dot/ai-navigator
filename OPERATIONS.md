# AI 네비게이터 실서비스 연결 체크리스트

## 1. Supabase

1. Supabase Project를 생성합니다.
2. SQL Editor에서 `supabase-schema.sql`을 실행합니다.
3. `supabase-seed.sql`을 실행합니다.
4. `supabase/migrations/20260720000000_news_ingestion.sql`을 실행합니다.
5. Authentication → URL Configuration에 배포 도메인을 추가합니다.
6. 회원가입 후 `profiles.role`을 `admin`으로 바꿉니다.

## 2. Vercel 배포

1. 저장소를 GitHub에 push합니다.
2. Vercel에서 저장소를 Import합니다.
3. Project Settings → Environment Variables에 다음 값을 등록합니다.

```text
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

4. `main` 브랜치에 push해 배포합니다.
5. 배포 주소에서 로그인, 저장, 뉴스 노출을 확인합니다.

`PUBLIC_SUPABASE_ANON_KEY`는 브라우저에 노출되는 공개 키입니다. `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 환경변수나 HTML/JavaScript에 넣지 않습니다.

## 3. GitHub Actions 뉴스 수집

Repository Settings → Secrets and variables → Actions → New repository secret:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

`Ingest official AI news` workflow를 수동 실행해 처음 연결을 확인합니다. 이후 매시간 자동 실행됩니다.

## 4. 출시 전 수동 점검

- [ ] Supabase Auth 이메일 인증/리다이렉트
- [ ] 일반 사용자에게 draft/review 뉴스가 보이지 않음
- [ ] 관리자만 뉴스 관리자 메뉴를 볼 수 있음
- [ ] AI 도구 저장 후 새로고침해도 유지됨
- [ ] 다른 브라우저/기기에서 로그인 후 저장 목록 동기화
- [ ] RSS 수집 후 draft 콘텐츠가 생성됨
- [ ] 공식 출처 링크와 발행일 검수
- [ ] 검수한 콘텐츠만 published로 발행
- [ ] 모바일 화면에서 검색·로그인·뉴스 상세 확인
- [ ] 브라우저 Console에 오류 없음

## 5. 장애 대응

- RSS 오류: 관리자 화면의 `수집 소스 상태`에서 오류 확인
- 인증 오류: Supabase Auth Redirect URL과 Site URL 확인
- 데이터 오류: RLS 정책과 `profiles.role` 확인
- 배포 오류: Vercel Build Log에서 `npm run build` 확인
- 수집 중복: `source_id + external_id` unique 제약 확인
