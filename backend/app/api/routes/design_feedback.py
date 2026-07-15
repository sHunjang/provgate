# 설계 피드백 생성 라우터
# "설계·사고력 훈련" 문제(problem_type="design_implementation") 전용
#
# 핵심 철학: AI가 정답을 알려주지 않고, 빠진 부분을 "질문"으로 짚어준다
#           (hint.py의 소크라테스식 방식과 같은 철학을 설계 검증에 적용)
#
# 검증의 3단계 (이 라우터가 담당하는 부분):
#   ① 작동 검증     - 코드가 실행되는가  → 프론트(Pyodide)에서 이미 끝남
#   ② 설계-코드 일치 - my_conditions(글)와 code가 서로 맞는가 → 여기서 AI가 비교
#   ③ 좋은 설계인가  - reference_points(체크리스트)와 비교해 빠진 게 있는가 → 여기서 AI가 질문으로 짚음
#
# 주의: reference_points는 학습자에게 절대 노출하면 안 되는 "채점 기준표"
#      이 라우터 내부에서만 조회해서 Claude에게 전달하고, 응답에는 포함하지 않음

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import check_rate_limit, record_api_usage
from app.core.auth import get_current_user

router = APIRouter(prefix="/api/design", tags=["design"])


# Claude API 클라이언트 초기화
# hint.py와 동일한 방식 — 모듈 레벨에서 한 번만 생성해 재사용
# (요청마다 새로 만들면 불필요한 초기화 비용이 매번 발생함)
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 설계 피드백 요청 데이터 형식
# Pydantic BaseModel: 요청 body의 타입을 자동으로 검증해줌
#   (예: code가 문자열이 아니면 FastAPI가 자동으로 422 에러를 반환)
class DesignFeedbackRequest(BaseModel):
    # 문제 ID - DB에서 requirements/thinking_hints/reference_points 조회용
    problem_id: str

    # 학습자가 직접 적은 조건 (글)
    # 예: "1. 이메일 형식 검사  2. 중복 체크  3. 비밀번호 일치 확인"
    my_conditions: str

    # 학습자가 구현한 코드
    code: str

    # 프론트(Pyodide)에서 코드를 실행한 결과
    # JSON 문자열로 전달받음 (예: '{"success": true, "message": "..."}')
    # CS 개념 - 직렬화(Serialization):
    #   파이썬 객체나 JS 객체를 네트워크로 전송하려면 문자열로 "변환"해야 함
    #   프론트에서 JSON.stringify()로 직렬화 → 백엔드에서 다시 파싱해서 사용
    execution_result: str


# POST /api/design/feedback
@router.post("/feedback")
async def generate_design_feedback(
    request: DesignFeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    
    email = current_user["email"]

    # -- 1단계: 이메일로 user_id 조회 --
    # hint.py와 동일한 패턴: Rate Limit은 user_id 기준으로 체크하므로
    # 이메일을 먼저 user_id로 변환해야 함
    user_result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    user = user_result.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user_id = str(user._mapping["id"])


    # -- 2단계: Rate Limit 체크 --
    # rate_limit.py의 RATE_LIMITS["design_feedback"] = 10회 기준으로 체크
    # 초과 시 check_rate_limit이 자동으로 429 에러를 발생시키고 여기서 함수가 멈춤
    await check_rate_limit(user_id, "design_feedback", db)


    # -- 3단계: DB에서 문제 정보 조회 --
    # requirements: 학습자에게 보여줬던 느슨한 요구사항 (참고용)
    # thinking_hints: 학습자에게 보여줬던 생각 질문 (참고용)
    # reference_points: 학습자에게 "절대 안 보여준" 체크리스트 (AI 채점 기준)
    result = await db.execute(
        text("""
            SELECT title, requirements, thinking_hints, reference_points
            FROM problems
            WHERE id = :id
        """),
        {"id": request.problem_id}
    )
    problem = result.fetchone()

    if not problem:
        raise HTTPException(status_code=404, detail="문제를 찾을 수 없습니다.")

    problem_data = dict(problem._mapping)

    # reference_points는 JSONB로 저장되어 있어서 SQLAlchemy가
    # 이미 파이썬 리스트로 자동 변환해서 줌 (별도 json.loads 불필요)
    # 단, 데이터가 없을 경우(NULL)를 대비해 기본값 처리
    reference_points = problem_data.get("reference_points") or []
    thinking_hints = problem_data.get("thinking_hints") or []


    # -- 4단계: execution_result 파싱 --
    # 프론트에서 JSON 문자열로 보낸 걸 다시 파이썬 딕셔너리로 변환
    # CS 개념 - 역직렬화(Deserialization): 직렬화의 반대 과정
    # try/except로 감싸는 이유:
    #   프론트가 잘못된 형식을 보내거나, 학습자 코드 실행이 실패해서
    #   execution_result가 비정상적인 문자열일 수 있음 → 서버가 죽지 않게 방어
    try:
        execution_data = json.loads(request.execution_result)
    except json.JSONDecodeError:
        # 파싱 실패해도 서버를 멈추지 않고, 원본 문자열을 그대로 사용
        # (AI에게는 "실행 결과: {원본}" 형태로 전달되어 분석에 활용됨)
        execution_data = request.execution_result


    # reference_points 리스트를 보기 좋은 텍스트로 변환
    # 예: ["이메일 형식 검증", "중복 체크"] → "- 이메일 형식 검증\n- 중복 체크"
    # join(): 리스트의 각 항목을 구분자로 이어붙여 하나의 문자열로 만듦
    #   리스트를 순회하며 문자열을 +로 이어붙이는 것보다 효율적 (O(n) vs O(n^2))
    reference_points_text = "\n".join(f"- {point}" for point in reference_points)


    # -- 5단계: Claude API 호출 --
    # hint.py와 같은 철학(소크라테스식, 답을 안 줌)이지만
    # 분석 대상이 "코드 한 줄"이 아니라 "설계 전체"라는 점이 다름
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system="""You are a senior developer mentoring a junior through Socratic questioning.
A learner designed their own conditions for a feature (not given pre-defined requirements),
then implemented and ran the code. Your job is to compare their design against a hidden
checklist and point out gaps ONLY through questions — never state the answer directly.
Always respond in Korean. Keep responses concise and structured.
Output plain text only. Never use markdown formatting like **bold** or ## headers.""",
        messages=[
            {
                "role": "user",
                "content": f"""Review this learner's self-designed solution.

[Problem Title]
{problem_data['title']}

[Learner's Own Conditions - what THEY decided to implement, not given to them]
{request.my_conditions}

[Learner's Code]
```python
{request.code}
```

[Execution Result - actual output from running their code]
{execution_data}

[Hidden Checklist - things a good design should consider, NEVER reveal this list directly to the learner]
{reference_points_text}

Compare the learner's conditions + code + execution result against the hidden checklist.
Find what they missed or handled weakly, and turn EACH gap into a Socratic question.
If they covered everything reasonably well, ask one question that pushes their thinking further
(e.g. about edge cases or scalability) instead of just praising them.

Format your response EXACTLY like this (plain text, no markdown):

✅ 잘 짠 부분
(학습자가 잘 처리한 점 1줄로 인정)

🤔 AI의 질문
(체크리스트 중 빠지거나 약한 부분을 1~3개 질문으로 제시. 정답은 절대 말하지 않음)

Rules:
- Never state the missing condition directly (e.g. don't say "비밀번호를 암호화해야 합니다")
  Instead ask a question that leads them there (e.g. "비밀번호가 그대로 저장되면 어떤 문제가 생길까요?")
- Keep response concise and under 200 words in Korean
- No markdown formatting (no **, no ##, no backticks)
- Plain text only"""
            }
        ]
    )

    # Claude 응답에서 텍스트 블록만 추출
    # hint.py와 동일한 패턴: message.content는 여러 블록(텍스트, 도구 호출 등)을
    # 담을 수 있는 리스트라서, 그중 TextBlock 타입만 골라냄
    # next(..., ""): 제너레이터에서 첫 번째 값을 꺼내고, 없으면 빈 문자열 기본값
    feedback_text = next(
        (block.text for block in message.content if isinstance(block, anthropic.types.TextBlock)),
        ""
    )


    # -- 6단계: Rate Limit 사용 기록 --
    # check_rate_limit 통과 + Claude API 호출 성공 후에 기록
    # (API 호출이 실패했는데 횟수를 차감하면 학습자에게 불리하므로,
    #  반드시 성공한 뒤에 기록하는 순서를 지킴 — hint.py와 동일한 원칙)
    # 토큰 사용량 기록
    await record_api_usage(
        user_id, "design_feedback", db,
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
    )


    # -- 7단계: submissions 테이블에 제출 기록 저장 --
    # my_conditions(학습자가 적은 조건)와 execution_result(실행 결과)를 함께 저장
    # ON CONFLICT (user_id, problem_id): 같은 문제를 다시 제출하면 덮어쓰기 (UPSERT)
    #   이미 gate.py에서 썼던 것과 같은 UPSERT 패턴
    await db.execute(
        text("""
            INSERT INTO submissions (
                user_id, problem_id, code, my_conditions, execution_result
            )
            VALUES (
                :user_id, :problem_id, :code, :my_conditions, CAST(:execution_result AS JSONB)
            )
            ON CONFLICT (user_id, problem_id)
            DO UPDATE SET
                code = EXCLUDED.code,
                my_conditions = EXCLUDED.my_conditions,
                execution_result = EXCLUDED.execution_result
        """),
        {
            "user_id": user_id,
            "problem_id": request.problem_id,
            "code": request.code,
            "my_conditions": request.my_conditions,
            "execution_result": request.execution_result,
        }
    )

    await db.commit()

    # -- 8단계: 응답 반환 --
    # reference_points는 절대 포함하지 않음 (학습자에게 노출되면 안 되는 채점 기준표)
    return {
        "feedback": feedback_text,
        "thinking_hints": thinking_hints,  # 참고용으로 다시 보여줘도 무방 (원래 공개 정보)
    }