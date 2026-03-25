# 시스템 아키텍처

## 전체 구조
```bash
Browser (Next.js)
    ↕ HTTP/REST
FastAPI (Railway)
    ↕ asyncpg
Supabase (PostgreSQL)
    ↕ httpx
Claude API
```

## 레이어 구조 (Backend)
```bash
app/
├── main.py        → 진입점, 미들웨어 등록
├── core/
│   ├── config.py  → 환경변수 중앙화 (싱글톤 패턴)
│   └── database.py→ DB 연결, 세션 관리 (의존성 주입 패턴)
├── api/routes/    → 엔드포인트 (관심사 분리)
├── models/        → DB 테이블 정의 (SQLAlchemy ORM)
└── schemas/       → 요청/응답 형식 (Pydantic)
```

## 설계 원칙
- **관심사 분리**: DB연결 / 비즈니스로직 / API 각각 다른 레이어
- **의존성 주입**: get_db()로 세션을 엔드포인트에 자동 주입
- **싱글톤 패턴**: settings 인스턴스를 모듈 레벨에서 한 번만 생성