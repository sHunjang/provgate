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
        1: "매우 추상적인 힌트. 방향만 제시하고 구체적인 내용은 절대 언급하지 마세요.",
        2: "중간 수준의 힌트. 사용할 개념이나 방법론을 언급할 수 있지만 코드는 절대 보여주지 마세요.",
        3: "구체적인 힌트. 어떤 함수나 문법을 써야 하는지 알려줄 수 있지만 완성된 코드는 절대 보여주지 마세요.",
    }

    # Claude API 호출 - 소크라테스식 힌트 생성
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system="""당신은 친절한 파이썬 코딩 전문가이자 튜터입니다.
학습자가 스스로 문제를 해결할 수 있도록 소크라테스식 질문으로 힌트를 제공합니다.
문제에 대한 정답 코드를 절대 직접 알려주지 마세요.
한국어로 답변하세요.
2~3문장 이내로 간결하게 답변하세요.""",
        messages=[
            {
                "role": "user",
                "content": f"""다음 문제에 대한 힌트를 제공해주세요.
[문제 정보]
제목: {problem_data['title']}
설명: {problem_data['description']}
개념: {problem_data['concept_tag']}

[학습자 현재 코드]
```python
{request.current_code}
```

[힌트 단계]
{request.hint_step}단계: {hint_level_desc[request.hint_step]}

소크라테스식 질문으로 힌트를 제공해주세요.
정답은 절대 알려주지 마세요.
"""
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