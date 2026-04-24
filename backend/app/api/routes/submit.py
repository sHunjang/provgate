# # 최종 제출 및 유사 문제 생성 라우터
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/api", tags=["submit"])

# Claude API 클라이언트 초기화 - 싱글톤 패턴
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 최종 제출 요청 데이터 형식
class SubmitRequest(BaseModel):

    # 문제 ID
    problem_id: str

    # 사용자 이메일
    email:str

    # 게이트 통과 토큰 -> 없으면 제출 불가
    token: str

    # 추가
    code: str

    # 문제 푸는데 걸린 시간 (초)
    time_spent_sec: int


# 유사 문제 생성 요청 데이터 형식
class SimilarProblemRequest(BaseModel):

    # 원본 문제 ID
    problem_id: str

    # 사용자 확정 수준
    level: str


# POST /api/submit
# 최종 제출 - 토큰 검증 후 제출 처리
@router.post("/submit")
async def submit_solution(
    request: SubmitRequest,
    db: AsyncSession = Depends(get_db)
):
    
    # 디버그 로그 추가
    print("=== 제출 디버깅 ===")
    print(f"token: {request.token}")
    print(f"problem_id: {request.problem_id}")
    print(f"email: {request.email}")
    
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
            "email": request.email,
        }
    )
    token_data = token_result.fetchone()

    # 디버깅 로그
    print(f"token_data: {token_data}")

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

    user_id = token_dict["user_id"]


    # 2. 토큰 사용 처리 - 재사용 방지
    await db.execute(
        text("UPDATE gate_tokens SET used = TRUE WHERE token = :token"),
        {"token": request.token}
    )


    # 3. submissions 테이블 최종 업데이트 (없으면 INSERT, 있으면 UPDATE)
    await db.execute(
        text("""
            INSERT INTO submissions (user_id, problem_id, code, hint_count, gate_passed, gate_attempts, time_spent_sec)
            VALUES (:user_id, :problem_id, :code, 0, TRUE, 0, :time_spent_sec)
            ON CONFLICT (user_id, problem_id)
            DO UPDATE SET
                code = :code,
                gate_passed = TRUE,
                time_spent_sec = :time_spent_sec,
                submitted_at = NOW()
        """),
        {
            "code": request.code,
            "time_spent_sec": request.time_spent_sec,
            "user_id": user_id,
            "problem_id": request.problem_id,
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
        }
    }


# POST /api/similar-problem
# 유사 문제 생성 - Claude API로 동적 생성
@router.post("/similar-problem")
async def generate_similar_problem(
    request: SimilarProblemRequest,
    db: AsyncSession = Depends(get_db)
):
    
    # DB에서 원본 무넺 정보 조회
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


    # Claude API로 유사 문제 생성ㅇ
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
3. Include 3 test cases
4. Include starter code template
5. Include 3 progressive hints

[Output JSON Schema]
{{
    "title": "problem title in Korean",
    "description": "problem description in Korean",
    "concept_tag": "{problem_data['concept_tag']}",
    "level": "{request.level}",
    "test_cases": [
        {{"input": "input value", "output": "expected output"}}
    ],
    "starter_code": "# starter code template in Korean comments",
    "hint_1": "first hint in Korean",
    "hint_2": "second hint in Korean",
    "hint_3": "third hint in Korean"
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

    return similar_problem