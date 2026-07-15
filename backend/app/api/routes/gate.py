# 이해 확인 게이트 라우터
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
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
    user_answer: Optional[int] = None
    user_answers: Optional[list[int]] = None


scenario_contexts = [
    "온라인 쇼핑몰 재고 관리", "학교 성적 관리 시스템", "날씨 데이터 분석",
    "SNS 팔로워 수 집계", "게임 점수판", "은행 계좌 거래 내역",
    "도서관 대출 기록", "택배 배송 추적", "카페 주문 관리",
    "헬스장 회원 출석 체크", "영화 예매 시스템", "레시피 재료 계산",
]


# ============================================================
# 신규: 보기 순서 무작위 셔플
# ============================================================
# 실제 데이터로 확인된 편향: 13개 샘플 중 정답이 0번(첫 번째 보기)인
# 경우가 67%, 3번(마지막 보기)은 단 한 번도 없었음. AI가 "정답을 먼저
# 떠올리고 그걸 첫 보기로 적은 뒤 오답을 나중에 덧붙이는" 방식으로
# 생성하다 보니 생기는 자연스러운 편향으로 추정됨.
# "무작위로 배치해라"는 프롬프트 지시보다, 생성 후 코드가 직접
# 섞는 게 훨씬 확실한 해결책 — 다양성 강화 때와 같은 원칙
def shuffle_options(options: list[str], answer_indices: list[int]) -> tuple[list[str], list[int]]:
    """
    보기 순서를 무작위로 섞고, 정답 인덱스(들)도 새 위치에 맞게 재계산.

    Parameters:
        options: 원래 순서의 보기 리스트
        answer_indices: 원래 순서 기준 정답 인덱스 리스트
                         (단일 정답이면 [idx] 형태로 감싸서 전달)

    Returns:
        (섞인 보기 리스트, 새 위치 기준 정답 인덱스 리스트)
    """
    indexed = list(enumerate(options))
    random.shuffle(indexed)

    new_options = [opt for _, opt in indexed]
    # 원래 인덱스 → 셔플 후 새 인덱스 매핑
    old_to_new = {old_idx: new_idx for new_idx, (old_idx, _) in enumerate(indexed)}
    new_answers = sorted(old_to_new[idx] for idx in answer_indices)

    return new_options, new_answers


def build_gate_prompt(problem_data: dict, language: str, scenario_context: str) -> str:
    """기존 4지선다 유형(coding/ai_reading/ai_debugging/ai_question) 프롬프트"""
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

    context_instruction = f"""
[Scenario Context - MUST USE]
Base the new scenario on this real-world context: "{scenario_context}"
Do not use generic or commonly seen examples — ground the question
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


def build_tradeoff_gate_prompt(problem_data: dict, scenario_context: str, num_correct: int) -> str:
    """
    트레이드오프 유형 전용 프롬프트를 만든다.
    num_correct: 이번 문제에서 정답이 몇 개여야 하는지 (2~4 중 랜덤으로 미리 정해서 넘겨받음)
    """
    requirements = problem_data.get("requirements", "")
    concept = problem_data["concept_tag"]
    level = problem_data["level"]
    num_distractors = 5 - num_correct  # 보기가 항상 5개니까, 오답 개수는 5에서 정답 개수를 뺀 값

    # AI는 "설명 문장"보다 "예시 JSON"을 더 강하게 따라가는 경향이 있음
    # (기존 4지선다에서 정답이 67%가 0번이었던 것도 이 이유였음)
    # 그래서 예시 correct_indices도 num_correct 개수에 맞춰 매번 다르게 생성해서 보여줌
    example_indices = list(range(num_correct))

    return f"""Generate a NEW trade-off judgment scenario that tests the same
underlying decision-making skill as the original problem below, but with
a completely different concrete situation.

[Original Problem's Judgment Skill]
{requirements}
Concept: {concept}
Level: {level}

[Scenario Context - MUST USE]
Ground the new scenario in this real-world context: "{scenario_context}"

[Requirements]
1. Present a short new trade-off scenario (1-2 sentences) in the "question" field,
   followed by: "이 상황에서 반드시 고려해야 할 요소를 모두 고르세요"
2. Provide exactly 5 options in "options": EXACTLY {num_correct} genuinely correct
   considerations for this trade-off, and EXACTLY {num_distractors} plausible-sounding
   but irrelevant distractors. The number of correct options MUST be exactly
   {num_correct} — not more, not fewer. Do not default to any other count.
3. "correct_indices" must list EXACTLY {num_correct} 0-based indices of the
   correct options — no more, no less.
4. Include a Korean explanation of why each correct option matters and why
   the distractors are irrelevant
5. IMPORTANT: question, options, and explanation MUST be written in Korean

[Output JSON Schema — this example has {num_correct} correct options, match that count exactly]
{{
    "question": "question text including the new scenario (in Korean)",
    "options": ["option1", "option2", "option3", "option4", "option5"],
    "correct_indices": {example_indices},
    "explanation": "explanation (in Korean)",
    "concept": "concept tag"
}}"""



def validate_tradeoff_answer(gate_data: dict, num_correct: int) -> bool:
    """
    AI가 응답한 JSON이 우리가 시킨 규칙(정답 개수, 인덱스 범위 등)을 실제로 지켰는지 검사.
    여기서 True가 나와야만 "믿고 사용자한테 내보낼 수 있는 문제"라고 판단함.
    """
    indices = gate_data.get("correct_indices")
    options = gate_data.get("options")

    # 타입부터 틀리면 더 볼 것도 없이 실패
    if not isinstance(indices, list) or not isinstance(options, list):
        return False

    # 정답 개수가 우리가 지시한 개수와 정확히 같아야 함
    if len(indices) != num_correct:
        return False

    # 같은 인덱스를 중복으로 정답이라고 우기면 안 됨 (예: [0, 0, 1])
    if len(set(indices)) != len(indices):
        return False

    # 인덱스가 옵션 개수 범위를 벗어나면 안 됨 (예: options는 5개인데 인덱스 5, 6 등장)
    if any(not isinstance(i, int) or i < 0 or i >= len(options) for i in indices):
        return False

    # 보기는 항상 5개여야 함 (프롬프트로 강제했지만, AI가 어길 수도 있으니 재확인)
    if len(options) != 5:
        return False

    return True


def build_system_prompt(problem_type: str, language: str) -> str:
    """Claude의 역할(페르소나)을 설정하는 시스템 프롬프트를 반환한다."""
    language_map = {
        "python": "Python", "javascript": "JavaScript", "java": "Java", "c": "C",
        "cpp": "C++", "csharp": "C#",
    }
    lang_name = language_map.get(language, language)

    role_map = {
        "ai_reading": f"a senior {lang_name} engineer with 10+ years of experience, mentoring junior developers by creating realistic code-reading comprehension questions",
        "ai_debugging": f"a senior {lang_name} engineer with 10+ years of experience, creating debugging questions based on bugs commonly seen in real production code",
        "ai_question": f"a senior engineer with 10+ years of experience who teaches junior developers how to write effective prompts when working with AI coding tools",
        "coding": f"a senior {lang_name} engineer with 10+ years of experience, writing realistic coding problems grounded in real-world scenarios",
        "tradeoff_judgment": "a senior engineer with 10+ years of experience who mentors junior developers on weighing real-world engineering trade-offs",
    }
    role = role_map.get(problem_type, f"a senior {lang_name} engineer with 10+ years of experience")

    return f"""You are {role}.
Generate a verification question that tests the same concept as the original problem
but with a different scenario or approach.
Always respond with valid JSON only. Never include any text outside the JSON structure.
The question, options, and explanation MUST be written in Korean."""


def _call_claude_for_gate(
    system_prompt: str, user_prompt: str, max_tokens: int = 1000
) -> tuple[Optional[dict], int, int]:
    """
    Claude를 호출하고 (파싱된 JSON, 입력토큰, 출력토큰)을 함께 반환한다.
    - 파싱 실패 시 첫 값은 None. 단, 토큰은 이미 소비됐으므로 그대로 반환한다.
      → "실패한 호출의 비용"도 버리지 않아야 원가가 정확해진다 (핵심).
    """
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )

    # 파싱하기 '전에' 먼저 토큰부터 확보한다.
    # 파싱이 실패해도 API 비용은 이미 발생했기 때문.
    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens

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

    # 기존엔 여기서 json.JSONDecodeError를 호출부로 던졌지만,
    # 이제는 None으로 돌려주고 토큰은 살려서 함께 반환한다.
    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        parsed = None

    return parsed, input_tokens, output_tokens


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
                   problem_type, ai_code, questions, requirements
            FROM problems
            WHERE id = :id
        """),
        {"id": request.problem_id}
    )

    problem = result.fetchone()

    if not problem:
        raise HTTPException(status_code=404, detail="문제를 찾을 수 없습니다.")

    problem_data = dict(problem._mapping)
    problem_type = problem_data.get("problem_type", "coding")
    scenario_context = random.choice(scenario_contexts)
    is_tradeoff = problem_type == "tradeoff_judgment"

    system_prompt = build_system_prompt(problem_type, request.language)

    # 이번 요청에서 소비한 토큰을 '재시도까지 전부' 누적한다.
    # 실패한 시도도 돈이 나가므로, 성공분만 세면 원가가 실제보다 싸게 잡힌다(위험한 방향).
    total_input_tokens = 0
    total_output_tokens = 0

    if is_tradeoff:
        num_correct = random.randint(2, 4)
        user_prompt = build_tradeoff_gate_prompt(problem_data, scenario_context, num_correct)

        gate_data = None
        for attempt in range(1, 4):
            candidate, in_tok, out_tok = _call_claude_for_gate(
                system_prompt, user_prompt, max_tokens=1200
            )
            total_input_tokens += in_tok      # 성공/실패 관계없이 누적
            total_output_tokens += out_tok

            if candidate is None:
                print(f"[GATE] 트레이드오프 응답 파싱 실패 (attempt={attempt}, "
                      f"problem_id={request.problem_id})")
                continue
            if validate_tradeoff_answer(candidate, num_correct):
                gate_data = candidate
                break
            print(f"[GATE] 트레이드오프 정답 개수/형식 불일치 (attempt={attempt}, "
                  f"problem_id={request.problem_id}, expected={num_correct})")

        if gate_data is None:
            # 3번 다 실패해도 '소비한 토큰'은 기록하고 넘어간다 → 원가 언더카운트 방지
            await record_api_usage(user_id, "gate", db, total_input_tokens, total_output_tokens)
            await db.commit()
            raise HTTPException(
                status_code=503,
                detail="게이트 문제 생성에 실패했습니다. 잠시 후 다시 시도해주세요."
            )

        shuffled_options, shuffled_answers = shuffle_options(
            gate_data["options"], gate_data["correct_indices"]
        )
        gate_data["options"] = shuffled_options
        gate_data["correct_indices"] = shuffled_answers

    else:
        # ⚠️ 복구: 리팩터링 때 통째로 사라졌던 일반 4지선다 유형 분기
        #    (coding / ai_reading / ai_debugging / ai_question)
        user_prompt = build_gate_prompt(problem_data, request.language, scenario_context)

        gate_data, in_tok, out_tok = _call_claude_for_gate(system_prompt, user_prompt)
        total_input_tokens += in_tok
        total_output_tokens += out_tok

        if gate_data is None:
            await record_api_usage(user_id, "gate", db, total_input_tokens, total_output_tokens)
            await db.commit()
            raise HTTPException(
                status_code=503,
                detail="게이트 문제 생성에 실패했습니다. 잠시 후 다시 시도해주세요."
            )

        # 코드 실행 결과 검증 (AI가 준 원래 순서 기준)
        verify_result = verify_code_answer(
            gate_data["question"], gate_data["options"], gate_data["answer"]
        )
        if verify_result is False:
            print(f"[GATE] 정답 불일치 감지 — 재생성 시도 (problem_id={request.problem_id})")
            retry_data, in_tok, out_tok = _call_claude_for_gate(system_prompt, user_prompt)
            total_input_tokens += in_tok       # 재시도 토큰도 누적
            total_output_tokens += out_tok
            if retry_data is not None:
                retry_verify = verify_code_answer(
                    retry_data["question"], retry_data["options"], retry_data["answer"]
                )
                gate_data = retry_data
                if retry_verify is False:
                    print(f"[GATE] 재시도도 실패 — 재시도 결과로 진행 (problem_id={request.problem_id})")
            else:
                print(f"[GATE] 재시도 응답 파싱 실패 — 원본 유지 (problem_id={request.problem_id})")

        # 검증 끝난 뒤(정답 위치 확정 후) 셔플
        shuffled_options, shuffled_answers = shuffle_options(
            gate_data["options"], [gate_data["answer"]]
        )
        gate_data["options"] = shuffled_options
        gate_data["answer"] = shuffled_answers[0]

    # 성공 경로: 누적된 실측 토큰과 함께 사용 기록
    await record_api_usage(user_id, "gate", db, total_input_tokens, total_output_tokens)

    if request.is_first:
        await db.execute(
            text("""
                INSERT INTO submissions (user_id, problem_id, code, hint_count, gate_passed, gate_attempts, time_spent_sec)
                VALUES (:user_id, :problem_id, '', 0, FALSE, 1, 0)
                ON CONFLICT (user_id, problem_id)
                DO UPDATE SET gate_attempts = 1, gate_passed = FALSE
            """),
            {"user_id": user_id, "problem_id": request.problem_id}
        )
    else:
        await db.execute(
            text("""
                INSERT INTO submissions (user_id, problem_id, code, hint_count, gate_passed, gate_attempts, time_spent_sec)
                VALUES (:user_id, :problem_id, '', 0, FALSE, 1, 0)
                ON CONFLICT (user_id, problem_id)
                DO UPDATE SET gate_attempts = submissions.gate_attempts + 1
            """),
            {"user_id": user_id, "problem_id": request.problem_id}
        )

    expires_at = datetime.utcnow() + timedelta(hours=24)

    await db.execute(
        text("""
            INSERT INTO gate_challenges
                (user_id, problem_id, question, options, answer, answers, concept, explanation, expires_at)
            VALUES
                (:user_id, :problem_id, :question, CAST(:options AS JSONB), :answer, :answers, :concept, :explanation, :expires_at)
        """),
        {
            "user_id": user_id,
            "problem_id": request.problem_id,
            "question": gate_data["question"],
            "options": json.dumps(gate_data["options"], ensure_ascii=False),
            "answer": None if is_tradeoff else gate_data["answer"],
            "answers": gate_data["correct_indices"] if is_tradeoff else None,
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
        "multi_select": is_tradeoff,
        "usage": usage,
    }


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
            SELECT id, answer, answers, explanation
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

    if challenge_data["answers"] is not None:
        correct_set = set(challenge_data["answers"])
        user_set = set(request.user_answers or [])
        is_correct = correct_set == user_set
    else:
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
        {"user_id": user_id, "problem_id": request.problem_id, "token": token, "expires_at": expires_at}
    )

    await db.execute(
        text("UPDATE submissions SET gate_passed = TRUE WHERE user_id = :user_id AND problem_id = :problem_id"),
        {"user_id": user_id, "problem_id": request.problem_id}
    )

    await db.commit()

    return {
        "passed": True,
        "message": "정답입니다. 게이트를 통과하셨습니다. 🎉",
        "token": token,
        "explanation": challenge_data["explanation"],
    }