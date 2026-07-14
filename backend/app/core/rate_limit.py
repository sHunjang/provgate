# Rate Limiting 미들웨어
# 유저당 하루 API 호출 횟수를 제한하는 기능
# DB 기반으로 구현 (Redis 없이 Supabase PostgreSQL 활용)

import os

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
from typing import Optional

# settings에서 DEV_MODE를 가져오도록 통일
# (config.py의 Settings 클래스가 이미 .env를 검증된 방식으로 읽고 있으니,
#  os.getenv()로 따로 다시 읽는 것보다 이쪽이 일관성 있음)
from app.core.config import settings

# API 타입별 하루 최대 호출 횟수
# 추후 유료 플랜에서는 이 값을 늘릴 수 있음
RATE_LIMITS = {
    "hint": 20,             # 힌트: 하루 최대 20회
    "gate": 10,             # 게이트: 하루 최대 10회
    "quiz": 3,              # 진단 퀴즈: 하루 최대 3회
    "design_feedback": 10,  # 설계 피드백: 하루 최대 10회
    # hint(20)보다 적게 잡은 이유:
    #   - design_feedback은 한 번 호출할 때마다 학습자의 설계(글) + 코드 +
    #     실행 결과(JSON)까지 한꺼번에 분석해야 해서, hint보다 입력 토큰이 훨씬 많음
    #   - 토큰이 많을수록 API 호출 비용이 커지므로, 비용 관리 차원에서 더 낮게 설정
    #   - gate(10)와 비슷한 수준으로 맞춤: gate도 "이해도를 깊게 검증"하는
    #     무거운 작업이라 같은 선상에 둠
}

# 게스트 계정 user_id (Rate Limit 제외 대상)
# OKKY 등 외부 공개 시 여러 명이 공유하는 계정이라
# 일반 유저와 동일한 제한을 적용하면 금방 소진되어 핵심 기능을 못 보고 이탈함
GUEST_USER_ID = os.getenv("GUEST_USER_ID", "")


# ============================================================
# 개발 모드 여부
# ============================================================
# os.getenv() 직접 호출 → settings.DEV_MODE 참조
# settings.DEV_MODE는 이미 pydantic이 "true"/"false" 문자열을
# bool 타입으로 정확히 변환해준 값이라, 별도 문자열 비교 로직
# (.lower() in ("true", "1"))이 필요 없어짐
DEV_MODE = settings.DEV_MODE


# ============================================================
# Claude Sonnet 추정 단가 (백만 토큰당 USD)
# ============================================================
# Anthropic 공식 가격 페이지 기준이 아니라 사업 원가 추정용 상수라,
# 실제 계약/가격 정책이 바뀌면 이 값만 갱신하면 됨 — 코드 곳곳에
# 하드코딩하지 않고 한 곳에 모아둔 이유
PRICE_PER_INPUT_TOKEN_USD = 3.0 / 1_000_000
PRICE_PER_OUTPUT_TOKEN_USD = 15.0 / 1_000_000

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
            CURRENT_DATE: PostgreSQL의 현재 날짜 (자정 기준 자동 리셋)
        2. 제한 횟수 초과 시 HTTPException 발생
        3. 초과하지 않으면 그대로 함수 종료 (반환값 없음)

    CS 개념 - 자료구조:
        RATE_LIMITS는 딕셔너리(해시맵)로 구현됨
        api_type 문자열을 키로 사용해 O(1) 시간복잡도로 제한값을 조회함
        (만약 리스트로 구현했다면 매번 순회해야 해서 O(n)이 걸림)
    """
    # print(f"[DEBUG] DEV_MODE = {DEV_MODE}")  # 임시 확인용, 확인 후 지워도 됨
    # ============================================================
    # 개발 모드에서는 Rate Limit 자체를 건너뜀
    # ============================================================
    # 매번 SQL로 api_usage 기록을 지우는 대신, 개발 중에는 이 함수가
    # 아무것도 안 하고 바로 통과하도록 함. GUEST_USER_ID 우회와 동일한
    # "특정 조건에서 제한을 스킵"하는 패턴을 재사용함
    if DEV_MODE:
        return

    # 게스트 계정은 Rate Limit 체크 스킵
    # 여러 명이 공유하는 계정이므로 제한을 두면 OKKY 체험단이 핵심 기능을 못 봄
    if GUEST_USER_ID and user_id == GUEST_USER_ID:
        return

    # api_type 유효성 검증
    # RATE_LIMITS 딕셔너리에 없는 타입이면 코드 작성 실수이므로 즉시 에러
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
    # 신규: 선택적 토큰 파라미터 — 기본값 None으로 둬서
    # 아직 이 값을 안 넘기는 호출부(있다면)가 있어도 깨지지 않게 함
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
) -> None:
    """
    API 사용 기록 저장
    check_rate_limit 통과 후 반드시 호출해야 함

    input_tokens/output_tokens가 주어지면 이번 호출의 실측
    원가(cost_usd)를 계산해서 같이 저장함. Claude 응답 객체의
    message.usage에서 이 값을 뽑아 그대로 넘기면 됨
    """
    cost_usd = None
    if input_tokens is not None and output_tokens is not None:
        cost_usd = (
            input_tokens * PRICE_PER_INPUT_TOKEN_USD
            + output_tokens * PRICE_PER_OUTPUT_TOKEN_USD
        )

    await db.execute(
        text("""
            INSERT INTO api_usage (user_id, api_type, input_tokens, output_tokens, cost_usd)
            VALUES (:user_id, :api_type, :input_tokens, :output_tokens, :cost_usd)
        """),
        {
            "user_id": user_id,
            "api_type": api_type,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
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