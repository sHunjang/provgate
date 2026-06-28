# 학습 통계 조회 라우터
# 유저의 문제 풀이 통계를 1번의 쿼리로 효율적으로 조회

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db

# get_current_user: JWT 토큰을 검증하고 유저 정보를 반환하는 의존성 함수
from app.core.auth import get_current_user


router = APIRouter(prefix="/api/stats", tags=["stats"])

# GET /api/stats
# 이메일을 URL 파라미터로 받지 않고
# JWT 토큰에서 유저 정보를 추출해서 사용
# => 다른 유저의 통계를 조회하는 것이 불가능해짐 (보안)
@router.get("")
async def get_stats(
    # Depends(get_current_user): JWT 토큰 자동 검증
    # 토큰이 없거나 유효하지 않으면 401 에러 반환
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # ── 1. 유저 ID 조회 ───────────────────────
    # JWT에서 추출한 email로 우리 users 테이블의 id 조회
    # JWT의 user_id(auth.users.id)와 우리 users.id가 다르기 때문
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": current_user["email"]}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = user._mapping["id"]

    # ── 2. 유저 학습 통계 조회 (집계 쿼리) ─────
    # N+1 문제 방지: 통계를 항목마다 따로 쿼리하지 않고 1번에 모두 집계
    #
    # 사용된 SQL 개념:
    #   COUNT(*) FILTER (WHERE 조건): 조건에 맞는 행만 카운트
    #   COALESCE(값, 기본값): NULL이면 기본값으로 대체 (데이터 없을 때 0 보장)
    #   JOIN: submissions와 problems를 연결해 문제의 level 정보를 함께 사용
    stats_result = await db.execute(
        text("""
            SELECT
                -- 전체 완료 문제 수 (게이트 통과한 것만, 공용 문제만 집계)
                COUNT(*) FILTER (WHERE gate_passed = TRUE) AS total_completed,

                -- 난이도별 완료 문제 수
                COUNT(*) FILTER (WHERE gate_passed = TRUE AND p.level = 'beginner') AS beginner_completed,
                COUNT(*) FILTER (WHERE gate_passed = TRUE AND p.level = 'intermediate') AS intermediate_completed,
                COUNT(*) FILTER (WHERE gate_passed = TRUE AND p.level = 'advanced') AS advanced_completed,

                -- 평균 풀이 시간 (완료 문제 기준, NULL이면 0)
                COALESCE(AVG(s.time_spent_sec) FILTER (WHERE gate_passed = TRUE), 0) AS avg_time_sec,

                -- 총 힌트 사용 횟수 (NULL이면 0)
                COALESCE(SUM(s.hint_count), 0) AS total_hints,

                -- 총 게이트 시도 횟수 (NULL이면 0)
                COALESCE(SUM(s.gate_attempts), 0) AS total_gate_attempts

            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            WHERE s.user_id = :user_id
            -- 신규: AI가 개인 전용으로 생성한 문제는 "전체 진행률" 집계에서 제외
            -- (분모인 total_result 쿼리와 기준을 통일해야 "10/9" 같은 모순이 안 생김)
            AND p.owner_user_id IS NULL
        """),
        {"user_id": user_id}
    )

    stats = stats_result.fetchone()

    # ── 3. 레벨별 전체 문제 수 조회 (분모용) ───
    # 왜 이 쿼리가 필요한가?
    #   기존엔 프론트엔드가 분모(예: "8/5"의 5)를 5로 하드코딩했음
    #   → 커리큘럼 개편으로 문제 수가 늘면서 "8/5"처럼 분자 > 분모 모순 발생
    #   해결: 백엔드가 problems 테이블에서 실제 개수를 세서 내려줌
    #         → 프론트는 이 값을 분모로 써서 항상 정확하게 표시
    #
    # 주의: 이 쿼리는 user_id와 무관 (전체 문제 개수는 모든 유저 공통)
    #       그래서 submissions가 아니라 problems 테이블만 집계
    total_result = await db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE level = 'beginner') AS beginner_total,
                COUNT(*) FILTER (WHERE level = 'intermediate') AS intermediate_total,
                COUNT(*) FILTER (WHERE level = 'advanced') AS advanced_total,
                COUNT(*) AS all_total
            FROM problems
            WHERE owner_user_id IS NULL
        """)
    )
    # 이 쿼리는 항상 1행을 반환 (COUNT는 행이 없어도 0을 돌려줌)
    # 다만 fetchone()의 타입은 Row | None이라 타입 체커가 None 가능성을 경고함
    # → 명시적으로 None을 분리해서 타입 체커를 안심시키고, 만일을 대비
    totals_row = total_result.fetchone()
    totals = dict(totals_row._mapping) if totals_row else {
        "beginner_total": 0,
        "intermediate_total": 0,
        "advanced_total": 0,
        "all_total": 0,
    }

    # ── 4. 제출 기록이 없는 신규 유저 처리 ─────
    # stats가 None이면 = 아직 아무 문제도 제출 안 함
    # 이 경우에도 분모(total)는 내려줘야 프론트가 "0/5"처럼 표시 가능
    if not stats:
        return {
            "total_completed": 0,
            "beginner_completed": 0,
            "intermediate_completed": 0,
            "advanced_completed": 0,
            # 분모: 제출 기록과 무관하게 실제 문제 수 그대로 내려줌
            "beginner_total": totals["beginner_total"],
            "intermediate_total": totals["intermediate_total"],
            "advanced_total": totals["advanced_total"],
            "all_total": totals["all_total"],
            "avg_time_sec": 0,
            "total_hints": 0,
            "total_gate_attempts": 0,
            "recent_submissions": []
        }

    # SQLAlchemy Row → 일반 딕셔너리로 변환 (이후 키 접근 편하게)
    stats_dict = dict(stats._mapping)

    # ── 5. 최근 풀이 히스토리 조회 (최근 5개) ──
    # 집계 쿼리와 분리한 이유:
    #   COUNT/AVG 같은 집계 함수는 전체를 1행으로 합침
    #   개별 제출 기록은 여러 행이 필요 → 한 쿼리에 섞으면 복잡 + 비효율
    #   → 역할별로 쿼리 분리가 더 깔끔하고 성능도 좋음
    recent_result = await db.execute(
        text("""
            SELECT
                p.id AS problem_id,
                p.title,
                p.level,
                p.concept_tag,
                s.time_spent_sec,
                s.hint_count,
                s.gate_passed,
                s.submitted_at
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            WHERE s.user_id = :user_id
            -- submitted_at이 NULL이면 최종 제출 전 상태이므로 제외
            -- (게이트만 통과하고 제출 안 한 행도 있을 수 있음)
            AND s.submitted_at IS NOT NULL
            -- 최신순 정렬
            ORDER BY s.submitted_at DESC
            -- 최근 5개만
            LIMIT 5
        """),
        {"user_id": user_id}
    )

    recent_submissions = [
        dict(row._mapping) for row in recent_result.fetchall()
    ]

    # datetime → 문자열 변환
    # JSON 직렬화 시 datetime은 자동 변환이 안 되므로 isoformat()로 변환
    # 예: "2026-06-10T01:12:00"
    for sub in recent_submissions:
        if sub["submitted_at"]:
            sub["submitted_at"] = sub["submitted_at"].isoformat()

    # ── 6. 최종 응답 반환 ─────────────────────
    return {
        # 완료 수 (분자)
        "total_completed": stats_dict["total_completed"],
        "beginner_completed": stats_dict["beginner_completed"],
        "intermediate_completed": stats_dict["intermediate_completed"],
        "advanced_completed": stats_dict["advanced_completed"],

        # 전체 문제 수 (분모) — 이번에 새로 추가된 필드
        "beginner_total": totals["beginner_total"],
        "intermediate_total": totals["intermediate_total"],
        "advanced_total": totals["advanced_total"],
        "all_total": totals["all_total"],

        # int() 변환 이유:
        # AVG/SUM 결과는 Decimal 타입 → JSON 직렬화 시 에러 → int로 안전 변환
        "avg_time_sec": int(stats_dict["avg_time_sec"]),
        "total_hints": int(stats_dict["total_hints"]),
        "total_gate_attempts": int(stats_dict["total_gate_attempts"]),

        "recent_submissions": recent_submissions
    }