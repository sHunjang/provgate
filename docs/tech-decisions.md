# 기술 선택 근거

## Backend: FastAPI
- **선택 이유**
  - Python 기반이라 AI/ML 라이브러리와 궁합이 좋음
  - async/await 기본 지원 → Claude API 같은 외부 API 비동기 호출에 적합
  - 코드 작성만 하면 /docs에서 API 문서 자동 생성
- **대안과 비교**
  - Django: 기능이 너무 많고 무거움, 이 프로젝트 규모에 과함
  - Flask: 가볍지만 async 지원이 약하고 직접 설정할 게 많음

## Database: Supabase (PostgreSQL)
- **선택 이유**
  - PostgreSQL 기반이라 JSONB 타입 지원 (test_cases 컬럼에 활용)
  - 무료 플랜으로 프로토타입 운영 가능
  - 관리형 서비스라 DB 서버 직접 관리 불필요
- **대안과 비교**
  - MySQL: JSONB 지원 약함
  - MongoDB: 관계형 데이터(user→submission→problem)에 부적합

## ORM: SQLAlchemy 2.0
- **선택 이유**
  - async 세션 지원 (1.x 버전은 미지원)
  - Python ORM 중 가장 넓은 생태계
- **핵심 패턴**
  - 의존성 주입(get_db)으로 세션 관리
  - autocommit=False로 명시적 트랜잭션 관리

## AI: Claude API (claude-sonnet-4-6)
- **선택 이유**
  - 소크라테스식 힌트 생성에 긴 컨텍스트 이해 능력 필요
  - 이해 확인 게이트 문제 생성의 일관성

## 온보딩 수준 확정 알고리즘
- **자료구조**: level_order 리스트 + 인덱스 기반 이동
  - 리스트를 쓴 이유: 수준 간 순서 관계(beginner < intermediate < advanced)를
    인덱스로 표현하면 상향/하향 로직이 단순해짐
  - min/max로 경계값 처리: 배열 인덱스 범위를 벗어나는 것을 방지
- **DB upsert**: PostgreSQL ON CONFLICT DO UPDATE
  - 이유: 같은 사용자가 온보딩을 재시도할 때 중복 행 생성 방지

## Claude API 응답 처리 전략
- system/user 메시지 분리
  - system: 역할과 출력 형식 규칙 (고정)
  - user: 실제 요청 내용 (변동)
- max_tokens 엔드포인트별 차등 설정
  - 퀴즈 생성: 2000 (한글 5문항)
  - 힌트 생성: 500 (짧고 명확하게)
  - 게이트 문제: 800
  - 유사 문제: 1500
- 응답 전처리: ```json 코드 블록 마커 제거 후 파싱

## Frontend: Next.js 14 App Router
- **선택 이유**
  - 파일 시스템 기반 라우팅으로 폴더 구조 = URL 구조
  - 서버/클라이언트 컴포넌트 분리로 번들 크기 최적화
  - "use client" 선언으로 명시적 컴포넌트 구분
- **라우팅 구조**
  - / → 수준 선택 UI
  - /onboarding/quiz → 진단 퀴즈
  - /onboarding/result → 결과 + 로드맵

## 상태 관리
- 별도 상태관리 라이브러리 미사용 (Redux, Zustand 등)
- 이유: 프로토타입 규모에서 useState로 충분
- 페이지 간 데이터 전달: URL 쿼리 파라미터 활용
  (answers, correctAnswers를 JSON.stringify로 직렬화)

## React Strict Mode
- 개발 환경에서 reactStrictMode: false로 설정
- 이유: useEffect 2번 실행으로 Claude API 중복 호출 방지
- 배포 환경에서는 정상 동작하므로 기능상 문제 없음