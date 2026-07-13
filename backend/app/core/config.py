# 역할 : 환경변수 관리
# 이유 : DB URL, API Key 등 민감정보 중앙화

# pydantic_settings: 환경변수를 python 클래스로 관리해주는 라이브러리
# BaseSettings를 상속하면 .env 파일을 자동으로 읽어와줌
from pydantic_settings import BaseSettings

# 서버 시작 시 필수 환경변수 누락되면 즉시 에러 발생
# 런타임에 에러나는 것보다 시작 시점에 잡는 게 훨씬 좋음
from  pydantic import field_validator

class Settings(BaseSettings):
    
    # 앱 기본 정보 - 나중에 자동 생성되는 API 문서에 표시됨
    APP_NAME: str = "ProvGate API"
    DEBUG: bool = False


    #Supabase 연결 정보 - 실제 값은 .env 파일에서 읽어옴
    # 여기서는 타입과 기본값(없음)만 선언해두는 것
    DATABASE_URL: str = ""

    # Supabase ProvGate URL - JWT 검증에 사용
    SUPABASE_URL: str = ""

    # Claude API 키 - 힌트/게이트 문제 생성에 사용
    ANTHROPIC_API_KEY: str = ""

    # Supabase anon key - JWKS 엔드포인트 접근 시 필요
    SUPABASE_ANON_KEY: str = ""

    # Supabase JWT Secret - 토큰 직접 검증용
    SUPABASE_JWT_SECRET: str = ""

    # 개발 모드 여부 (rate_limit.py에서 사용)
    # .env에 DEV_MODE=true가 있으면 이 필드로 받아짐
    # 기본값을 false에 둬서, .env에 이 값이 없어도(배포 환경 등) 에러 없이 동작
    DEV_MODE: bool = False

    # DATABASE_URL 검증
    # 서버 시작 시 빈 값이면 즉시 에러 발생
    @field_validator("DATABASE_URL", mode="before")
    def validate_database_url(cls, v):
        if not v:
            raise ValueError(
                "DATABASE_URL이 설정되지 않았습니다. "
                ".env 파일을 확인해주세요."
            )
        
        return v

    # ANTHROPIC_API_KEY 검증
    @field_validator("ANTHROPIC_API_KEY", mode="before")
    def validate_anthropic_api_key(cls, v):

        if not v:
            raise ValueError(
                "ANTHROPIC_API_KEY가 설정되지 않았습니다. "
                ".env 파일을 확인해주세요."
            )
        
        return v

    # SUPABASE_URL 검증
    @field_validator("SUPABASE_URL", mode="before")
    def validate_supabase_url(cls, v):
        if not v:
            raise ValueError(
                "SUPABASE_URL이 설정되지 않았습니다. "
                ".env 파일을 확인해주세요."
            )
        return v

    # Supabase JWKS 엔드포인트 접근 시 필요한 API 키 검증
    @field_validator("SUPABASE_ANON_KEY", mode="before")
    def validation_supabase_anon_key(cls, v):
        if not v:
            raise ValueError(
                "SUPABASE_ANON_KEY가 설정되지 않았습니다. "
                ".env 파일을 확인하세요."
            )
        return v

    class Config:
        # 이 파일을 읽어서 위 변수들을 채워줌
        # backend/ 폴더 안에 .env 파일을 만들면 자동으로 인식
        env_file = ".env"

        # 대소문자 구분 없이 환경변수 읽기
        case_sensitive = False

# 다른 파일에서 'from app.core.config import settings' 로 가져다 씀
# 매번 새로 만들지 않고 하나의 인스턴스를 공유하는 싱글톤 패턴
settings = Settings()