# FastAPI: 웹 프레임워크 본체
# 요청을 받고 응답을 돌려주는 모든 흐름의 시작점
from fastapi import FastAPI

# CORS 미들웨어: 다른 도메인에서 오는 요청을 허용하는 설정
# 없으면 프론트엔드(localhost:3000)에서 백엔드(localhost:8000)로
# 요청할 때 브라우저가 보안 정책으로 차단해버림
from fastapi.middleware.cors import CORSMiddleware

# settings(core/config.py) 가져옴
from app.core.config import settings


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


# 헬스체크 엔드포인트
# 서버가 살아있는지 확인하는 용도
# 배포 후 Railway, Vercel 등에서 주기적으로 이 경로를 찔러봄
@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
