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