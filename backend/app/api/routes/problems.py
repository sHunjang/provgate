# 문제 목록 조회 라우터
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from app.core.database import get_db

# 신규: JWT 인증
# get_current_user_optional: 로그인 선택 (목록/상세 조회 — 게스트도 봐야 함)
# get_current_user: 로그인 필수 (완료 목록 — 남의 데이터를 볼 수 없어야 함)
from app.core.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/problems", tags=["problems"])


# GET /api/problems/{level}
# 수준별 문제 목록 조회 + 완료 여부 포함
@router.get("/{level}")
async def get_problems(
    level: str,
    # 삭제: email: str = ""
    # ============================================================
    # 왜 삭제했는가
    # ============================================================
    # 이 엔드포인트는 email을 그대로 신뢰해서 "이 사람이 이 문제를
    # 완료했는지" 상태를 계산했음. 위조하면 남의 완료 상태를 내 화면에
    # 표시시키거나(프라이버시), 반대로 남의 이메일로 조회해서 그 사람의
    # 진행 상태를 엿볼 수 있었음. 이제는 토큰이 있으면 검증된 이메일만
    # 신뢰하고, 토큰이 없으면 게스트(비로그인 상태, status는 전부
    # not_started)로 처리함 — 게스트도 문제 목록 자체는 볼 수 있어야
    # 하는 요구사항(공개 열람) 때문에 로그인을 강제하지는 않음
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
    ):

    valid_levels = {"beginner", "intermediate", "advanced"}
    if level not in valid_levels:
        raise HTTPException(
            status_code=400,
            detail="올바르지 않은 수준입니다. beginner/intermediate/advanced 중 하나를 선택하세요."
        )

    # 수정: email 파라미터 → current_user에서 추출 (검증된 값만 신뢰)
    email = current_user["email"] if current_user else ""

    # ============================================================
    # 로그인 유저의 user_id를 먼저 조회
    # ============================================================
    # WHERE절에서 owner_user_id와 비교하려면 이메일이 아니라 UUID가 필요함.
    # 비로그인(email="")이면 current_user_id는 None으로 두고,
    # 아래 SQL에서 "owner_user_id = NULL"은 항상 거짓이 되므로
    # 자연스럽게 개인 문제는 하나도 안 보임 (별도 분기 없이 안전하게 처리됨)
    current_user_id = None
    if email:
        user_result = await db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email}
        )
        user_row = user_result.fetchone()
        if user_row:
            current_user_id = user_row._mapping["id"]

    # ============================================================
    # WHERE 조건에 "내가 owner인 문제"도 포함
    # ============================================================
    # 공용 문제(NULL) OR 내가 소유한 문제(owner_user_id = 내 id)
    # 이렇게 하면 foundation/project/prompt는 그대로 전부 보이고,
    # ai_generated는 "이 문제를 생성 요청한 사용자"에게만 보임
    result = await db.execute(
        text("""
            SELECT id, title, description, level, concept_tag,
                    order_idx, problem_type, track
            FROM problems
            WHERE level = :level
            AND (owner_user_id IS NULL OR owner_user_id = :current_user_id)
            ORDER BY order_idx ASC
        """),
        {"level": level, "current_user_id": current_user_id}
    )

    problems = [dict(row._mapping) for row in result.fetchall()]

    completed_ids = []

    if email:
        status_result = await db.execute(
            text("""
                SELECT s.problem_id,
                    CASE
                        WHEN s.gate_passed = TRUE THEN 'completed'
                        ELSE 'in_progress'
                    END as status
                FROM submissions s
                JOIN users u ON s.user_id = u.id
                WHERE u.email = :email
            """),
            {"email": email}
        )
        problem_status = {
            str(row.problem_id): row.status
            for row in status_result.fetchall()
        }

    for problem in problems:
        pid = str(problem["id"])
        if email:
            status = problem_status.get(pid, "not_started")
        else:
            status = "not_started"
        problem["status"] = status
        problem["is_completed"] = status == "completed"

    return {
        "level": level,
        "count": len(problems),
        "problems": problems
    }


# GET /api/problems/detail/{id}
# 문제 상세 조회
@router.get("/detail/{id}")
async def get_problem(
    id: str,
    # 수정: email: str = "" → 선택적 인증
    # 이전 제출 코드(previous_code)는 "본인 것만" 자동 채워져야 하는데,
    # email이 위조되면 남의 이전 풀이 코드가 내 에디터에 그대로
    # 노출되는 프라이버시 문제가 있었음
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
    ):

    email = current_user["email"] if current_user else ""

    result = await db.execute(
        text("""
            SELECT id, title, description, level, concept_tag,
                    test_cases, starter_code, language,
                    problem_type, track, ai_code, questions, answer_type,
                requirements, thinking_hints
            FROM problems
            WHERE id = :id
        """),
        {"id": id}
    )

    problem = result.fetchone()

    if not problem:
        raise HTTPException(
            status_code=404,
            detail="문제를 찾을 수 없습니다."
        )

    problem_data = dict(problem._mapping)

    # 이전 제출 코드 조회 (email이 있을 때만)
    # 히스토리에서 문제로 돌아올 때 에디터에 이전 코드를 자동으로 채워주기 위함
    if email:
        submission_result = await db.execute(
            text("""
                SELECT s.code
                FROM submissions s
                JOIN users u ON s.user_id = u.id
                WHERE u.email = :email
                AND s.problem_id = :problem_id
                AND s.submitted_at IS NOT NULL
                ORDER BY s.submitted_at DESC
                LIMIT 1
            """),
            {"email": email, "problem_id": id}
        )

        submission = submission_result.fetchone()

        problem_data["previous_code"] = submission._mapping["code"] if submission else None

    else:
        problem_data["previous_code"] = None

    return problem_data


# GET /api/problems/completed
# 로그인한 유저 본인이 완료한 문제 목록 조회
# ============================================================
# 수정: 경로 자체를 변경 — /completed/{user_email} → /completed
# ============================================================
# 기존엔 이메일을 URL 경로에 그대로 노출해서, 로그인 여부와 무관하게
# 누구나 "/api/problems/completed/다른사람@gmail.com" 같은 요청으로
# 타인의 완료 기록을 조회할 수 있었음 (인증 자체가 없었던 엔드포인트).
# 이제는 로그인을 필수로 하고, "누구의 기록을 볼지"를 URL이 아니라
# 토큰에서만 결정함 — 그래서 자기 자신 것만 조회 가능해짐.
# (프론트에서 이 엔드포인트를 호출하는 곳이 있다면, 경로에서
#  이메일을 빼고 Authorization 헤더만 보내도록 같이 수정 필요)
@router.get("/completed")
async def get_completed_problems(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    email = current_user["email"]

    result = await db.execute(
        text("""
            SELECT DISTINCT s.problem_id
            FROM submissions s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = :email
            AND s.gate_passed = TRUE
        """),
        {"email": email}
    )

    completed_ids = [str(row.problem_id) for row in result.fetchall()]

    return {
        "email": email,
        "completed_problem_ids": completed_ids
    }