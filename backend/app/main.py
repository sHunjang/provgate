# FastAPI: 웹 프레임워크 본체
# 요청을 받고 응답을 돌려주는 모든 흐름의 시작점
from fastapi import FastAPI, Request

# DB 연결 테스트용 임포트 추가
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from fastapi import Depends

# 에러 응답 형식
from fastapi.responses import JSONResponse

# CORS 미들웨어: 다른 도메인에서 오는 요청을 허용하는 설정
# 없으면 프론트엔드(localhost:3000)에서 백엔드(localhost:8000)로
# 요청할 때 브라우저가 보안 정책으로 차단해버림
from fastapi.middleware.cors import CORSMiddleware

# settings(core/config.py) 가져옴
from app.core.config import settings

# 라우터 임포트
from app.api.routes.onboarding import router as onboarding_router
from app.api.routes.problems import router as problems_router
from app.api.routes.hint import router as hint_router
from app.api.routes.gate import router as gate_router
from app.api.routes.submit import router as submit_router

# FastAPI 인스턴스 생성
# title, version은 자동 생성되는 API 문서(/docs)에 표시됨
app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",

    # debug 모드일 때만 API 문서 활성화 (배포 환경에서는 숨김)
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS 허용 도메인 목록
# 개발 중에는 localhost만 허용, 배포 후에는 실제 도메인 추가
origins = [
    "http://localhost:3000",    # Next.js 개발 서버
    "http://127.0.0.1:3000",
    "https://provgate-blush.vercel.app",
]

# 미들웨어 등록
# 미들웨어(Middleware) = 요청이 엔드포인트에 도달하기 전에 거치는 관문
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,    # 허용할 도메인
    allow_credentials=True,   # 쿠키/인증 헤더 허용
    allow_methods=["*"],      # GET, POST, PUT, DELETE 모두 허용
    allow_headers=["*"],      # 모든 헤더 허용
)

# 전역 에러 핸들러
# 예상치 못한 500 에러를 일관된 형식으로 반환
# Exception을 상속한 모든 에러를 잡아줌
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):

    # 에러 로깅 (Railway 로그에서 확인 가능)
    print(f"[전역 에러] {request.method} {request.url}: {exc}")

    return JSONResponse(
        status_code=500,
        content={"detail": "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요."}
    )

# 라우터 등록
# prefix 없이 등록하는 이유: 라우터 자체에 /api/onboarding prefix가 이미 있음
app.include_router(onboarding_router)
app.include_router(problems_router)
app.include_router(hint_router)
app.include_router(gate_router)
app.include_router(submit_router)


# 헬스체크 엔드포인트
# 서버가 살아있는지 확인하는 용도
# 배포 후 Railway, Vercel 등에서 주기적으로 이 경로를 찔러봄
@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}


# DB 연결 테스트 엔드포인드
# Depends(get_db): get_db()를 자동으로 실행해서 세션을 주입해줌
# 이게 바로 의존성 주입 패턴임 - 엔드포인트가 직접 세션을 만들지 않아도 됨
@app.get("/health/db")
async def health_check_db(db: AsyncSession = Depends(get_db)):

    # text(): 순수 SQL 문자열을 SQLAlchemy가 실행할 수 있게 감싸줌
    result = await db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "connected"}