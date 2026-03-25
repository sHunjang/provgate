# 역할: DB 연결
# 이유: 연결 로직을 한 곳에서 관리

# SQLAlchemy 2.0의 비동기 엔진과 세션을 가져옴
# 비동기(async)를 쓰는 이유: DB 쿼리를 기다리는 동안 다른 요청을 처리할 수 있어서 사용
# 예) 100명이 동시에 접속해도 한 명씩 순서대로 처리하지 않아도 됨
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

# sessionmaker: 세션(DB 연결 단위)을 찍어내는 공장 역할
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# settings(core/config.py)에서 DATABASE_URL을 가져옴
from app.core.config import settings


# 비동기 DB 엔진 생성
# 엔진(engine) = DB와의 실제 연결을 담당하는 객체
# echo=True: 실행되는 SQL 쿼리를 터미널에 출력 (개발할 때 디버깅용)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
)

# 세션 공장 생성
# 세션(Session) = DB와 대화하는 하나의 단위 (요청 하나당 세션 하나)
# autocommit=False : 명시적으로 commit() 호출해야 DB에 반영됨 (실수 방지)
# autoflush=False : 명시적으로 flush() 호출해야 쿼리가 실행됨
# bind=engine : 위에서 만든 engine에 연결
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
)

# 모든 DB 모델(테이블)의 부모 클래스
# 나중에 models/ 폴더에서 User, Problem 등을 만들 때 이걸 상속받음
class Base(DeclarativeBase):
    pass

# DB 세션을 API 엔드포인트에 주입해주는 함수 (의존성 주입 패턴)
# async def get_db()를 FastAPI의 Depends()에 넣으면
# 요청이 들어올 때마다 자동으로 세션을 열고 닫아줌
async def get_db():

    # with 블록을 벗어나면 자동으로 세션을 닫아줌 (메모리 누수 방지)
    async with AsyncSessionLocal() as session:

        # yield: return과 달리 함수를 일시정지하고 세션을 넘겨줌
        # 엔드포인트 실행이 끝나면 다시 돌아와서 with 블록을 정상 종료
        yield session