# 소크라테스식 힌트 생성 라우터
# 소트라테스식: 정답을 직접 알려주지 않고 질문으로 유도하는 방식
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import anthropic
import json

from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/api/hint", tags=["hint"])


# Claude API 클라이언트 초기화
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# 힌트 요청 데이터 형식
class HintRequest(BaseModel):
    # 문제 ID - DB에서 문제 정보 조회용
    problem_id: str

    # 사용자 현재 코드 - 어디서 막혔는지 파악용
    current_code: str

    # 현재 힌트 단계 (1, 2, 3)
    # 단계가 높을수록 더 구체적인 힌트 제공
    hint_step: int

    # 사용자 이메일 - 힌트 사용 횟수 기록용
    email: str


# POST /api/hint
@router.post("")
async def generate_hint(
    request: HintRequest,
    db: AsyncSession = Depends(get_db)
):
    
    # 힌트 단계 검증
    if request.hint_step not in [1, 2, 3]:
        raise HTTPException(
            status_code=400,
            detail="힌트 단계는 1, 2, 3 중 하나여야 합니다."
        )
    
    # DB에서 문제 정보 조회
    result = await db.execute(
        text("SELECT title, description, concept_tag FROM problems WHERE id = :id"),
        {"id": request.problem_id}
    )
    problem = result.fetchone()

    if not problem:
        raise HTTPException(status_code=404, detail="문제를 찾을 수 없습니다.")
    
    problem_data = dict(problem._mapping)


    # 힌트 단계별 구체성 조절
    # 단계가 높을수록 더 직접적인 힌트
    hint_level_desc = {
        1: "Very abstract hint. Only suggest the direction, never mention specific details.",
        2: "Intermediate hint. You may mention the concept or method to use, but never show code.",
        3: "Specific hint. You may tell what function or syntax to use, but never show complete code.",
    }

    # Claude API 호출 - 소크라테스식 힌트 생성
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system="""You are a friendly Python coding tutor.
Help learners solve problems through Socratic questioning.
Never reveal the answer or show complete code directly.
Format responses with emoji headers for readability.
Always respond in Korean. Keep responses concise and structured.""",
        messages=[
            {
                "role": "user",
                "content": f"""Provide a hint for the following problem.
[Problem Information]
Title: {problem_data['title']}
Description: {problem_data['description']}
Concept: {problem_data['concept_tag']}

[Learner's Current Code]
```python
{request.current_code}
```
[Hint Step]
Step {request.hint_step}: {hint_level_desc[request.hint_step]}

Format your response EXACTLY like this:
💡 **핵심 포인트**
(1-2 sentences pointing out what to focus on)

🔍 **확인해보세요**
(1 specific question to guide thinking)

Never reveal the answer directly.
Keep response under 100 words in Korean."""
            }
        ]
    )

    hint_text = message.content[0].text

    # 힌트 사용 횟수 DB 기록
    # submissions 테이블에 hint_count 업데이트
    await db.execute(
        text("""
INSERT INTO submissions (user_id, problem_id, code, hint_count)
SELECT u.id, :problem_id, :code, 1
FROM users u
WHERE u.email = :email
ON CONFLICT (user_id, problem_id)
DO UPDATE SET
    hint_count = submissions.hint_count + 1,
    code = :code
"""),
    {
        "problem_id": request.problem_id,
        "code": request.current_code,
        "email": request.email,
    }
    )

    await db.commit()

    return {
        "hint": hint_text,
        "hint_step": request.hint_step,
    }