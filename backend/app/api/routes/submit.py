# # 최종 제출 및 유사 문제 생성 라우터
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.core.database import get_db

# JWT 토큰 검증 의존성
# /api/stats에서 이미 검증된 패턴을 그대로 가져옴
from app.core.auth import get_current_user

router = APIRouter(prefix="/api", tags=["submit"])

# Claude API 클라이언트 초기화 - 싱글톤 패턴
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 최종 제출 요청 데이터 형식
class SubmitRequest(BaseModel):

    # 문제 ID
    problem_id: str

    # 사용자 이메일
    # email:str

    # 게이트 통과 토큰 -> 없으면 제출 불가
    token: Optional[str] = None

    # 추가
    code: str

    # 문제 푸는데 걸린 시간 (초)
    time_spent_sec: int

    # 게이트 건너뛰기 여부 (선택)
    skip_gate: bool = False


# 유사 문제 생성 요청 데이터 형식
class SimilarProblemRequest(BaseModel):

    # 원본 문제 ID
    problem_id: str

    # 사용자 확정 수준
    level: str

    # 유사 문제를 받을 사용자 이메일
    # 이 문제는 이 사용자 전용으로 생성되어 DB에 저장됨 (개인 맞춤)
    # email: str


# POST /api/submit
# 최종 제출 - 토큰 검증 후 제출 처리
@router.post("/submit")
async def submit_solution(
    request: SubmitRequest,
    # JWT 토큰을 검증해서 현재 로그인한 유저 정보를 가져옴
    # Depends()로 주입하면, 토큰이 없거나 유효하지 않을 때
    # get_current_user 내부에서 자동으로 401 에러를 발생
    # (이 함수 안에서 따로 인증 체크 관련 코드 필요 없음)
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    
    # 디버그 로그 추가
    # print("=== 제출 디버깅 ===")
    # print(f"token: {request.token}")
    # print(f"problem_id: {request.problem_id}")
    # print(f"email: {request.email}")

    # current_user는 Supabase가 서버에서 직접 검증한 값이라 위조 불가능
    email = current_user["email"]

    # 유저 ID 조회 (skip_gate 여부 관계 없이 항상 필요)
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    
    user_id = user._mapping["id"]

    # skip_gate가 False일 때만 토큰 검증
    if not request.skip_gate:
        # 1. 토큰 유효성 검증
        # 토큰이 존재하고, 사용되지 않았고, 만료되지 않았는지 확인
        token_result = await db.execute(
            text("""
                SELECT gt.id, gt.used, gt.expires_at, u.id as user_id
                FROM gate_tokens gt
                JOIN users u ON gt.user_id = u.id
                WHERE gt.token = :token
                AND gt.problem_id = :problem_id
                AND u.email = :email
            """),
            {
                "token": request.token,
                "problem_id": request.problem_id,
                "email": email,
            }
        )
        token_data = token_result.fetchone()

        # 디버깅 로그
        # print(f"token_data: {token_data}")

        # 토큰이 없으면 제출 불가
        if not token_data:
            raise HTTPException(
                status_code=403,
                detail="유효하지 않은 토큰입니다. 게이드를 먼저 통과해주세요."
            )
        
        token_dict = dict(token_data._mapping)

        # 이미 사용된 토큰이면 제출 불가
        if token_dict["used"]:
            raise HTTPException(
                status_code=403,
                detail="이미 사용된 토큰입니다."
            )
        
        # 만료된 토크이면 제출 불가
        if token_dict["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=403,
                detail="만료된 토큰입니다. 게이트를 다시 통과해주세요.",
            )

        # user_id = token_dict["user_id"]


        # 2. 토큰 사용 처리 - 재사용 방지
        await db.execute(
            text("UPDATE gate_tokens SET used = TRUE WHERE token = :token"),
            {"token": request.token}
        )


    # 3. submissions 테이블 최종 업데이트 (없으면 INSERT, 있으면 UPDATE)
    # skip_gate면 gate_passed = FALSE, 토큰 통과면 gate_passed = TRUE
    await db.execute(
        text("""
            INSERT INTO submissions (user_id, problem_id, code, hint_count, gate_passed, gate_attempts, time_spent_sec)
            VALUES (:user_id, :problem_id, :code, 0, :gate_passed, 0, :time_spent_sec)
            ON CONFLICT (user_id, problem_id)
            DO UPDATE SET
                code = :code,
                gate_passed = :gate_passed,
                time_spent_sec = :time_spent_sec,
                submitted_at = NOW()
        """),
        {
            "code": request.code,
            "time_spent_sec": request.time_spent_sec,
            "user_id": user_id,
            "problem_id": request.problem_id,
            "gate_passed": not request.skip_gate,
        }
    )

    await db.commit()


    # 4. 제출 통계 조회 - 피드백용
    stats_result = await db.execute(
        text("""
            SELECT hint_count, gate_attempts, time_spent_sec
            FROM submissions
            WHERE user_id = :user_id
            AND problem_id = :problem_id
        """),
        {
            "user_id": user_id,
            "problem_id": request.problem_id,
        }
    )

    stats_row = stats_result.fetchone()

    if not stats_row:
        stats = {"hint_count": 0, "gate_attempts": 0, "time_spent_sec": 0}
    else:
        stats = dict(stats_row._mapping)

    return {
        "success": True,
        "message": "제출이 완료되었습니다. 🎉",
        "stats": {
            "hint_count": stats["hint_count"],
            "gate_attempts": stats["gate_attempts"],
            "time_spent_sec": stats["time_spent_sec"],
        },

        # 제출한 코드를 feedback 페이지에서 보요주기 위해 포함
        # miny 피드백: "한번 제출하고 나가면 풀이를 다시 볼 방법이 없다"
        "submitted_code": request.code
    }


# POST /api/similar-problem
# 유사 문제 생성 - Claude API로 동적 생성 + 개인 전용으로 DB 저장
@router.post("/similar-problem")
async def generate_similar_problem(
    request: SimilarProblemRequest,
    # JWT 인증 - 이 문제를 누구 전용으로 저장할지 결정
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    
    email = current_user["email"]

    # 유저 ID 조회 - 이 문제를 받을 사용자 (owner_user_id로 저장됨)
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = user._mapping["id"]


    # DB에서 원본 문제 정보 조회
    result = await db.execute(
        text("""
            SELECT title, description, concept_tag, level
            FROM problems
            WHERE id = :id
        """),
        {
            "id": request.problem_id
        }
    )

    problem = result.fetchone()

    if not problem:
        raise HTTPException(status_code=404, detail="문제를 찾을 수 없습니다.")
    
    problem_data = dict(problem._mapping)


    # Claude API로 유사 문제 생성
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system="""You are an expert Python coding educator.
Generate a similar coding problem that practices the same concept
but with a different scenario.
Always respond with valid JSON only.
Never include any text outside the JSON structure.
All content must be written in Korean.""",
        messages=[
                    {
                        "role": "user",
                        "content": f"""Generate a similar problem based on the following.

        [Original Problem]
        Title: {problem_data['title']}
        Description: {problem_data['description']}
        Concept: {problem_data['concept_tag']}
        Level: {problem_data['level']}

        [Requirements]
        1. Same concept but completely different scenario
        2. Similar difficulty level
        3. Include exactly 3 test cases
        4. Include starter code template

        [CRITICAL - test_cases input format]
        The "input" field MUST be a JSON array string representing positional
        arguments to the function, NOT a comma-separated description.
        Correct: "input": "[1000, 2000]"
        Wrong:   "input": "1000, 2000"
        The "output" field MUST also be a valid JSON value as a string.
        Correct: "output": "3000"
        Wrong:   "output": "result is 3000"

        [Output JSON Schema]
        {{
            "title": "problem title in Korean",
            "description": "problem description in Korean, include 2 examples like:\\n예시:\\n- solution(...) → ...",
            "concept_tag": "{problem_data['concept_tag']}",
            "level": "{request.level}",
            "test_cases": [
                {{"input": "[value1, value2]", "output": "expected_value"}}
            ],
            "starter_code": "def solution(param1, param2):\\n    # 여기에 코드를 작성하세요\\n    return"
        }}"""
                    }
                ]
    )

    # text 타입 블록만 필터링
    response_text = next(
        (block.text for block in message.content
            if isinstance(block, anthropic.types.TextBlock)),
        ""
    )

    # 코드 블록 마커 제거
    response_text = response_text.strip()
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.startswith("```"):
        response_text = response_text[3:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    response_text = response_text.strip()


    # JSON 파싱
    try:
        similar_problem = json.loads(response_text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="유사 문제 생성 중 오류가 발생했습니다."
        )


    # ============================================================
    # 신규: 생성된 문제를 DB에 즉시 저장 (개인 전용)
    # ============================================================
    # AI가 만든 starter_code는 순수 문자열이므로,
    # 기존 problems.starter_code 컬럼 형식(JSONB, {"python": "..."})에 맞춰 변환
    # (오늘 발견한 starter_codes 포맷 버그와 같은 실수를 반복하지 않기 위한 처리)
    starter_codes_dict = {"python": similar_problem.get("starter_code", "")}

    # title 중복 충돌 방지
    # problems.title에 UNIQUE 제약이 걸려있을 가능성이 있으므로 (sync_problems.py의
    # ON CONFLICT(title) 로직 참고), AI가 생성한 제목 뒤에 짧은 식별자를 붙여
    # 같은 제목이 여러 번 생성돼도 충돌하지 않게 함
    import uuid
    unique_title = f"{similar_problem['title']} #{str(uuid.uuid4())[:8]}"

    insert_result = await db.execute(
        text("""
            INSERT INTO problems (
                title, description, level, concept_tag,
                test_cases, starter_code, order_idx, language,
                problem_type, track, owner_user_id
            )
            VALUES (
                :title, :description, :level, :concept_tag,
                CAST(:test_cases AS JSONB), CAST(:starter_code AS JSONB),
                :order_idx, 'python',
                'coding', 'ai_generated', :owner_user_id
            )
            RETURNING id
        """),
        {
            "title": unique_title,
            "description": similar_problem["description"],
            "level": request.level,
            "concept_tag": similar_problem.get("concept_tag", problem_data["concept_tag"]),
            "test_cases": json.dumps(similar_problem.get("test_cases", []), ensure_ascii=False),
            "starter_code": json.dumps(starter_codes_dict, ensure_ascii=False),
            "order_idx": 999,
            "owner_user_id": user_id,
        }
    )

    new_problem_row = insert_result.fetchone()

    # fetchone()의 반환 타입은 Row | None이라, 타입 체커가 None 가능성을 경고함
    # RETURNING id가 있는 INSERT는 보통 항상 1행을 반환하지만,
    # 방어적으로 None 체크를 추가해서 타입 경고도 없애고 런타임 안전성도 높임
    if new_problem_row is None:
        raise HTTPException(
            status_code=500,
            detail="문제 저장 중 오류가 발생했습니다."
        )

    await db.commit()

    new_problem_id = str(new_problem_row._mapping["id"])

    # 프론트에는 원래 제목(식별자 없이)을 보여주고,
    # id만 추가로 내려줘서 "이 문제 도전하기" 버튼이 실제 라우팅을 할 수 있게 함
    similar_problem["id"] = new_problem_id
    similar_problem["title"] = similar_problem["title"]  # 원본 제목 유지 (DB엔 unique_title 저장됨)

    return similar_problem