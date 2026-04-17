# 역할 : 환경변수 관리
# 이유 : DB URL, API Key 등 민감정보 중앙화

# pydantic_settings: 환경변수를 python 클래스로 관리해주는 라이브러리
# BaseSettings를 상속하면 .env 파일을 자동으로 읽어와줌
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    
    # 앱 기본 정보 - 나중에 자동 생성되는 API 문서에 표시됨
    APP_NAME: str = "ProvGate API"
    DEBUG: bool = False


    #Supabase 연결 정보 - 실제 값은 .env 파일에서 읽어옴
    # 여기서는 타입과 기본값(없음)만 선언해두는 것
    DATABASE_URL: str = ""

    # Claude API 키 - 힌트/게이트 문제 생성에 사용
    ANTHROPIC_API_KEY: str = ""

    class Config:
        # 이 파일을 읽어서 위 변수들을 채워줌
        # backend/ 폴더 안에 .env 파일을 만들면 자동으로 인식
        env_file = ".env"

        # 대소문자 구분 없이 환경변수 읽기
        case_sensitive = False

# 다른 파일에서 'from app.core.config import settings' 로 가져다 씀
# 매번 새로 만들지 않고 하나의 인스턴스를 공유하는 싱글톤 패턴
settings = Settings()