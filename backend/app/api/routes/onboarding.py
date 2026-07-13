# FastAPI의 라우터 기능 - main.py의 app에 붙일 미니 앱 같은 개념
# 기능별로 라우터를 분리하면 main.py가 복잡해지지 않음
# APIRouter: 라우터 생성
# HTTPException: HTTP 에러 반환 (400, 500 등)
# Depends: 의존성 주입 - get_db()를 자동으로 실행해서 세션을 주입해줌
from fastapi import APIRouter, HTTPException, Depends

# AsyncSession: 비동기 DB 세션 타입
# 함수 파라미터에 타입 힌트로 사용 (db: AsyncSession)
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import text

# Pydantic: 요청/응답 데이터의 타입과 형식을 검증해주는 라이브러리
# BaseModel을 상속하면 자동으로 타입 체크 + 에러 메세지 생성
from pydantic import BaseModel

# anthropic: Claude API 공식 Python 라이브러리
import anthropic

# JSON 파싱
import json

# 신규: random.sample로 개념 풀에서 무작위 5개를 뽑기 위해 추가
# (AI에게 "다양하게 만들어라"라고 지시만 하는 대신, 우리 코드가
#  직접 다양성을 강제하기 위한 모듈)
import random

# Optional 타입 - 선택적 인증 반환값 표현용
from typing import Optional

# 환경변수에서 API 키 가져오기
from app.core.config import settings

# get_db(): DB 세션을 생성하고 반환하는 제너레이터 함수
# Depends(get_db)로 등록하면 요청마다 자동으로 세션을 열고 닫아줌
from app.core.database import get_db
from app.core.rate_limit import check_rate_limit, record_api_usage

# JWT 인증 의존성 두가지
# get_current_user: 로그인 함수 (complete에서 사용)
# get_current_user_optional: 로그인 선택 (quiz/generated에서 사용, 게스트 허용)
from app.core.auth import get_current_user, get_current_user_optional

# 문제 각각 검증
from app.core.code_verifier import verify_code_answer

# 이 라우터의 모든 엔드포인트는 /api/onboarding 으로 시작함.
router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

# Claude API 클라이언트 초기화 (싱글톤 패턴)
# 매 요청마다 새로 만들지 않고 모듈 레벨에서 한 번만 생성
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 퀴즈 생성 요청 데이터 형식 정의
class QuizGenerateRequest(BaseModel):
    # 사용자가 선택한 수준: "beginner", "intermediate", "advanced" 중 하나
    level: str

    # 사용자 이메일 (선택 - 비로그인도 퀴즈 가능)
    # Rate Limitin은 로그인 유저만 적용
    # email: str = ""


# ============================================================
# 개념 풀 (concept pool)
# ============================================================
# 기존엔 프롬프트 안에 "매번 다르게 만들어라"는 지시(Diversity Rules)만
# 넣고 어떤 개념을 다룰지는 전부 AI 판단에 맡겼음. 그런데 LLM은 이런
# "알아서 무작위로 골라라"는 지시를 받아도 확률이 높은(=흔히 등장하는)
# 패턴으로 수렴하는 경향이 있어서, 실제로는 온보딩할 때마다 비슷한
# 문제들이 반복해서 나오는 문제가 있었음.
#
# 해결: 무작위성을 AI에게 맡기지 않고, 파이썬의 random.sample()로
# 우리 코드가 직접 이번 퀴즈에서 다룰 5개 개념을 미리 확정한 뒤,
# "이 개념들로만 만들어라"라고 프롬프트에 강제 지정함.
# → 다양성이 "AI의 확률적 판단"이 아니라 "코드의 구조"로 보장됨
concept_pool = {
    "beginner": [
        "변수와 자료형", "조건문", "반복문", "문자열 슬라이싱",
        "리스트 기초", "type 변환", "input/print 활용",
    ],
    "intermediate": [
        "함수와 매개변수", "리스트 컴프리헨션", "딕셔너리 활용",
        "튜플과 집합", "문자열 메서드", "예외 처리 기초", "재귀 입문",
    ],
    "advanced": [
        "클래스와 객체지향", "재귀 알고리즘", "데코레이터",
        "제너레이터", "예외 처리 심화", "정렬 알고리즘", "자료구조 활용",
    ],
}


# 퀴즈 생성 엔드포인트
# POST /api/onboarding/quiz/generate
@router.post("/quiz/generate")
async def generate_quiz(
    request: QuizGenerateRequest,
    # 선택적 인증 - 토큰 있으면 검증된 유저 정보, 없으면 None(Guest)
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    
    # 유효한 수준인지 검증
    # 딕셔너리를 쓰는 이유: O(1) 조회 - if/elif 체인보다 빠르고 깔끔
    level_description = {
        "beginner": "파이썬 기초 문법을 막 배우기 시작한 수준. 변수, 조건문, 반복문 정도 알고 있음",
        "intermediate": "파이썬 기본 문법은 알고 있고, 함수, 리스트, 딕셔너리를 다룰 수 있는 수준",
        "advanced": "클래스, 재귀, 알고리즘 등 기초를 알고 실무 프로젝트 경험이 있는 수준",
    }

    if request.level not in level_description:
        # 유효하지 않은 수준이면 400 에러 발생
        raise HTTPException(
            status_code=400,
            detail=f"올바르지 않은 수준입니다. beginner/intermediate/advanced 중 하나를 선택하세요."
        )

    email = current_user["email"] if current_user else ""

    # 로그인 유저만 Rate Limiting 적용
    # 비로그인 유저는 퀴즈 자유롭게 사용 가능
    if email:
        user_result = await db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email}
        )

        user = user_result.fetchone()

        if user:
            user_id = str(user._mapping["id"])
            # Rate Limit 체크 - 하루 3회 제한
            await check_rate_limit(user_id, "quiz", db)

    level_desc = level_description[request.level]

    # 신규: 이번 요청에서 다룰 5개 개념을 미리 확정
    # random.sample: 중복 없이 5개를 무작위로 뽑음
    # (풀이 개념별로 7개씩이라 5개를 뽑으면 7C5 = 21가지 조합이 나와서
    #  매번 다른 조합이 나올 확률이 충분히 높음)
    selected_concepts = random.sample(concept_pool[request.level], 5)

    
    # Claude API 호출
    # 소크라테스 힌트가 아닌 진단 퀴즈용 프롬프트
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=5000,
        system="""You are an expert Python coding educator.
Generate diagnostic quiz questions to evaluate learners' actual understanding.
Always respond with valid JSON format only.
Never include any text outside the JSON structure.""",
        messages=[
            {
                "role": "user",
                "content": f"""Generate a diagnostic quiz to evaluate the learner's actual understanding.

[Learner Information]
- Level: {request.level}
- Description: {level_desc}

[Question Generation Rules]
1. Generate exactly 5 questions
2. Each question must be multiple choice with 4 options
3. Questions must test code understanding and reasoning, not memorization
4. Each question must measure a different concept
5. At least 2 questions must ask about code execution results
6. Wrong answers must be based on common misconceptions
7. There must be exactly one correct answer
8. Questions must include sufficient information to avoid ambiguity

[Concept Assignment - MUST FOLLOW]
Generate exactly one question for each of these 5 concepts, in this exact order:
{chr(10).join(f"{i+1}. {c}" for i, c in enumerate(selected_concepts))}
Do not substitute these concepts with others. Each question's "concept" field
in the output JSON must match the assigned concept above (translated to Korean
if needed).
Use different code scenarios each time (avoid reusing same variable names or
patterns from typical textbook examples).

[Difficulty Guidelines]
- Must require at least one level of thinking (code reasoning, etc.)
- Maintain appropriate difficulty for the given level

[Output Format Rules]
- Output valid JSON only
- No text outside JSON is allowed
- Use double quotes for all strings
- No trailing commas

[Output JSON Schema]
{{
    "questions": [
        {{
            "id": 1,
            "question": "question content in Korean",
            "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
            "answer": 0,
            "concept": "concept being measured in Korean",
            "explanation": "reason for correct answer in Korean"
        }}
    ]
}}"""
            }
        ]
    )


    # Claude 응답에서 텍스트 추출
    response_text = next(
        (block.text for block in message.content
            if isinstance(block, anthropic.types.TextBlock)),
        ""
    )

    response_text = response_text.strip()

    # 여러 형태의 코드 블록 마커 제거
    # re.sub으로 더 강력하게 처리 - 줄바꿈 포함 다양한 형태 대응
    import re
    response_text = re.sub(r'```json\s*', '', response_text)
    response_text = re.sub(r'```\s*', '', response_text)

    response_text = response_text.strip()

    try:
        quiz_data = json.loads(response_text)
    except json.JSONDecodeError as e:
        print(f"JSON 파싱 에러: {e}")
        print(f"응답 텍스트: {repr(response_text[:200])}")
        raise HTTPException(
            status_code=500,
            detail=f"퀴즈 생성 중 오류가 발생했습니다. 다시 시도해주세요."
        )

    # ============================================================
    # 신규: 5문제 각각의 코드 실행 결과 검증
    # ============================================================
    # 퀴즈는 한 번의 API 호출로 5문제가 통째로 나오기 때문에,
    # 게이트(문제 1개)처럼 "전체를 다시 생성"하면 낭비가 큼.
    # 대신 검증에 실패한 문제 "하나만" 별도로 재생성함
    questions = quiz_data["questions"]

    for idx, q in enumerate(questions):
        verify_result = verify_code_answer(q["question"], q["options"], q["answer"])

        if verify_result is False:
            print(f"[QUIZ] 문제 {idx+1} 정답 불일치 감지 — 개별 재생성 시도")

            concept = selected_concepts[idx] if idx < len(selected_concepts) else q.get("concept", "")

            # 해당 개념 하나에 대해서만 새 문제를 만들어달라고 요청
            # (5문제 전체를 다시 만들지 않고 딱 1문제만 재생성 — 비용 절약)
            retry_prompt = f"""Generate exactly ONE diagnostic quiz question about the concept "{concept}"
for a {request.level} level Python learner.

[Requirements]
1. Multiple choice with 4 options
2. Test code understanding and reasoning, not memorization
3. Wrong answers must be based on common misconceptions
4. IMPORTANT: question, options, and explanation MUST be written in Korean

[Output JSON Schema]
{{
    "id": {idx + 1},
    "question": "question content in Korean",
    "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
    "answer": 0,
    "concept": "concept in Korean",
    "explanation": "reason for correct answer in Korean"
}}"""

            try:
                retry_message = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1000,
                    system="""You are an expert Python coding educator.
Always respond with valid JSON only. Never include any text outside the JSON structure.""",
                    messages=[{"role": "user", "content": retry_prompt}]
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

                retry_q = json.loads(retry_text)
                retry_verify = verify_code_answer(
                    retry_q["question"], retry_q["options"], retry_q["answer"]
                )

                if retry_verify is not False:
                    # 재시도 통과 → 원래 자리(idx)에 교체
                    questions[idx] = retry_q
                else:
                    # 재시도까지 실패 — 로그만 남기고 원본 유지
                    # (게이트와 동일한 방침: 폴백 유형 전환은 다음 단계로 미룸)
                    print(f"[QUIZ] 문제 {idx+1} 재시도도 실패 — 원본 유지")

            except (json.JSONDecodeError, KeyError) as e:
                print(f"[QUIZ] 문제 {idx+1} 재생성 중 오류: {e} — 원본 유지")

    quiz_data["questions"] = questions

    # JSON 파싱 성공 후 사용 기록 저장
    # 파싱 실패 시 횟수 차감 방지
    # 로그인 유저만 사용 기록 저장
    if email:
        user_result = await db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email}
        )
        user = user_result.fetchone()

        if user:
            user_id = str(user._mapping["id"])
            await record_api_usage(user_id, "quiz", db)
            await db.commit()
    
    return {
        "level": request.level,
        "questions": quiz_data["questions"]
    }


# 온보딩 완료 요청 데이터 형식
class OnboardingCompleteRequest(BaseModel):

    # 사용자 이메일 (임시 식별자 - 나중에 인증 붙이면 교체 예정)
    # email: str

    # 사용자 처음 선택 수준
    declared_level: str

    # 퀴즈 답안 리스트 - 인덱스 기반 (0~3)
    # 예: [0, 1, 2, 3, 0] -> 5문항 답안
    answers: list[int]

    # 정답 리스트 - 체점용
    correct_answers: list[int]


# 온보딩 완료 엔드포인트
# POST /api/onboarding/complete
@router.post("/complete")
async def complete_onboarding(
    request: OnboardingCompleteRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    
    email = current_user["email"]

    # 이메일 검증 - 빈 이메일이면 저장 안함
    if not email or email.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="이메일이 필요합니다. 로그인 후 다시 시도해주세요."
        )

    # 점수 계산
    # zip(): 두 리스트를 쌍으로 묶어서 순회
    # 예: zip([0,1,2], [0,2,2]) -> (0,0), (1,2), (2,2)
    score = sum(
        1 for user_ans, correct_ans
        in zip(request.answers, request.correct_answers)
        if user_ans == correct_ans
    )


    # 5 문항 기준 점수로 confirmed_level 확정
    # 딕셔너리 +조건으로 O(1) 분기 처리
    total = len(request.correct_answers)
    ratio = score / total   # 정답 비율 (0.0 ~ 1.0)


    # 선택한 수준 기준으로 실제 수준 조정
    # 80% 이상 -> 선택 수준 유지 또는 한 단계 상향
    # 40% 미만 -> 한 단계 하양
    level_order = ["beginner", "intermediate", "advanced"]
    declared_idx = level_order.index(request.declared_level)

    if ratio >= 0.8:
        # 80% 이상 맞추면 한 단계 올려줌 (advanced면 유지)
        confirmed_idx = min(declared_idx + 1, 2)
    
    elif ratio >= 0.4:
        # 40 ~ 80%면 선택한 수준 그대로
        confirmed_idx = declared_idx
    
    else:
        # 40% 미만이면 한 단계 내려감 (beginne면 유지)
        confirmed_idx = max(declared_idx - 1, 0)
    
    confirmed_level = level_order[confirmed_idx]


    # DB에 사용자 저장 (없으면 생성, 있으면 업데이트)
    # 순수 SQL로 처리 (ORM 모델 추가 예정)
    from sqlalchemy import text
    await db.execute(
        text("""
            INSERT INTO users (email, declared_level, confirmed_level, onboarding_score)
            VALUES (:email, :declared_level, :confirmed_level, :score)
            ON CONFLICT (email)
            DO UPDATE SET
                declared_level = :declared_level,
                confirmed_level = :confirmed_level,
                onboarding_score = :score
        """),
        {
            "email": email,
            "declared_level": request.declared_level,
            "confirmed_level": confirmed_level,
            "score": score
        }
    )

    await db.commit()

    # ============================================================
    # 신규: 로드맵을 실제 문제 데이터 기반으로 동적 생성
    # ============================================================
    # 기존엔 아래처럼 손으로 적은 하드코딩 딕셔너리였음:
    #   roadmap = {
    #       "beginner": ["변수와 자료형", "조건문 (if/elif/else)", ...],
    #       "intermediate": [...],
    #       "advanced": [...],
    #   }
    # 문제는 이 문구들이 실제 DB의 concept_tag 값과 하나도 일치하지
    # 않아서, 로드맵이 "보여주기만 하고 아무 동작도 못 하는" 죽은
    # 텍스트였음.
    #
    # 해결: foundation 트랙(핵심 커리큘럼)에서 confirmed_level에 맞는
    # 문제들을 order_idx 순서(=커리큘럼 진행 순서)대로 가져온 뒤,
    # concept_tag별로 "이 레벨에서 처음 등장하는 문제" 하나씩만 남겨서
    # 로드맵으로 사용함. 각 항목에 problem_id를 같이 내려줘서,
    # 프론트에서 클릭하면 바로 그 문제로 이동할 수 있게 함.
    roadmap_result = await db.execute(
        text("""
            SELECT id, concept_tag, order_idx
            FROM problems
            WHERE track = 'foundation'
            AND level = :level
            AND owner_user_id IS NULL
            ORDER BY order_idx ASC
        """),
        {"level": confirmed_level}
    )

    # concept_tag가 같은 문제가 여러 개 있을 수 있어서(예: "문자열, 슬라이싱"이
    # beginner에도, intermediate에도 있음) 이미 등장한 개념은 건너뛰고
    # "이 레벨에서 처음 나오는 문제"만 로드맵에 남김
    # set()을 쓰는 이유: "이미 봤는지" 확인이 O(1)이라 리스트보다 빠름
    seen_concepts = set()
    roadmap = []
    for row in roadmap_result.fetchall():
        row_data = dict(row._mapping)
        tag = row_data["concept_tag"]
        if tag in seen_concepts:
            continue
        seen_concepts.add(tag)
        roadmap.append({
            "concept_tag": tag,
            "problem_id": str(row_data["id"]),
        })

    return {
        "email": email,
        "declared_level": request.declared_level,
        "confirmed_level": confirmed_level,
        "score": score,
        "total": total,
        "ratio": round(ratio * 100, 1),     # 퍼센트로 변환
        # 수정: 문자열 리스트 → {concept_tag, problem_id} 객체 리스트
        # (프론트에서 problem_id로 바로 라우팅 가능하도록)
        "roadmap": roadmap
    }


# GET /api/onboarding/user-level
# 로그인한 유저의 수준 문제 목록 조회
# ============================================================
# 참고: 이 엔드포인트는 아직 email 쿼리 파라미터를 그대로 신뢰함
# (조회 전용이라 위조해도 "남의 레벨 정보를 볼 수 있는" 수준의
#  프라이버시 문제이지, submit/complete처럼 데이터를 조작할 순 없음.
#  오늘은 쓰기 작업(제출/생성/완료) 위조 방지를 우선순위로 처리했고,
#  이 조회 엔드포인트는 다음 정리 대상으로 남겨둠)
@router.get("/user-level")
async def get_user_level(
    # email: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    
    # 쿼리 파라미터 대신 검증된 토큰에서 이메일 추출
    email = current_user["email"]

    # # 이메일 검증
    # if not email:
    #     raise HTTPException(
    #         status_code=400,
    #         detail="이메일이 필요합니다."
    #     )
    
    # DB에서 유저 수준 조회
    from sqlalchemy import text
    result = await db.execute(
        text("""
            SELECT confirmed_level, declared_level, onboarding_score
            FROM users
            WHERE email = :email
        """),
        {"email": email}
    )

    user = result.fetchone()


    # 온보딩 기록이 없으면 null 반환
    if not user:
        return {
            "has_onboarding": False,
            "confirmed_level": None,
            "declared_level": None,
            "onboarding_score": None,
        }
    
    user_data = dict(user._mapping)


    return {
        "has_onboarding": True,
        "confirmed_level": user_data["confirmed_level"],
        "declared_level": user_data["declared_level"],
        "onboarding_score": user_data["onboarding_score"],
    }