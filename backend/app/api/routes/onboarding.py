# FastAPI의 라우터 기능 - main.py의 app에 붙일 미니 앱 같은 개념
# 기능별로 라우터를 분리하면 main.py가 복잡해지지 않음
# APIRouter: 라우터 생성
# HTTPException: HTTP 에러 반환 (400, 500 등)
# Depends: 의존성 주입 - get_db()를 자동으로 실행해서 세션을 주입해줌
from fastapi import APIRouter, HTTPException, Depends

# AsyncSession: 비동기 DB 세션 타입
# 함수 파라미터에 타입 힌트로 사용 (db: AsyncSession)
from sqlalchemy.ext.asyncio import AsyncSession

# Pydantic: 요청/응답 데이터의 타입과 형식을 검증해주는 라이브러리
# BaseModel을 상속하면 자동으로 타입 체크 + 에러 메세지 생성
from pydantic import BaseModel

# anthropic: Claude API 공식 Python 라이브러리
import anthropic

# JSON 파싱
import json

# 환경변수에서 API 키 가져오기
from app.core.config import settings

# get_db(): DB 세션을 생성하고 반환하는 제너레이터 함수
# Depends(get_db)로 등록하면 요청마다 자동으로 세션을 열고 닫아줌
from app.core.database import get_db


# 이 라우터의 모든 엔드포인트는 /api/onboarding 으로 시작함.
router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

# Claude API 클라이언트 초기화 (싱글톤 패턴)
# 매 요청마다 새로 만들지 않고 모듈 레벨에서 한 번만 생성
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 퀴즈 생성 요청 데이터 형식 정의
class QuizGenerateRequest(BaseModel):
    # 사용자가 선택한 수준: "beginner", "intermediate", "advanced" 중 하나
    level: str


# 퀴즈 생성 엔드포인트
# POST /api/onboarding/quiz/generate
@router.post("/quiz/generate")
async def generate_quiz(request: QuizGenerateRequest):
    
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

    level_desc = level_description[request.level]

    
    # Claude API 호출
    # 소크라테스 힌트가 아닌 진단 퀴즈용 프롬프트
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
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
    response_text = message.content[0].text

    # # 디버깅용 - 실제 응답 확인
    # print("=== Claude 응답 ===")
    # print(repr(response_text))
    # print("==================")

    # Claude가 ```json ... ``` 형식으로 응답할 때 코드 블록 제거
    # strip(): 앞뒤 공백/줄바꿈 제거
    # replace(): ```json```과 ```제거
    
    # print("=== Claude 응답 ===")
    # print(repr(response_text[:100]))    # 앞 100 글자만 확인
    # print("=== 전처리 후 ===")
    response_text = response_text.strip()

    # if response_text.startswith("```json"):
    #     response_text = response_text[7:]   # ```json 제거 (7글자)
    # if response_text.startswith("```"):
    #     response_text = response_text[3:]   # ``` 제거 (3글자)
    # if response_text.endswith("```"):
    #     response_text = response_text[:-3]  # 끝의 ``` 제거

    # 여러 형태의 코드 블록 마커 제거
    # re.sub으로 더 강력하게 처리 - 줄바꿈 포함 다양한 형태 대응
    import re
    response_text = re.sub(r'```json\s*', '', response_text)
    response_text = re.sub(r'```\s*', '', response_text)

    response_text = response_text.strip()

    # print(repr(response_text))    # 전처리 후
    # print("==================")

    try:
        quiz_data = json.loads(response_text)
    except json.JSONDecodeError as e:
        # 에러 상세 로깅
        print(f"JSON 파싱 에러: {e}")
        print(f"응답 텍스트: {repr(response_text[:200])}")
        raise HTTPException(
            status_code=500,
            detail=f"퀴즈 생성 중 오류가 발생했습니다. 다시 시도해주세요."
        )
    
    
    return {
        "level": request.level,
        "questions": quiz_data["questions"]
    }


# 온보딩 완료 요청 데이터 형식
class OnboardingCompleteRequest(BaseModel):

    # 사용자 이메일 (임시 식별자 - 나중에 인증 붙이면 교체 예정)
    email: str

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
    db: AsyncSession = Depends(get_db)
):
    
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
            "email": request.email,
            "declared_level": request.declared_level,
            "confirmed_level": confirmed_level,
            "score": score
        }
    )

    await db.commit()

    
    # 수준별 학습 로드맵 반환
    # 딕셔너리로 O(1) 조회
    roadmap = {
        "beginner": [
            "변수와 자료형",
            "조건문 (if/elif/else)",
            "반복문 (for/while)",
            "함수 기초",
            "리스트와 딕셔너리"
        ],

        "intermediate": [
            "함수 심화 (람다, 클로저)",
            "클래스와 객체지향",
            "파일 입출력",
            "예외 처리",
            "모듈과 패키지"
        ],

        "advanced": [
            "알고리즘과 자료구조",
            "재귀함수",
            "데코레이터",
            "비동기 프로그래밍",
            "디자인 패턴"
        ]
    }

    return {
        "email": request.email,
        "declared_level": request.declared_level,
        "confirmed_level": confirmed_level,
        "score": score,
        "total": total,
        "ratio": round(ratio * 100, 1),     # 퍼센트로 변환
        "roadmap": roadmap[confirmed_level]
    }