# 문제 목록 조회 라우터
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db

router = APIRouter(prefix="/api/problems", tags=["problems"])


# GET /api/problems/{level}
# 수준별 문제 목록 조회 + 완료 여부 포함
@router.get("/{level}")
async def get_problems(
    level: str,
    email: str = "",
    db: AsyncSession = Depends(get_db)
    ):

    valid_levels = {"beginner", "intermediate", "advanced"}
    if level not in valid_levels:
        raise HTTPException(
            status_code=400,
            detail="올바르지 않은 수준입니다. beginner/intermediate/advanced 중 하나를 선택하세요."
        )

    # ============================================================
    # 신규: 로그인 유저의 user_id를 먼저 조회
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
    # 수정: WHERE 조건에 "내가 owner인 문제"도 포함
    # ============================================================
    # 기존: owner_user_id IS NULL  → 공용 문제만
    # 변경: 공용 문제(NULL) OR 내가 소유한 문제(owner_user_id = 내 id)
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

    # (이하 completed_ids / status 조회 로직은 기존과 동일하게 유지)
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
    email: str = "",    # 이전 제출 코드 조회용
    db: AsyncSession = Depends(get_db)
    ):

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

        # 이전 제출 코드가 있으면 포함, 없으면 None
        problem_data["previous_code"] = submission._mapping["code"] if submission else None
    
    else:
        problem_data["previous_code"] = None
    
    return problem_data


# GET /api/problems/completed/{user_email}
# 유저가 완료한 문제 목록 조회
@router.get("/completed/{user_email}")
async def get_completed_problems(user_email: str, db: AsyncSession = Depends(get_db)):

    # 해당 유저의 제출 완료된 문제 ID 목록 조회
    # gate_passed=True인 경우만 완료로 간주
    result = await db.execute(
        text("""
            SELECT DISTINCT s.problem_id
            FROM submissions s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = :email
            AND s.gate_passed = TRUE
        """),
        {"email": user_email}
    )

    # 완료된 문제 ID 리스트로 변환
    completed_ids = [str(row.problem_id) for row in result.fetchall()]

    return {
        "email": user_email,
        "completed_problem_ids": completed_ids
    }
