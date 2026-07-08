# JWT 인증 미들웨어
# Supabase가 발급한 JWT 토큰을 검증해서 유저 정보를 추출
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

from app.core.config import settings

# Optional 타입 사용을 위해 추가
from typing import Optional

# HTTPBearer: Authorization: Bearer <token> 형식의 헤더를 자동으로 파싱
# auto_error=False: 토큰 없어도 에러 안 냄 (선택적 인증에 사용)
security = HTTPBearer(auto_error=False)

# Supabase 클라이언트 초기화 (싱글톤)
# service_role_key 대신 anon_key 사용 (최소 권한 원칙)
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_ANON_KEY,
)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    JWT 토큰을 검증하고 현재 유저 정보를 반환하는 의존성 함수

    동작 방식:
    1. Authorization 헤더에서 JWT 토큰 추출
    2. Supabase SDK의 get_user()로 토큰 검증
        - Supabase 서버에서 직접 검증하므로 ECC/HS256 모두 지원
        - 토큰 만료, 위조 여부 자동 검증
    3. 검증된 유저 정보 반환
    """

    # 토큰이 없으면 인증 실패
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="인증이 필요합니다. 로그인 후 다시 시도하세요."
        )
    
    token = credentials.credentials


    try:
        
        # Supabase SDK로 토큰 검증
        # get_user(): 토큰을 Supabase 서버에서 직접 검증
        # ECC (P-256), HS256 모두 지원
        response = supabase.auth.get_user(token)

        if not response or not response.user:
            raise HTTPException(
                status_code=401,
                detail="유효하지 않은 토큰입니다."
            )
        
        user = response.user

        return {
            "user_id": str(user.id),
            "email": user.email,
        }
    
    except Exception as e:
        print(f"[AUTH] Error: {e}")
        raise HTTPException(
            status_code=401,
            detail="토큰 검증 실패. 다시 로그인해주세요."
        )


# ============================================================
# 신규: 선택적 인증 (Optional Authentication)
# ============================================================
# get_current_user와의 차이:
#   get_current_user: 토큰 없으면 무조건 401 에러 (로그인 필수 페이지용)
#   get_current_user_optional: 토큰 없으면 그냥 None 반환 (게스트도 허용하되,
#     로그인한 사람이면 그 신원을 확실히 검증하고 싶을 때 사용)
#
# 사용처 예시: 퀴즈 생성(quiz/generate)
#   - 비로그인 사용자도 퀴즈를 체험해볼 수 있어야 함 (게스트 체험 컨셉 유지)
#   - 근데 로그인한 사용자의 경우, "이 요청이 정말 이 사람 본인이 보낸 게
#     맞는지"는 확실히 해야 함 — 안 그러면 Rate Limit(하루 사용 횟수 제한)을
#     "내 사용량을 남의 이메일로 떠넘기기" 방식으로 무한정 우회할 수 있음
async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> Optional[dict]:
    # 토큰 자체가 없으면 "비로그인 게스트"로 간주하고 조용히 None 반환
    # (에러를 던지지 않음 — 이게 get_current_user와의 핵심 차이)
    if not credentials:
        return None

    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            # 토큰이 있긴 한데 유효하지 않은 경우도 에러 대신 게스트 취급
            # (예: 만료된 세션 — 굳이 로그인 페이지로 튕기지 않고 게스트로 계속 진행)
            return None

        user = response.user
        return {
            "user_id": str(user.id),
            "email": user.email,
        }

    except Exception as e:
        print(f"[AUTH] Optional auth error: {e}")
        return None