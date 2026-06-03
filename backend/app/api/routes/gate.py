# 이해 확인 게이트 라우터
# 핵심 기능: 같은 개념의 다른 유형 문제로 실제 이해도 검증

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json
import secrets  # 암호학적으로 안전한 토큰 생성
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import check_rate_limit, record_api_usage


router = APIRouter(prefix="/api/gate", tags=["gate"])


# Claude API 클라이언트 초기화 -> 싱글톤 패턴
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 게이트 문제 생성 요청 데이터 형식
class GateGenerateRequest(BaseModel):

    # 원본 문제 ID - 같은 개념의 다른 문제 생성에 사용
    problem_id: str

    # 사용자 이메일
    email: str

    # 언어 추가 (기본 값 python)
    language: str = "python"


# 게이트 답안 검증 요청 데이터 형식
class GateVerifyRequest(BaseModel):

    # 원본 문제 ID
    problem_id: str

    # 사용자 이메일
    email: str

    # 게이트 문제 (생성된 문제 텍스트)
    gate_question: str

    # 게이트 문제 보기 리스트
    gate_options: list[str]

    # 사용자가 선택한 답안 인덱스 (0-3)
    user_answer: int

    # 정답 인덱스
    correct_answer: int


# POST /api/gate/generate
# 이해 확인 게이트 문제 생성
@router.post("/generate")
async def generate_gate(
    request: GateGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    
    # DB에서 유저 ID 조회 (Rate Limit 체크용)
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": request.email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = str(user._mapping["id"])

    # Rate Limit 체크 - 하루 10회 제한
    await check_rate_limit(user_id, "gate", db)

    # DB에서 원본 문제 정보 조회
    result = await db.execute(
        text("""
            SELECT title, description, concept_tag, level
            FROM problems
            WHERE id = :id
        """),
        {"id": request.problem_id}
    )

    problem = result.fetchone()

    if not problem:
        raise HTTPException(status_code=404, detail="문제를 찾을 수 없습니다.")

    problem_data = dict(problem._mapping)

    # 언어별 교육자 역할 설정
    language_educator = {
        "python": "Python coding educator",
        "javascript": "JavaScript coding educator",
        "java": "Java coding educator",
        "cpp": "C++ coding educator",
        "csharp": "C# coding educator",
    }
    educator_role = language_educator.get(request.language, "coding educator")

    # Claude API로 게이트 문제 생성
    # 같은 개념이지만 다른 유형의 문제 생성
    message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1000,
    system=f"""You are an expert {educator_role}.
Generate a verification question that tests the same concept as the original problem
but with a different scenario or approach.
The question must be multiple choice with 4 options.
Always respond with valid JSON only.
Never include any text outside the JSON structure.
Questions and options must be written in Korean.
Use {request.language} code examples in questions if needed.""",
        messages=[
            {
                "role": "user",
                "content": f"""Generate a gate verification question based on the following problem.

[Original Problem]
Title: {problem_data['title']}
Description: {problem_data['description']}
Concept: {problem_data['concept_tag']}
Level: {problem_data['level']}

[Requirements]
1. Test the SAME concept but with a DIFFERENT scenario
2. Must be multiple choice with 4 options
3. Include one correct answer and three plausible wrong answers based on misconceptions
4. Must require actual understanding, not just memorization
5. Include a brief explanation for the correct answer

[Output JSON Schema]
{{
    "question": "question content in Korean",
    "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
    "answer": 0,
    "explanation": "explanation in Korean",
    "concept": "{problem_data['concept_tag']}"
}}"""
            }
        ]
    )

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
        gate_data = json.loads(response_text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="게이트 문제 생성 중 오류가 발생했습니다."
        )

    # Rate Limit 사용 기록 저장
    await record_api_usage(user_id, "gate", db)

    # 게이트 시도 횟수 업데이트
    await db.execute(
        text("""
            UPDATE submissions
            SET gate_attempts = gate_attempts + 1
            FROM users u
            WHERE submissions.user_id = u.id
            AND u.email = :email
            AND submissions.problem_id = :problem_id
        """),
        {
            "email": request.email,
            "problem_id": request.problem_id
        }
    )
    
    await db.commit()

    return {
        "question": gate_data["question"],
        "options": gate_data["options"],
        "answer": gate_data["answer"],
        "explanation": gate_data["explanation"],
        "concept": gate_data["concept"],
    }


# POST /api/gate/verify
# 게이트 답안 검증 + 토큰 발급
@router.post("/verify")
async def verify_gate(
    request: GateVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    
    # 정답 여부 확인
    is_correct = request.user_answer == request.correct_answer
    
    if not is_correct:
        return {
            "passed": False,
            "message": "오답입니다. 다시 시도하세요.",
            "token": None,
        }
    

    # 정답이면 토큰 발급
    # secrets.token_urlsafe: 암호학적으로 안전한 랜덤 토큰 생성
    # URL에 안전한 문자만 사용 (base64url 인코딩)
    token = secrets.token_urlsafe(32)

    # 토큰 만료 시간 설정 (24시간)
    expires_at = datetime.utcnow() + timedelta(hours=24)

    # 사용자 ID 조회
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": request.email}
    )
    user = user_result.fetchone()


    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    
    user_id = user._mapping["id"]


    # gate_tokens 테이블에 토큰 저장
    await db.execute(
        text("""
            INSERT INTO gate_tokens (user_id, problem_id, token, expires_at)
            VALUES (:user_id, :problem_id, :token, :expires_at)
        """),
        {
            "user_id": user_id,
            "problem_id": request.problem_id,
            "token": token,
            "expires_at": expires_at
        }
    )

    
    # submissions 테이블 gate_passed 업데이트
    await db.execute(
        text("""
            UPDATE submissions
            SET gate_passed = TRUE
            WHERE user_id = :user_id
            AND problem_id = :problem_id
        """),
        {
            "user_id": user_id,
            "problem_id": request.problem_id,
        }
    )

    await db.commit()

    return {
        "passed": True,
        "message": "정답입니다. 게이트를 통과하셨습니다. 🎉",
        "token": token,
    }