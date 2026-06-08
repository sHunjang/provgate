# ============================================================
# sync_problems.py - YAML → DB 동기화 스크립트
# ============================================================
# 역할: problems/ 폴더의 YAML 파일을 읽어서 Supabase DB에 저장
# 실행: python sync_problems.py
#
# 사용 자료구조:
#   - 딕셔너리(dict): YAML 데이터를 키-값 쌍으로 저장 O(1) 조회
#   - 문자열(str): JSON 직렬화된 데이터 저장
#   - Path 객체: OS 독립적 파일 경로 처리
#
# 알고리즘:
#   - 트리 순회: problems/ → track/ → level/ → yaml 파일
#   - Upsert 패턴: INSERT or UPDATE (중복 처리)
# ============================================================

import asyncio  # [표준 라이브러리] 비동기(async/await) 실행 지원
                # 동기: A 끝나야 B 시작 / 비동기: A 기다리는 동안 B 실행
                # DB 쿼리처럼 "기다리는" 작업에 효율적

import yaml     # [외부 라이브러리] YAML 파일 파싱
                # YAML: JSON보다 사람이 읽기 쉬운 데이터 형식
                # pip install pyyaml 필요

import os       # [표준 라이브러리] 운영체제 기능 접근
                # 주로 os.getenv()로 환경변수 읽기에 사용

import json     # [표준 라이브러리] JSON 직렬화/역직렬화
                # Python 딕셔너리 → JSON 문자열 변환 (DB 저장용)
                # json.dumps(): 파이썬 객체 → JSON 문자열
                # json.loads(): JSON 문자열 → 파이썬 객체

from pathlib import Path  # [표준 라이브러리] 파일 경로를 객체로 다루기
                        # 문자열 대신 Path 객체를 쓰는 이유:
                        # Windows: "problems\\beginner\\001.yaml"
                        # Mac/Linux: "problems/beginner/001.yaml"
                        # Path 쓰면 OS 상관없이 동일하게 동작

# SQLAlchemy: Python에서 DB를 다루는 ORM 라이브러리
from sqlalchemy.ext.asyncio import (
    create_async_engine,    # 비동기 DB 엔진 생성 (연결 풀 관리)
    AsyncSession,           # 비동기 DB 세션 타입 힌트용
    async_sessionmaker,     # 비동기 세션 팩토리 생성
)
from sqlalchemy import text     # 순수 SQL 문자열을 실행할 때 사용
                                # text()로 감싸야 SQLAlchemy가 안전하게 처리
                                # SQL Injection 방지 (파라미터 바인딩)

from dotenv import load_dotenv  # .env 파일의 환경변수를 읽어오는 라이브러리
                                # DATABASE_URL 같은 민감한 정보를 코드에 직접 쓰지 않기 위해


# ============================================================
# 초기화 (모듈 레벨에서 1번만 실행)
# ============================================================

# .env 파일 로드
# .env 파일 예시:
#   DATABASE_URL=postgresql+asyncpg://user:password@host/db
load_dotenv()


# DB 연결 URL 가져오기
# os.getenv(): 환경변수 조회, 없으면 None 반환
# str()로 감싸는 이유: create_async_engine은 None 받으면 타입 에러 발생
DATABASE_URL = str(os.getenv("DATABASE_URL"))


# 비동기 DB 엔진 생성
# 엔진 = DB와의 연결을 관리하는 핵심 객체
# echo=False: SQL 쿼리 로그 출력 안 함 (True로 바꾸면 디버깅 가능)
# 연결 풀(Connection Pool): 매 요청마다 새 연결 만들지 않고 재사용 -> 성능 향상
engine = create_async_engine(DATABASE_URL, echo=False)


# 비동기 세션 팩토리 생성
# 세션 = DB와의 실제 대화 창구 (트랜잭션 관리)
# 팩토리 세션: 세션 객체를 찍어내는 "틀"
# expire_on_commit=False: 커밋 후에도 객체 속성 접근 가능
#   (True면 커밋 후 data.title 등 접근 시 에러 발생)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# YAML 파일 루트 경로
# Path(__file__): 현재 파일(sync_problems.py)의 절대 경로
# .parent: 상위 디렉토리 (backend/)
# / "problems": 경로 결합 연산자 (+ 대신 / 사용 -> 가독성)
# 결과: /Users/.../backend/problems
PROBLEMS_DIR = Path(__file__).parent / "problems"


# ============================================================
# 메인 함수: 폴더 순회 + DB 동기화
# ============================================================

async def sync_problems():
    """
    problems/ 폴더를 순회하며 모든 YAML 파일을 DB에 upsert

    알고리즘: 트리 순회 (DFS 방식)
    problems/
    ├── foundation/          ← 1depth: 트랙
    │   ├── beginner/        ← 2depth: 레벨
    │   │   ├── 001.yaml     ← 3depth: 파일
    ├── beginner/            ← 기존 구조 (하위 호환)
    │   ├── 001.yaml

    자료구조:
    - inserted, updated: 카운터 (정수)
    - track_or_level_dir: Path 객체 (파일 경로)
    """

    # async with: 컨텍스트 매니저
    # 블록 끝나면 자동으로 세션 close() 호출 (리소스 누수 방지)
    async with AsyncSessionLocal() as db:

        # 결과 카운터 (정수 자료구조)
        inserted = 0    # 새로 추가된 문제 수
        updated = 0     # 수정된 문제 수

        # PROBLEMS_DIR.iterdir(): 폴더 안의 항목들을 이터레이터로 반환
        # sorted(): 알파벳 순서로 정렬 -> 일관된 실행 순서 보장
        #   (iterdir()는 순서 보장 안 함)
        # 시간복잡도: O(n log n) - sorted() 때문
        for track_or_level_dir in sorted(PROBLEMS_DIR.iterdir()):

            # .is_dir(): 디렉토리인지 확인
            # .DS_Store 같은 숨김 파일 등을 스킵
            if not track_or_level_dir.is_dir():
                continue

            # 신규 트랙 구조 체크
            # in 연산자: 집합(set) 대신 리스트에서 O(n) 탐색
            # 단, 3개밖에 없으므로 성능 무관
            if track_or_level_dir.name in ["foundation", "project", "prompt"]:

                # -- 신규 구조: foundation/beginner/001.yaml --
                track = track_or_level_dir.name
                print(f"\n📁 [{track}] 트랙 처리 중..")

                # 트랙 폴더 안의 레벨 폴더 순회 (beginner, intermediate, advanced)
                for level_dir in sorted(track_or_level_dir.iterdir()):
                    if not level_dir.is_dir():
                        continue

                    print(f"\n  📂 {level_dir.name} 폴더 처리 중...")


                    # 레벨 폴더 안의 .yaml 파일만 필터링
                    # glob("*.yaml"): 와일드카드 패턴 매칭
                    #   * = 임의의 문자열, .yaml = 확장자
                    for yaml_file in sorted(level_dir.glob("*.yaml")):

                        # 튜플 언패킹으로 카운터 업데이트
                        # process_yaml()이 (inserted, updated) 튜플 반환
                        inserted, updated = await process_yaml(
                            db, yaml_file, track, inserted, updated
                        )
            else:
                # -- 기존 구조 호환: beginner/001.yaml --
                # 기존 파일들을 foundation 트랙으로 자동 분류
                track = "foundation"
                level_dir = track_or_level_dir
                print(f"\n📂 {level_dir.name} 폴더 (foundation 트랙으로 처리)")

                for yaml_file in sorted(level_dir.glob("*.yaml")):
                    
                    inserted, updated = await process_yaml(
                        db, yaml_file, track, inserted, updated
                    )

        # 모든 변경사항을 DB에 최종 반영
        # commit() 전까지는 DB에 실제로 저장되지 않음 (트랜잭션)
        # 트랜잭션: 모두 성공 or 모두 실패 (원자성 보장)
        await db.commit()

        print(f"\n🎉 동기화 완료!")
        print(f"   INSERT: {inserted}개")
        print(f"   UPDATE: {updated}개")


# ============================================================
# 헬퍼 함수: 단일 YAML 파일 처리
# ============================================================

async def process_yaml(db, yaml_file, track, inserted, updated):
    """
    단일 YAML 파일을 읽어서 DB에 upsert

    Parameters:
        db: 비동기 DB 세션
        yaml_file: Path 객체 (YAML 파일 경로)
        track: 트랙 이름 (foundation/project/prompt)
        inserted: 현재까지 INSERT 된 수 (누적 카운터)
        updated: 현재까지 UPDATED 된 수 (누적 카운터)

    Return:
        (inserted, updated) 튜플 - 업데이트된 카운터
    
    Algorithm: Upsert 패턴
        - INSERT 시도
        - 중복(title 충돌) 시 -> UPDATE로 전환
        - 두 번의 쿼리 대신 1번으로 처리 (성능 2배)
    
    Data Structure:
        - data: 딕셔너리 (YAML 파싱 결과)
            ex: {"title": "두 수의 합", "level": "beginner", ...}
        - test_cases_json: 문자열 (JSON 직렬화)
        - starter_codes_json: 문자열 (JSON 직렬화)
    """

    print(f"    📄 {yaml_file.name} 읽는 중...")

    # YAML 파일 읽기
    # encoding="utf-8": 한글 처리 필수
    # yaml.safe_load(): 안전한 파싱
    #   (yaml.load()는 악성 코드 실행 가능성이 있어 사용 금지)
    # 결과: Python 딕셔너리 자료구조
    #   ex: {"title": "두 수의 합", "level": "beginner", ...}
    with open(yaml_file, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    

    # -- JSON 직렬화 --
    # 이유: PostgreSQL JSONB 컬럼은 JSON 문자열로 INSERT 해야 함
    # json.dump(): Python 객체 -> JSON 문자열
    # ensure_ascii=False: 한글이 \uC548\uB155 형태로 변환되지 않게 하기 위함

    # test_cases: 리스트 -> JSON 문자열
    # ex: [{"input": "[1,2]", "output": "3"}] → '[{"input": "[1,2]", "output": "3"}]'
    test_cases_json = json.dumps(
        data.get("test_cases", []),     # 없으면 빈 리스트 기본값
        ensure_ascii=False,
    )

    
    # starter_codes: 딕셔너리 -> JSON 문자열
    # 신규 포맷: starter_codes 키가 있으면 그대로 사용
    # 기존 포맷: starter_codes 단일 문자열이면 ("python": ...) 으로 감싸기
    # 이유: 다중 언어 지원을 위해 언어별 딕셔너리로 통일
    if "starter_codes" in data:
        
        # 신규 포맷: {"python": "def solution():", "javascript": "function solutino():"}
        starter_codes_json = json.dumps(
            data["starter_codes"],
            ensure_ascii=False,
        )
    
    else:
        # 기존 포맷 자동 변환: "def solution():" -> {"python": "def solution():"}
        starter_codes_json = json.dumps(
            {"python": data.get("starter_codes", "")},
            ensure_ascii=False,
        )
    

    # questions: 면접/이해확인 질문 목록 -> JSON 문자열
    # ex: [{"question": "시간복잡도는?", "answer": "O(n)", "choices": [...]}]
    # 없으면 None (NULL로 DB에 저장)
    questions_json = json.dumps(
        data.get("question", []),
        ensure_ascii=False,
    ) if data.get("question") else None


    # -- DB Upsert 실행 --
    # Upsert: INSERT + UPDATE 합성어
    # ON CONFLICT (title): title 컬럼에 중복 발생 시
    # DO UPDATE SET: 기존 행을 업데이트
    # EXCLUDED: 충돌되 새 데이터를 가리키는 가상 테이블
    # RETURNING: INSERT/UPDATE 후 결과 행 반환
    # (xmax = 0): PostgreSQL 내부 트랜잭션 ID
    #   xmax = 0 -> INSERT 된 새 행
    #   xmax ≠ 0 → UPDATE된 기존 행
    result = await db.execute(
        text("""
            INSERT INTO problems (
                title, description, level, concept_tag,
                test_cases, starter_code, order_idx, language,
                problem_type, track, ai_code, questions, answer_type
            )
            VALUES (
                :title, :description, :level, :concept_tag,
                CAST(:test_cases AS JSONB), CAST(:starter_code AS JSONB),
                :order_idx, :language,
                :problem_type, :track, :ai_code,
                CAST(:questions AS JSONB), :answer_type
            )
            ON CONFLICT (title)
            DO UPDATE SET
                description = EXCLUDED.description,
                level = EXCLUDED.level,
                concept_tag = EXCLUDED.concept_tag,
                test_cases = EXCLUDED.test_cases,
                starter_code = EXCLUDED.starter_code,
                order_idx = EXCLUDED.order_idx,
                language = EXCLUDED.language,
                problem_type = EXCLUDED.problem_type,
                track = EXCLUDED.track,
                ai_code = EXCLUDED.ai_code,
                questions = EXCLUDED.questions,
                answer_type = EXCLUDED.answer_type
            RETURNING id, (xmax = 0) AS is_inserted
        """),
        {
            # :파라미터명 = 바인딩 변수
            # SQL Injection 방지: 값이 직접 SQL에 삽입되지 않고
            # DB 드라이버가 안전하게 처리
            "title": data["title"],
            "description": data["description"],
            "level": data["level"],
            "concept_tag": data["concept_tag"],
            "test_cases": test_cases_json,
            "starter_code": starter_codes_json,
            "order_idx": data.get("order_idx", 0),  # 없으면 기본값 0
            "language": data.get("language", "python"),  # 없으면 python

            # 신규 필드들 (없으면 기본값)
            "problem_type": data.get("problem_type", "coding"),
            "track": track,  # 폴더 구조에서 결정됨
            "ai_code": data.get("ai_code", None),  # 없으면 NULL
            "questions": questions_json,  # 없으면 NULL
            "answer_type": data.get("answer_type", "multiple_choice"),
        }
    )


    # 실행 결과 행 가져오기
    # fetchone(): 첫 번째 행 반환 (RETURNING 절이 1행 반환하므로)
    row = result.fetchone()


    # 예외 처리: row가 None이면 DB 처리 실패
    if row is None:
        print(f"    ⚠️ 처리 실패: {data['title']}")
        return inserted, updated  # 카운터 변경 없이 반환
    

    # _mapping: SQLAlchemy Row를 딕셔너리처럼 접근
    # is_sorted: RETURNING 절에서 계산된 bool 값
    if row._mapping["is_inserted"]:
        inserted += 1
    else:
        updated += 1
        print(f"    🔄 UPDATE: {data['title']} [{data.get('problem_type', 'coding')}]")


    # 튜플로 반환: Python에서 여러 값 반환하는 관용적 방법
    # 호출부에서 inserted, updated = await process_yaml(...) 로 언패킹
    return inserted, updated


# ============================================================
# 진입점
# ============================================================

# __name__ == "__main__" : 이 파일이 직접 실행될 때만 아래 코드 실행
# import 될 때는 실행 안 됨 (모듈로 재사용 가능)
# asyncio.run(): 비동기 함수를 동기 환경에서 실행하는 진입점
#   내부적으로 이벤트 루프 생성 -> sync_problems() 실행 -> 루프 종료
if __name__ == "__main__":
    asyncio.run(sync_problems())
