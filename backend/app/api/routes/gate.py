# 이해 확인 게이트 라우터
# 핵심 기능: 같은 개념의 다른 유형 문제로 실제 이해도 검증

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json
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


# ============================================================
# 수정: GateVerifyRequest에서 정답 관련 필드 전부 삭제
# ============================================================
# 기존엔 gate_question, gate_options, correct_answer까지 프론트가
# 다시 보내야 했음(=서버가 정답을 프론트에게 넘겼다가 돌려받는 구조).
# 이제는 "사용자가 몇 번을 선택했는지"만 보내면 되고, 정답이 맞는지는
# 서버가 DB에 저장해둔 값으로 직접 확인함 — 클라이언트는 정답을
# 알 수도, 조작할 수도 없어짐
class GateVerifyRequest(BaseModel):
    problem_id: str
    user_answer: int


def build_gate_prompt(problem_data: dict, language: str) -> str:
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

    if problem_type == "ai_reading":
        ai_code = problem_data.get("ai_code", "")
        return f"""Generate a gate verification question based on the original problem below.
[Original Problem]
Title: {title}
Concept: {concept}
Level: {level}
AI Code:
{ai_code}

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
        "python": "Python", "javascript": "JavaScript", "java": "Java",
        "cpp": "C++", "csharp": "C#",
    }
    lang_name = language_map.get(language, language)

    role_map = {
        "ai_reading": f"an expert {lang_name} educator who creates code-reading comprehension questions",
        "ai_debugging": f"an expert {lang_name} educator who creates debugging questions",
        "ai_question": f"an expert AI prompting educator who teaches how to write effective prompts",
        "coding": f"an expert {lang_name} coding educator",
    }
    role = role_map.get(problem_type, f"an expert {lang_name} coding educator")

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

    system_prompt = build_system_prompt(
        problem_data.get("problem_type", "coding"),
        request.language
    )
    user_prompt = build_gate_prompt(problem_data, request.language)

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

    # ============================================================
    # 신규: 정답을 gate_challenges 테이블에 저장
    # ============================================================
    # 이 문제(question/options/answer/explanation/concept)를 DB에
    # 저장해두고, /verify에서는 이 저장된 값과만 비교함.
    # expires_at: 24시간 뒤 만료 — gate_tokens와 동일한 유효기간 정책
    # (사용자가 문제를 받아놓고 하루 넘게 방치하다 답하는 극단적
    #  케이스까지 굳이 허용할 필요는 없다고 판단)
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

    # ============================================================
    # 수정: 응답에서 "answer"(정답 인덱스)와 "explanation"(해설) 제거
    # ============================================================
    # explanation도 함께 뺀 이유: 대부분의 해설이 "정답은 O번, 왜냐하면..."
    # 형태로 시작하기 때문에, 해설 텍스트 자체가 정답을 사실상 알려줌.
    # 해설은 /verify가 채점을 마친 뒤 결과와 함께 내려줌 (기존에도
    # verify 응답에 explanation이 없었으니, 프론트에서 해설을 보여주고
    # 싶다면 이 부분은 별도로 설계 논의가 필요함 — 지금은 우선
    # "문제 풀기 전에 정답이 새어나가지 않는 것"에 집중)
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

    # ============================================================
    # 신규: DB에서 가장 최근에 저장된 게이트 문제(정답 포함) 조회
    # ============================================================
    # "가장 최근 것"을 쓰는 이유: 사용자가 재시도할 때마다 /generate가
    # 새 challenge를 계속 INSERT하므로(재사용 안 함), 지금 화면에
    # 보이는 문제는 항상 가장 최근에 생성된 것이어야 함
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
        # 저장된 challenge가 없으면(만료됐거나, generate 없이 verify를
        # 직접 호출하는 등 비정상 접근) 검증 자체가 불가능하므로 오답 처리
        raise HTTPException(
            status_code=400,
            detail="게이트 문제를 먼저 생성해주세요. (만료되었거나 순서가 잘못됐습니다)"
        )

    challenge_data = dict(challenge._mapping)

    # ============================================================
    # 핵심 변경: 서버가 저장해둔 정답과 직접 비교
    # ============================================================
    # 기존엔 request.correct_answer(프론트가 보낸 값)와 비교했는데,
    # 이제는 challenge_data["answer"](서버 DB에 저장된, 클라이언트가
    # 한 번도 본 적 없는 값)와 비교함
    is_correct = request.user_answer == challenge_data["answer"]

    # 사용한 challenge는 재사용 방지를 위해 used = TRUE로 표시
    # (정답이든 오답이든 한 번 답변한 challenge는 다시 채점에 쓰지 않음)
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
            # 신규: 오답이어도 해설은 보여줄 수 있음 (학습 목적)
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