# 이해 확인 게이트 라우터
# 핵심 기능: 같은 개념의 다른 유형 문제로 실제 이해도 검증

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json
import random
import secrets
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import check_rate_limit, record_api_usage, get_usage_status
from app.core.auth import get_current_user
from app.core.code_verifier import verify_code_answer

router = APIRouter(prefix="/api/gate", tags=["gate"])

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


class GateGenerateRequest(BaseModel):
    problem_id: str
    language: str = "python"
    is_first: bool = False


class GateVerifyRequest(BaseModel):
    problem_id: str
    user_answer: int


# ============================================================
# 신규: 시나리오 맥락 풀 (scenario context pool)
# ============================================================
# 온보딩 퀴즈에서 겪었던 것과 같은 문제: "다른 시나리오로 만들어라"는
# 지시만 주면 AI가 확률 높은(=흔한) 소재로 계속 수렴함
# (예: 항상 "학생 성적", "쇼핑몰 장바구니"만 반복 등장).
#
# 게이트는 온보딩과 달리 concept_tag가 원본 문제에 이미 고정돼 있어서
# "어떤 개념을 다룰지"가 아니라 "어떤 배경 이야기로 표현할지"를
# 강제해야 함. 그래서 random.choice로 배경 소재 하나를 미리 정해서
# 프롬프트에 못박아버림 — 다양성을 AI 판단이 아니라 코드가 보장
scenario_contexts = [
    "온라인 쇼핑몰 재고 관리", "학교 성적 관리 시스템", "날씨 데이터 분석",
    "SNS 팔로워 수 집계", "게임 점수판", "은행 계좌 거래 내역",
    "도서관 대출 기록", "택배 배송 추적", "카페 주문 관리",
    "헬스장 회원 출석 체크", "영화 예매 시스템", "레시피 재료 계산",
]


def build_gate_prompt(problem_data: dict, language: str, scenario_context: str) -> str:
    """problem_type에 따라 Claude에게 전달할 사용자 프롬프트를 생성한다."""
    problem_type = problem_data.get("problem_type", "coding")
    concept = problem_data["concept_tag"]
    level = problem_data["level"]
    title = problem_data["title"]
    description = problem_data["description"]

    output_schema = """
[Output JSON Schema]
{
    "question": "question text (in Korean)",
    "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
    "answer": 0,
    "explanation": "explanation (in Korean)",
    "concept": "concept tag"
}"""

    # 신규: 모든 유형 공통으로 "이 배경 소재를 반드시 써라"는 지시를 추가
    context_instruction = f"""
[Scenario Context - MUST USE]
Base the new scenario on this real-world context: "{scenario_context}"
Do not use generic or commonly seen examples (e.g. simple math, plain
variable manipulation without a real-world story) — ground the question
in the given context above."""

    if problem_type == "ai_reading":
        ai_code = problem_data.get("ai_code", "")
        return f"""Generate a gate verification question based on the original problem below.
[Original Problem]
Title: {title}
Concept: {concept}
Level: {level}
AI Code:
{ai_code}
{context_instruction}

[Requirements]
1. Write completely NEW code using the SAME concept ({concept})
2. Code must be in {language}, 5-10 lines long
3. Make a multiple-choice question: "What is the output of this code?"
4. Options must be actual output values
5. Wrong options should come from common misconceptions
6. Include the code inside the "question" field as a markdown code block
7. IMPORTANT: question, options, and explanation MUST be written in Korean
{output_schema}"""

    elif problem_type == "ai_debugging":
        ai_code = problem_data.get("ai_code", "")
        return f"""Generate a gate verification question based on the original problem below.
[Original Problem]
Title: {title}
Concept: {concept}
Level: {level}
Original Buggy Code:
{ai_code}
{context_instruction}

[Requirements]
1. Write NEW buggy code with the SAME concept ({concept}) but a DIFFERENT scenario
2. Code must be in {language}
3. Make a multiple-choice question: "What error occurs?" or "What is the cause of the bug?"
4. Provide 4 error-type options (error name + one-line description)
5. Include the code inside the "question" field as a markdown code block
6. IMPORTANT: question, options, and explanation MUST be written in Korean
{output_schema}"""

    elif problem_type == "ai_question":
        questions = problem_data.get("questions") or []
        original_q = ""
        if questions:
            original_q = f"\nOriginal Question: {questions[0].get('question', '')}"
        return f"""Generate a gate verification question based on the original problem below.
[Original Problem]
Title: {title}
Concept: {concept}
Level: {level}{original_q}
{context_instruction}

[Requirements]
1. Create a scenario where the user asks an AI about the concept "{concept}"
2. Use a DIFFERENT task scenario from the original
3. Make a multiple-choice question: "Which is the best prompt?"
4. The 4 options request the same task but with different prompt quality (too vague / okay / good / very specific and good)
5. Explain in "explanation" why the correct prompt is the best
6. IMPORTANT: question, options, and explanation MUST be written in Korean
{output_schema}"""

    else:
        return f"""Generate a gate verification question based on the following problem.
[Original Problem]
Title: {title}
Description: {description}
Concept: {concept}
Level: {level}
{context_instruction}

[Requirements]
1. Test the SAME concept but with a DIFFERENT scenario
2. Must be multiple choice with 4 options
3. Include one correct answer and three plausible wrong answers based on misconceptions
4. Must require actual understanding, not just memorization
5. Include a brief explanation for the correct answer
6. IMPORTANT: question, options, and explanation MUST be written in Korean
{output_schema}"""


def build_system_prompt(problem_type: str, language: str) -> str:
    """Claude의 역할(페르소나)을 설정하는 시스템 프롬프트를 반환한다."""
    language_map = {
        "python": "Python", "javascript": "JavaScript", "java": "Java", "c": "C",
        "cpp": "C++", "csharp": "C#",
    }
    lang_name = language_map.get(language, language)

    # ============================================================
    # 수정: 역할 설명에 "10년차 시니어" 페르소나 추가
    # ============================================================
    # 페르소나는 "문제 생성 품질"에만 관여함 (정답 판정에는 관여 안 함 —
    # 정답 검증은 여전히 code_verifier.py의 기계적 실행 비교가 담당).
    # 시니어 개발자 관점을 명시하면, 실무에서 실제로 마주치는 것 같은
    # 현실적인 시나리오/함정을 더 잘 만들어내는 경향이 있음
    role_map = {
        "ai_reading": f"a senior {lang_name} engineer with 10+ years of experience, mentoring junior developers by creating realistic code-reading comprehension questions",
        "ai_debugging": f"a senior {lang_name} engineer with 10+ years of experience, creating debugging questions based on bugs commonly seen in real production code",
        "ai_question": f"a senior engineer with 10+ years of experience who teaches junior developers how to write effective prompts when working with AI coding tools",
        "coding": f"a senior {lang_name} engineer with 10+ years of experience, writing realistic coding problems grounded in real-world scenarios",
    }
    role = role_map.get(problem_type, f"a senior {lang_name} engineer with 10+ years of experience")

    return f"""You are {role}.
Generate a verification question that tests the same concept as the original problem
but with a different scenario or approach.
Always respond with valid JSON only. Never include any text outside the JSON structure.
The question, options, and explanation MUST be written in Korean."""


def _call_claude_for_gate(system_prompt: str, user_prompt: str) -> dict:
    """
    Claude를 호출하고 JSON으로 파싱해서 반환하는 헬퍼 함수.
    원본 생성과 재시도 생성 둘 다 이 함수를 재사용함
    (같은 호출+파싱 로직을 두 번 복붙하지 않기 위해 분리)
    """
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )
    response_text = next(
        (block.text for block in message.content
         if isinstance(block, anthropic.types.TextBlock)),
        ""
    )
    response_text = response_text.strip()
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.startswith("```"):
        response_text = response_text[3:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    response_text = response_text.strip()

    return json.loads(response_text)


@router.post("/generate")
async def generate_gate(
    request: GateGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    email = current_user["email"]

    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = str(user._mapping["id"])

    await check_rate_limit(user_id, "gate", db)

    result = await db.execute(
        text("""
            SELECT title, description, concept_tag, level,
                   problem_type, ai_code, questions
            FROM problems
            WHERE id = :id
        """),
        {"id": request.problem_id}
    )

    problem = result.fetchone()

    if not problem:
        raise HTTPException(status_code=404, detail="문제를 찾을 수 없습니다.")

    problem_data = dict(problem._mapping)

    # 신규: 이번 요청에서 쓸 배경 소재를 미리 확정
    scenario_context = random.choice(scenario_contexts)

    system_prompt = build_system_prompt(
        problem_data.get("problem_type", "coding"),
        request.language
    )
    user_prompt = build_gate_prompt(problem_data, request.language, scenario_context)

    try:
        gate_data = _call_claude_for_gate(system_prompt, user_prompt)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="게이트 문제 생성 중 오류가 발생했습니다."
        )

    # 코드 실행 결과 검증 (기존 로직 유지) — 실패 시 1회 재생성
    verify_result = verify_code_answer(
        gate_data["question"], gate_data["options"], gate_data["answer"]
    )

    if verify_result is False:
        print(f"[GATE] 정답 불일치 감지 — 재생성 시도 (problem_id={request.problem_id})")
        try:
            # 재시도에도 같은 배경 소재를 유지 (다시 무작위로 뽑지 않음 —
            # 소재 문제가 아니라 정답 계산 실수였을 가능성이 높으므로)
            retry_data = _call_claude_for_gate(system_prompt, user_prompt)
            retry_verify = verify_code_answer(
                retry_data["question"], retry_data["options"], retry_data["answer"]
            )
            if retry_verify is not False:
                gate_data = retry_data
            else:
                print(f"[GATE] 재시도도 실패 — 재시도 결과로 진행 (problem_id={request.problem_id})")
                gate_data = retry_data
        except json.JSONDecodeError:
            print(f"[GATE] 재시도 응답 파싱 실패 — 원본 유지 (problem_id={request.problem_id})")

    await record_api_usage(user_id, "gate", db)

    if request.is_first:
        await db.execute(
            text("""
                INSERT INTO submissions (user_id, problem_id, code, hint_count, gate_passed, gate_attempts, time_spent_sec)
                VALUES (:user_id, :problem_id, '', 0, FALSE, 1, 0)
                ON CONFLICT (user_id, problem_id)
                DO UPDATE SET
                    gate_attempts = 1,
                    gate_passed = FALSE
            """),
            {"user_id": user_id, "problem_id": request.problem_id}
        )
    else:
        await db.execute(
            text("""
                INSERT INTO submissions (user_id, problem_id, code, hint_count, gate_passed, gate_attempts, time_spent_sec)
                VALUES (:user_id, :problem_id, '', 0, FALSE, 1, 0)
                ON CONFLICT (user_id, problem_id)
                DO UPDATE SET
                    gate_attempts = submissions.gate_attempts + 1
            """),
            {"user_id": user_id, "problem_id": request.problem_id}
        )

    expires_at = datetime.utcnow() + timedelta(hours=24)

    await db.execute(
        text("""
            INSERT INTO gate_challenges
                (user_id, problem_id, question, options, answer, concept, explanation, expires_at)
            VALUES
                (:user_id, :problem_id, :question, CAST(:options AS JSONB), :answer, :concept, :explanation, :expires_at)
        """),
        {
            "user_id": user_id,
            "problem_id": request.problem_id,
            "question": gate_data["question"],
            "options": json.dumps(gate_data["options"], ensure_ascii=False),
            "answer": gate_data["answer"],
            "concept": gate_data.get("concept", problem_data["concept_tag"]),
            "explanation": gate_data["explanation"],
            "expires_at": expires_at,
        }
    )

    await db.commit()

    usage = await get_usage_status(user_id, "gate", db)

    return {
        "question": gate_data["question"],
        "options": gate_data["options"],
        "concept": gate_data.get("concept", problem_data["concept_tag"]),
        "usage": usage,
    }


# POST /api/gate/verify
# 게이트 답안 검증 + 통과 시 토큰 발급
@router.post("/verify")
async def verify_gate(
    request: GateVerifyRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    email = current_user["email"]

    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = user._mapping["id"]

    challenge_result = await db.execute(
        text("""
            SELECT id, answer, explanation
            FROM gate_challenges
            WHERE user_id = :user_id
            AND problem_id = :problem_id
            AND used = FALSE
            AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"user_id": user_id, "problem_id": request.problem_id}
    )
    challenge = challenge_result.fetchone()

    if not challenge:
        raise HTTPException(
            status_code=400,
            detail="게이트 문제를 먼저 생성해주세요. (만료되었거나 순서가 잘못됐습니다)"
        )

    challenge_data = dict(challenge._mapping)

    is_correct = request.user_answer == challenge_data["answer"]

    await db.execute(
        text("UPDATE gate_challenges SET used = TRUE WHERE id = :id"),
        {"id": challenge_data["id"]}
    )
    await db.commit()

    if not is_correct:
        return {
            "passed": False,
            "message": "오답입니다. 다시 시도하세요.",
            "token": None,
            "explanation": challenge_data["explanation"],
        }

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)

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

    await db.execute(
        text("""
            UPDATE submissions
            SET gate_passed = TRUE
            WHERE user_id = :user_id
            AND problem_id = :problem_id
        """),
        {"user_id": user_id, "problem_id": request.problem_id}
    )

    await db.commit()

    return {
        "passed": True,
        "message": "정답입니다. 게이트를 통과하셨습니다. 🎉",
        "token": token,
        "explanation": challenge_data["explanation"],
    }