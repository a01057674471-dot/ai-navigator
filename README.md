# AI 네비게이터 MVP

사용자가 하려는 일을 입력하면 적합한 AI 도구를 찾아주고, AI 뉴스와 활용 인사이트를 보여주는 반응형 웹앱 MVP입니다.

## 현재 구현된 기능

- 자연어 작업 입력 → 카테고리 분류 → 평가 점수 기반 추천
- AI 도구 12개 데이터베이스 샘플
- 글쓰기·문서 / 이미지·디자인 / 영상 / 검색·리서치 / 코딩 필터
- 도구 상세 모달과 공식 사이트 링크
- 데모 모드에서 `localStorage` 기반 AI 도구 저장
- Supabase 연결 시 이메일 로그인·회원가입·Magic Link
- 로그인 사용자의 저장 목록을 `saved_tools`에 동기화
- Supabase의 published 도구·뉴스 자동 조회
- 관리자 권한 사용자의 뉴스 초안·검수·발행·수정·삭제 화면
- 데모 뉴스 데이터 렌더링과 뉴스 상세 모달
- 모바일 하단 내비게이션 및 반응형 레이아웃
- 뉴스·도구 데이터를 화면 코드와 분리

## 실행 방법

### 로컬 서버 권장

```bash
cd projects/ai-navigator
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080`을 엽니다. Supabase 인증 리다이렉트를 사용하려면 `file://` 대신 로컬 서버를 사용하세요.

### Supabase 연결

1. Supabase에서 새 Project를 만듭니다.
2. SQL Editor에서 `supabase-schema.sql` 전체를 실행합니다.
3. 이어서 `supabase-seed.sql`을 실행해 도구 12개와 데모 뉴스 5개를 넣습니다.
4. Project Settings → API의 **Project URL**과 공개 **anon key**를 배포 환경변수로 등록합니다. 로컬에서 직접 설정할 때만 `config.js`에 입력합니다.
5. Authentication → URL Configuration에서 `http://localhost:8080`과 실제 배포 도메인을 Site URL/Redirect URL에 추가합니다.
6. 회원가입 후 `profiles`에서 해당 사용자의 `role`을 `admin`으로 바꿉니다.
7. 관리자 계정으로 로그인하면 `뉴스 관리자` 메뉴에서 초안·검수·발행을 관리할 수 있습니다.

```js
// config.js — 공개 anon key만 사용
window.AI_NAVIGATOR_CONFIG = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-public-anon-key',
  adminEmails: []
};
```

`service_role key`는 절대로 `config.js`, HTML, JavaScript 또는 Git에 넣지 마세요. 관리자 권한은 `profiles.role`과 RLS 정책으로 통제합니다.

## 배포

Vercel 기준으로 저장소를 Import하고 다음 Environment Variables를 등록합니다.

```text
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

`vercel.json`이 `npm run build:production`을 실행합니다. 공개 Supabase 변수가 없으면 프로덕션 빌드가 실패하므로 데모 화면이 실수로 배포되지 않습니다. 로컬 데모만 실행할 때는 `npm run build`를 사용합니다.

GitHub Actions의 `Validate AI Navigator`가 JavaScript·HTML 참조·필수 파일·프로덕션 빌드 안전성을 검사합니다. 전체 출시 점검표는 `OPERATIONS.md`를 참고하세요.


```text
ai-navigator/
├── index.html            # 레이아웃·스타일·화면 마크업
├── app.js                # 추천·인증·저장·뉴스 관리자·모달 로직
├── config.js             # Supabase 공개 설정
├── supabase-schema.sql   # 테이블·RLS·Auth trigger
├── supabase-seed.sql     # 초기 도구·뉴스 데이터
├── supabase/migrations/  # 뉴스 RSS 수집용 DB 확장
├── news-ingest.mjs       # 공식 RSS → draft 수집 worker
├── .github/workflows/    # 정기 수집 실행 예시
├── data/
│   ├── tools.js          # Supabase 미연결 시 fallback 도구 데이터
│   └── news.js           # Supabase 미연결 시 fallback 뉴스 데이터
├── PRD.md                # 제품 기획서
└── README.md             # 실행 및 연결 안내
```

## 공식 뉴스 자동 수집

자동 수집을 활성화하려면 먼저 `supabase/migrations/20260720000000_news_ingestion.sql`을 Supabase SQL Editor에서 실행합니다. 현재 공식 RSS 소스는 OpenAI News, Google Blog, Hugging Face Blog입니다. 수집 소스는 `news_sources` 테이블에서 관리하며, Anthropic·Meta처럼 공식 RSS가 확인되지 않은 소스는 기본 등록하지 않았습니다.

로컬에서 연결을 확인할 때는 다음처럼 실행합니다.

```bash
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='서버용 service_role key'
node news-ingest.mjs --dry-run
node news-ingest.mjs
```

`--dry-run`은 RSS를 읽고 결과만 출력하며 Supabase에 쓰지 않습니다. 실제 실행 시 새 글은 `news` 테이블에 `draft`로 upsert되고, `source_id + external_id`로 중복을 방지합니다. 자동 수집 글은 원문 요약만 채워지며, 관리자가 출처·요약·인사이트를 검수한 뒤 발행해야 합니다.

### GitHub Actions 설정

`.github/workflows/news-ingest.yml`을 저장소에 넣고 Repository Settings → Secrets and variables → Actions에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 등록하면 매시간 수집할 수 있습니다. `service_role key`는 반드시 GitHub Secret으로만 관리하세요.

관리자 화면의 **수집 소스 상태**에서 마지막 성공 시각, 오류, 수집 건수를 확인할 수 있습니다.

### AI 한국어 초안 자동 작성

GitHub Actions Secret에 `OPENAI_API_KEY`를 추가하면, 새로 발견된 공식 뉴스 중 소스별 최대 3건을 AI가 한국어 제목·요약·본문·활용 포인트로 정리합니다. 기본 모델은 비용을 고려해 `gpt-5.6-luna`를 사용하며 `OPENAI_MODEL`, `AI_DRAFT_LIMIT` 환경변수로 바꿀 수 있습니다.

AI가 작성한 글도 상태는 항상 `draft`이며 자동 공개되지 않습니다. 관리자 화면에서 출처와 본문을 확인한 뒤 직접 `published`로 바꿔야 합니다. API 키가 없거나 AI 생성이 실패하면 기존 RSS 초안으로 저장되므로 뉴스 수집 자체는 중단되지 않습니다. 이미 수집되거나 편집된 뉴스는 다시 덮어쓰지 않습니다.


현재 MVP는 별도 서버 없이 브라우저에서 아래 가중치로 계산합니다.

```text
작업 적합도 40%
품질       20%
비용 적합도 15%
한국어     10%
속도        5%
보안       10%
```

`data/tools.js`의 `categories`, `keywords`, `quality`, `korean`, `speed`, `privacy`, `costFit` 값을 기준으로 순위를 계산합니다.

## 데이터 업데이트 방법

### 도구 추가

`data/tools.js`의 `window.AI_TOOLS` 배열에 아래 형태의 객체를 추가합니다.

```js
{
  id: 'unique-id',
  name: '도구 이름',
  maker: '제작사',
  categories: ['writing'],
  bestFor: ['회의록', '요약'],
  keywords: ['회의', '문서', '요약'],
  quality: 4,
  korean: 4,
  speed: 4,
  privacy: 3,
  ease: 4,
  costFit: 4,
  price: '무료 / Pro',
  strengths: ['장점 1', '장점 2'],
  reason: '추천 이유',
  description: '상세 설명',
  officialUrl: 'https://example.com',
  verifiedAt: '검증일'
}
```

### 뉴스 추가

`data/news.js`의 `window.AI_NEWS` 배열에 다음 필드를 추가합니다.

- `id`
- `label`
- `date`
- `title`
- `summary`
- `insight`
- `category`
- `source`
- `sourceUrl`

실서비스에서는 공식 RSS/API 또는 허용된 소스에서 가져온 콘텐츠를 관리자 검수 후 발행해야 합니다.

## 구현된 백엔드 연결 범위

1. Supabase `tools`, `news`, `profiles`, `saved_tools` 테이블과 RLS 정책
2. 공개 데이터는 `is_published = true`, `status = published`만 조회
3. Supabase Auth 이메일·비밀번호, Magic Link
4. 로그인 사용자 저장 목록의 insert/delete 동기화
5. 관리자 뉴스 화면과 발행 상태(`draft`, `review`, `published`)
6. 관리자만 뉴스 전체 조회·생성·수정·삭제 가능
7. Supabase 미설정 시 데모 데이터와 localStorage fallback

## 다음 확장 순서

1. 공식 RSS/API 수집 worker와 원문 검수 큐 연결
2. 가격·무료 한도·검증일을 주기적으로 확인하는 운영 화면 추가
3. 추천 결과 만족도와 클릭 이벤트 수집
4. 사용자 관심 분야와 추천 가중치 저장
5. LLM을 작업 분류와 추천 설명에 연결하되, 최종 도구 순위는 구조화된 데이터와 점수로 결정

## 콘텐츠 주의사항

Supabase에 seed로 들어가는 뉴스도 기본 상태가 `draft`입니다. 실제 공개 전에는 공식 출처 링크, 발행일, 검증일, 편집자 검수 상태를 넣고 관리자 화면에서 `review` 또는 `published`로 전환해야 합니다.
