# 이해 확인 게이트 라우터
# 핵심 기능: 같은 개념의 다른 유형 문제로 실제 이해도 검증

# coding 유형은 영어 프롬프트인데, AI 유형들(ai_reading, ai_debugging, ai_question)은 한글 프롬프트로 작성된 이유
# 영어가 한국어보다 토큰 효율이 더 좋은 것은 맞음.
# 하지만 한국어로 작성된 이유 == 트레이드 오프(Trade-Off) 때문임.
# ai_reading, ai_debugging, ai_question 유형은 프롬프트 안에 아래처럼 들어감.
#   제목: {title}           # "리스트 슬라이싱 결과 예측" (한국어)
#   개념: {concept}         # "리스트" (한국어)
#   AI 코드: {ai_code}      # 코드 (영어지만 주석은 한국어)
#   원본 질문: {...}        # "위 코드의 출력 결과는?" (한국어)
# 문제 데이터 자체가 한국어라서, 지시문만 영어로 쓰면 섞임.

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
from app.core.rate_limit import check_rate_limit, record_api_usage
from app.core.code_verifier import verify_code_answer
from app.core.rate_limit import check_rate_limit, record_api_usage, get_usage_status

# 신규: JWT 인증 — 이 라우터의 두 엔드포인트는 전부 로그인 필수
# (게이트는 Rate Limit이 걸린 유료 자원(Claude API 호출)이라
#  게스트 허용 대상이 아니었음, 그래서 선택적 인증이 아니라
#  submit.py에서 썼던 get_current_user 필수 인증을 그대로 사용)
from app.core.auth import get_current_user

# ─────────────────────────────────────────────
# APIRouter: FastAPI에서 라우터(경로 묶음)를 만드는 클래스
# prefix="/api/gate" → 이 라우터의 모든 엔드포인트 앞에 /api/gate가 붙음
# tags=["gate"] → Swagger 문서에서 "gate" 그룹으로 묶임
# ─────────────────────────────────────────────
router = APIRouter(prefix="/api/gate", tags=["gate"])

# ─────────────────────────────────────────────
# 싱글톤 패턴: 클라이언트 객체를 딱 한 번만 만들어 재사용
# 매 요청마다 새로 만들면 연결 오버헤드가 생기기 때문에
# 모듈 레벨(파일 최상단)에서 한 번 초기화하는 게 관례
# ─────────────────────────────────────────────
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# ─────────────────────────────────────────────
# Pydantic BaseModel: 요청 데이터의 타입과 유효성을 자동 검증해주는 클래스
# FastAPI가 요청 body를 이 모델로 파싱 → 타입 불일치면 422 에러 자동 반환
# ─────────────────────────────────────────────
class GateGenerateRequest(BaseModel):
    problem_id: str        # 원본 문제 ID (UUID 형태의 문자열)
    # 삭제: email 필드
    # ============================================================
    # 왜 삭제했는가
    # ============================================================
    # 게이트는 Rate Limit(하루 10회)이 걸린 자원인데, email을 body로
    # 그대로 신뢰하면 "내 사용량을 남의 이메일로 떠넘기며 무한정
    # 게이트를 생성"하는 게 가능했음. 이제는 아래 current_user
    # (JWT로 검증된 값)만 신뢰함.
    language: str = "python"  # 언어 (기본값 python) → "= 값" 이 있으면 선택 필드
    is_first: bool = False      # 이번 풀이의 첫 게이트 시도 여부 (True면 시도 횟수 리셋)


class GateVerifyRequest(BaseModel):
    problem_id: str
    # 삭제: email 필드 — GateGenerateRequest와 동일한 이유
    gate_question: str         # 생성된 게이트 문제 텍스트
    gate_options: list[str]    # 보기 리스트 ["A. ...", "B. ...", ...]
    user_answer: int           # 사용자가 선택한 보기 인덱스 (0~3)
    correct_answer: int        # 정답 인덱스 (0~3)


# ─────────────────────────────────────────────
# 순수 함수(pure function): DB/API 호출 없이 입력값만으로 결과를 결정
# 테스트하기 쉽고, 라우터 함수가 길어지는 걸 막아줌 (관심사 분리)
#
# dict 타입 힌트: 어떤 키-값이든 받을 수 있는 딕셔너리
# str 타입 힌트: 문자열 반환
# ─────────────────────────────────────────────
# ─────────────────────────────────────────────
# 순수 함수(pure function): DB/API 호출 없이 입력값만으로 결과를 결정
# 테스트하기 쉽고, 라우터 함수가 길어지는 걸 막아줌 (관심사 분리)
#
# 전략: 지시문(instruction)은 영어로 → 토큰 절약 + 모델 지시 이해 정확도 ↑
#       데이터({title} 등)는 한국어 그대로 삽입 → 어차피 원본이 한국어
#       출력 언어는 "MUST be in Korean"으로 명시 → 언어 혼동 방지
# ─────────────────────────────────────────────
def build_gate_prompt(problem_data: dict, language: str) -> str:
    """problem_type에 따라 Claude에게 전달할 사용자 프롬프트를 생성한다."""

    # dict.get(key, default): 키가 없으면 default 반환 (KeyError 방지)
    problem_type = problem_data.get("problem_type", "coding")
    concept = problem_data["concept_tag"]
    level = problem_data["level"]
    title = problem_data["title"]
    description = problem_data["description"]

    # 모든 유형에서 동일하게 쓸 JSON 출력 형식
    # f-string 안에 중괄호를 쓸 때 {{ }} 로 이스케이프해야 함
    # (f-string은 { }를 변수 치환으로 해석하기 때문)
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
        # dict.get(key, default): ai_code가 없는 문제일 경우 빈 문자열 반환
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
        # questions는 DB에서 JSONB 타입으로 저장된 리스트
        # None일 수 있으므로 "or []" 로 빈 리스트 기본값 처리
        questions = problem_data.get("questions") or []
        original_q = ""
        # 원본 질문이 있으면 참고용으로 프롬프트에 포함
        if questions:
            # questions[0]: 첫 번째 질문 딕셔너리
            # .get('question', ''): 'question' 키가 없으면 빈 문자열
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
        # coding 유형 (기본값): 기존 영어 프롬프트 유지
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
    """Claude의 역할(페르소나)을 설정하는 시스템 프롬프트를 반환한다.

    system_prompt = Claude가 대화 전체에서 유지할 역할/규칙
    user_prompt   = 이번 요청의 실제 내용
    둘을 분리하면 역할 설정과 요청 내용을 깔끔하게 관리할 수 있음

    전략: 시스템 프롬프트도 영어로 통일 (토큰 절약 + 지시 정확도)
        단, 출력 언어는 Korean으로 명시
    """
    language_map = {
        "python": "Python",
        "javascript": "JavaScript",
        "java": "Java",
        "cpp": "C++",
        "csharp": "C#",
    }
    # dict.get(key, fallback): 지원하지 않는 언어가 오면 그대로 사용
    lang_name = language_map.get(language, language)

    # problem_type별로 교육자 역할(페르소나)을 다르게 설정
    # → 같은 "코딩 교육자"여도 어떤 능력을 강조하느냐가 달라짐
    role_map = {
        "ai_reading": f"an expert {lang_name} educator who creates code-reading comprehension questions",
        "ai_debugging": f"an expert {lang_name} educator who creates debugging questions",
        "ai_question": f"an expert AI prompting educator who teaches how to write effective prompts",
        "coding": f"an expert {lang_name} coding educator",
    }
    role = role_map.get(problem_type, f"an expert {lang_name} coding educator")

    # 모든 유형 공통: JSON만 응답 + 한국어 출력 명시
    return f"""You are {role}.
Generate a verification question that tests the same concept as the original problem
but with a different scenario or approach.
Always respond with valid JSON only. Never include any text outside the JSON structure.
The question, options, and explanation MUST be written in Korean."""


# ─────────────────────────────────────────────
# @router.post("/generate")
# → HTTP POST /api/gate/generate 요청을 이 함수가 처리
#
# async def: 비동기 함수
# → DB 쿼리, API 호출처럼 "기다리는 작업"이 있을 때 사용
# → await 키워드로 기다리는 동안 다른 요청을 처리할 수 있음
# → 동기 함수였다면 DB 응답 기다리는 동안 서버 전체가 멈춤
#
# Depends(get_db): 의존성 주입(Dependency Injection)
# → FastAPI가 요청마다 자동으로 DB 세션을 열고 함수에 전달
# → 함수가 끝나면 자동으로 세션을 닫아줌 (리소스 누수 방지)
# ─────────────────────────────────────────────
@router.post("/generate")
async def generate_gate(
    request: GateGenerateRequest,
    # 신규: 로그인 필수 인증 — 토큰 없거나 무효하면 자동으로 401
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 수정: request.email → current_user["email"]
    email = current_user["email"]

    # ── 1. 유저 조회 ──────────────────────────
    # text(): SQLAlchemy에서 raw SQL을 사용할 때 감싸는 래퍼
    # :email 은 바인딩 파라미터 → SQL 인젝션 방지
    # {"email": email} 로 실제 값을 전달
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    # fetchone(): 결과 중 첫 번째 행 하나만 가져옴 (없으면 None)
    user = user_result.fetchone()

    if not user:
        # HTTPException: FastAPI에서 HTTP 에러 응답을 만드는 클래스
        # status_code=404 → "Not Found" 응답
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    # _mapping: SQLAlchemy Row 객체를 딕셔너리처럼 접근하게 해주는 속성
    # str()로 변환하는 이유: DB의 UUID 타입을 문자열로 통일하기 위해
    user_id = str(user._mapping["id"])

    # ── 2. Rate Limit 체크 ────────────────────
    # 하루 10회 초과 시 429 Too Many Requests 에러 발생 (rate_limit.py 참고)
    await check_rate_limit(user_id, "gate", db)

    # ── 3. 문제 조회 ──────────────────────────
    # 기존과 달리 problem_type, ai_code, questions도 같이 가져옴
    # → 유형별 프롬프트 분기에 필요한 데이터들
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

    # dict(row._mapping): SQLAlchemy Row → 일반 파이썬 딕셔너리로 변환
    # 이후 코드에서 problem_data["key"] 형태로 접근하기 위해
    problem_data = dict(problem._mapping)

    # ── 4. problem_type별 프롬프트 생성 ─────────
    # 관심사 분리: 프롬프트 생성 로직을 별도 함수로 분리
    # → 이 함수는 "언제 어떻게 호출할지"만 담당
    # → 프롬프트 내용은 build_* 함수들이 담당
    system_prompt = build_system_prompt(
        problem_data.get("problem_type", "coding"),
        request.language
    )
    user_prompt = build_gate_prompt(problem_data, request.language)

    # ── 5. Claude API 호출 ────────────────────
    # client.messages.create(): Anthropic SDK의 동기 호출
    # (AsyncAnthropic을 쓰면 await 가능하지만 현재 동기 클라이언트 사용 중)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,         # 응답 최대 토큰 수
        system=system_prompt,    # Claude의 역할/규칙 설정
        messages=[{"role": "user", "content": user_prompt}]  # 실제 요청
    )

    # ── 6. 응답 텍스트 추출 ───────────────────
    # message.content: 응답 블록 리스트 (TextBlock, ToolUseBlock 등 섞일 수 있음)
    # next(generator, default): generator에서 첫 번째 값 꺼내기
    #   → TextBlock만 필터링해서 첫 번째 텍스트 반환
    #   → 없으면 빈 문자열 반환
    response_text = next(
        (block.text for block in message.content
         if isinstance(block, anthropic.types.TextBlock)),
        ""
    )

    # ── 7. 코드 블록 마커 제거 ────────────────
    # Claude가 가끔 ```json ... ``` 형태로 감싸서 응답하는 경우가 있음
    # JSON 파싱 전에 반드시 제거해야 json.loads() 에러 방지
    response_text = response_text.strip()
    if response_text.startswith("```json"):
        response_text = response_text[7:]   # "```json" 7글자 제거
    if response_text.startswith("```"):
        response_text = response_text[3:]   # "```" 3글자 제거
    if response_text.endswith("```"):
        response_text = response_text[:-3]  # 끝의 "```" 3글자 제거
    response_text = response_text.strip()

    # ── 8. JSON 파싱 ──────────────────────────
    # json.loads(): JSON 문자열 → 파이썬 딕셔너리
    # try/except: 파싱 실패 시 500 에러 반환 (서버 문제로 간주)
    try:
        gate_data = json.loads(response_text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="게이트 문제 생성 중 오류가 발생했습니다."
        )

    # ============================================================
    # 코드 실행 결과 검증
    # ============================================================
    # verify_code_answer가 False를 반환하면(코드는 있는데 정답이 틀림),
    # 딱 1번만 Claude에게 다시 만들어달라고 요청함.
    # None이 오면(애초에 코드가 없는 문제) 검증 대상이 아니므로 그냥 통과.
    verify_result = verify_code_answer(
        gate_data["question"], gate_data["options"], gate_data["answer"]
    )

    if verify_result is False:
        print(f"[Gate] 정답 불일치 감지 - 재생성 시도 (problem_id={request.problem_id})")

        # 같은 프롬프트 1회 재시도
        retry_message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        retry_text = next(
            (block.text for block in retry_message.content
            if isinstance(block, anthropic.types.TextBlock)),
            ""
        )

        retry_text = retry_text.strip()
        if retry_text.startswith("```json"):
            retry_text = retry_text[7:]
        if retry_text.startswith("```"):
            retry_text = retry_text[3:]
        if retry_text.endswith("```"):
            retry_text = retry_text[:-3]
        retry_text = retry_text.strip()

        try:
            retry_data = json.loads(retry_text)
            retry_verify = verify_code_answer(
                retry_data["question"], retry_data["options"], retry_data["answer"]
            )
            if retry_verify is not False:
                # 재시도가 통과(True) 또는 검증불가(None)면 재시도 결과로 교체
                gate_data = retry_data
            else:
                # 재시도까지 실패 — 완전히 다른 유형으로 바꾸는 로직은
                # 아직 없어서, 일단 재시도 결과를 그대로 쓰고 로그만 남김
                # (모니터링 후 실제로 자주 발생하면 폴백 로직 추가 예정)
                print(f"[GATE] 재시도도 실패 — 재시도 결과로 진행 (problem_id={request.problem_id})")
                gate_data = retry_data
        except json.JSONDecodeError:
            # 재시도 응답 파싱조차 실패하면 원본 gate_data를 그대로 사용
            print(f"[GATE] 재시도 응답 파싱 실패 — 원본 유지 (problem_id={request.problem_id})")


    # ── 9. Rate Limit 사용 기록 ───────────────
    # 체크(check)와 기록(record)을 분리한 이유:
    # Claude API 호출이 성공한 후에만 카운트 차감
    # → API 실패한 요청은 횟수에서 빠짐
    await record_api_usage(user_id, "gate", db)

    # ── 10. gate_attempts 업데이트 (UPSERT) ────
    # 문제: submissions 행은 최종 제출(submit) 때 처음 생성됨
    #       → 게이트 생성 시점엔 행이 아직 없어서
    #         단순 UPDATE는 매칭되는 행이 0건 → 아무 일도 안 일어남 (에러도 안 남)
    # 해결: 행이 없으면 INSERT, 이미 있으면 +1 하는 UPSERT 패턴 사용
    #
    # UPSERT = UPDATE + INSERT
    # INSERT ... ON CONFLICT ... DO UPDATE:
    #   - (user_id, problem_id) 유니크 제약에 충돌(이미 행 존재)하면 DO UPDATE로 분기
    #   - 충돌 없으면(행 없음) 그대로 INSERT
    #   - "조회 후 분기"보다 원자적(atomic)이라 동시성 문제도 없음
    # is_first=True  → 이번 풀이의 첫 게이트 시도 → gate_attempts를 1로 리셋
    #                  (같은 문제를 다시 풀 때 이전 누적값을 초기화하기 위함)
    # is_first=False → 같은 풀이 내 재시도 → 기존값 +1 누적
    if request.is_first:
        # 첫 시도: 행이 없으면 생성(1), 있으면 1로 리셋
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
        # 재시도: 기존값 +1 누적
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

    # db.commit(): 위의 모든 DB 변경사항을 실제로 저장
    # commit() 전까지는 트랜잭션 안에 임시 저장 상태
    await db.commit()

    # --- 11. 현재 게이트 사용 현황 조회 ---
    # 프론트엔드가 "남은 횟수"를 알아야 사전 경고(6~7회)를 띄울 수 있음
    # get_usage_status는 used/limit/remaining을 계산해서 반환 (rate_limit.py)
    # 이미 record_api_usage로 이번 호출이 기록된 뒤이므로,
    # 여기서 조회하면 이번 사용분까지 반영된 정확한 현황이 나옴
    usage = await get_usage_status(user_id, "gate", db)

    return {
        "question": gate_data["question"],
        "options": gate_data["options"],
        "answer": gate_data["answer"],
        "explanation": gate_data["explanation"],
        # .get()으로 안전하게 접근 → concept 키가 없으면 원본 concept_tag 사용
        "concept": gate_data.get("concept", problem_data["concept_tag"]),
        # 사용 현황 추가 (프론트 경고 표시음)
        "usage": usage,
    }


# POST /api/gate/verify
# 게이트 답안 검증 + 통과 시 토큰 발급
@router.post("/verify")
async def verify_gate(
    request: GateVerifyRequest,
    # 신규: 로그인 필수 인증
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 수정: request.email → current_user["email"]
    email = current_user["email"]

    # ── 1. 정답 여부 확인 ─────────────────────
    # 단순 인덱스 비교: 프론트에서 correct_answer를 함께 전송하는 구조
    # (보안 주의: 실제 서비스에서는 correct_answer를 DB에서 직접 조회하는 게 안전)
    # ============================================================
    # 참고: 이건 오늘 손대지 않는 별개의 취약점
    # ============================================================
    # request.correct_answer를 프론트가 그대로 보내는 구조라, 개발자
    # 도구로 이 값을 훔쳐보거나 아예 조작해서 항상 "정답"으로 통과시킬
    # 수 있음 — email 위조 문제와는 다른 종류의 문제(정답 자체가
    # 클라이언트에 노출/신뢰됨). 근본 해결은 generate 시점에 문제와
    # 정답을 DB(또는 서버 메모리)에 저장해두고, verify에서는 그 저장된
    # 값과 비교하는 구조로 바꿔야 함. 오늘은 email/JWT 범위만 다루고,
    # 이건 다음에 예정된 "AI 정답 검증 파이프라인" 작업과 묶어서
    # 처리하는 게 좋을 것 같음 (같은 "정답 신뢰 구조" 문제라서)
    is_correct = request.user_answer == request.correct_answer

    if not is_correct:
        # 오답이면 토큰 없이 바로 반환 (DB 작업 없음)
        return {
            "passed": False,
            "message": "오답입니다. 다시 시도하세요.",
            "token": None,
        }

    # ── 2. 토큰 생성 ──────────────────────────
    # secrets.token_urlsafe(32):
    # → 암호학적으로 안전한 난수 기반 토큰 생성
    # → random 모듈과 달리 예측 불가능 (보안 용도에 적합)
    # → 32바이트 → base64url 인코딩 → 약 43자 문자열
    # → URL에 안전한 문자만 사용 (+, / 대신 -, _ 사용)
    token = secrets.token_urlsafe(32)

    # timedelta(hours=24): 현재 시각 + 24시간 = 만료 시각
    # datetime.utcnow(): UTC 기준 현재 시각 (서버 시간대 무관하게 일관성 유지)
    expires_at = datetime.utcnow() + timedelta(hours=24)

    # ── 3. 유저 조회 ──────────────────────────
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = user._mapping["id"]

    # ── 4. gate_tokens 테이블에 토큰 저장 ─────
    # INSERT: 새 행 추가
    # 이 토큰은 submit.py에서 최종 제출 시 유효성 검증에 사용됨
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

    # ── 5. submissions 테이블 gate_passed 업데이트 ──
    # gate_passed = TRUE: 이 문제의 게이트 통과 완료 표시
    # WHERE 절로 해당 유저 + 문제 행만 업데이트
    await db.execute(
        text("""
            UPDATE submissions
            SET gate_passed = TRUE
            WHERE user_id = :user_id
            AND problem_id = :problem_id
        """),
        {"user_id": user_id, "problem_id": request.problem_id}
    )

    # INSERT와 UPDATE 두 작업을 하나의 트랜잭션으로 커밋
    # → 둘 중 하나라도 실패하면 둘 다 롤백 (데이터 일관성 보장)
    await db.commit()

    return {
        "passed": True,
        "message": "정답입니다. 게이트를 통과하셨습니다. 🎉",
        "token": token,
    }