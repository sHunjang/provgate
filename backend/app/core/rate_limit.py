# Rate Limiting 미들웨어
# 유저당 하루 API 호출 횟수를 제한하는 기능
# DB 기반으로 구현 (Redis 없이 Supabase PostgreSQL 활용)

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone


# API 타입별 하루 최대 호출 횟수
# 추후 유료 플랜에서는 이 값을 늘릴 수 있음
RATE_LIMITS = {
    "hint": 20,     # 힌트: 하루 최대 20회
    "gate": 10,     # 게이트: 하루 최대 10회
    "quiz": 3,      # 진단 퀴즈: 하루 최대 3회
}


# ================================
# Rate Limits 초과 여부 확인 함수
# ================================
async def check_rate_limit(
    user_id: str,
    api_type: str,
    db: AsyncSession,
) -> None:
    """
    Rate Limits 초과 여부 확인
    초과 시 429 Too Many Requests 에러 반환

    동작 방식:
        1. 오늘 날짜 기준으로 해당 API 호출 횟수 조회
            CURRENT_DATE: PostgreSQL의 현재 날짜 (지정 기준 자동 리셋)
        2. 제한 횟수 초과 시 HTTPException 발생
        3. 초과하지 않으면 현재 사용 횟수 반환
    """

    # api_type 유효성 검증
    if api_type not in RATE_LIMITS:
        raise ValueError(f"유효하지 않은 api_type: {api_type}")
    
    limit = RATE_LIMITS[api_type]


    # 오늘 사용한 횟수 조회
    # CURRENT_DATE: 오늘 00:00:00 ~ 23:59:59 범위
    # TIMESTAMPTZ: 타임존 인식 타입으로 정확한 날짜 비교
    result = await db.execute(
        text("""
            SELECT COUNT(*) as count
            FROM api_usage
            WHERE user_id = :user_id
            AND api_type = :api_type
            AND used_at >= CURRENT_DATE
            AND used_at < CURRENT_DATE + INTERVAL '1 DAY'
        """),
        {
            "user_id": user_id,
            "api_type": api_type,
        }
    )

    row = result.fetchone()
    current_count = row._mapping["count"] if row else 0


    # 제한 초과 시 에러 반환
    if current_count >= limit:
        raise HTTPException(
            status_code=429,
            detail={
                "message": f"오늘 {api_type} 사용 횟수를 초과했습니다.",
                "limit": limit,
                "used": current_count,
                "reset": "자정(00:00)에 초기화됩니다."
            }
        )


# ================================
# API 사용 기록 저장 함수
# ================================
async def record_api_usage(
    user_id: str,
    api_type: str,
    db: AsyncSession,
) -> None:
    """
    API 사용 기록 저장
    check_rate_limit 통과 후 반드시 호출해야 함

    동작 방식:
        api_usage 테이블에 현재 시간과 함께 사용 기록 INSERT
        used_at의 CURRENT_DATE 비교로 자정 자동 리셋
    """

    await db.execute(
        text("""
            INSERT INTO api_usage (user_id, api_type)
            VALUES (:user_id, :api_type)
        """),
        {
            "user_id": user_id,
            "api_type": api_type,
        }
    )


# ================================
# 현재 API 사용 현황 조회 함수
# ================================
async def get_usage_status(
    user_id: str,
    api_type: str,
    db: AsyncSession,
) -> dict:
    """
    현재 API 사용 현황 조회
    프론트엔드에 남은 횟수를 보여줄 때 사용
    """

    limit = RATE_LIMITS.get(api_type, 0)

    result = await db.execute(
        text("""
            SELECT COUNT(*) as count
            FROM api_usage
            WHERE user_id = :user_id
            AND api_type = :api_type
            AND used_at >= CURRENT_DATE
            AND used_at < CURRENT_DATE + INTERVAL '1 DAY'
        """),
        {
            "user_id": user_id,
            "api_type": api_type,
        }
    )

    row = result.fetchone()
    used = row._mapping["count"] if row else 0

    return {
        "api_type": api_type,
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "reset": "자정(00:00)에 초기화됩니다."
    }