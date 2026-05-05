# YAML 파일을 읽어서 DB에 동기화하는 스크립트
# 실행 방법: python sync_problems.py
#
# 동작 방식:
#   1. problems/ 폴더 안의 YAML 파일을 순회
#   2. YAML 파일 내용을 읽어서 DB에 upsert
#      - title이 DB에 없으면 INSERT (새 문제 추가)
#      - title이 DB에 있으면 UPDATE (기존 문제 수정)
#   3. 결과 출력 (INSERT/UPDATE 카운터)
#
# 폴더 구조:
#   problems/
#   ├── beginner/
#   │   ├── 001_two_sum.yaml
#   │   └── ...
#   ├── intermediate/
#   └── advanced/

import asyncio  # 비동기 실행을 위한 표준 라이브러리
import yaml     # YAML 파일 파싱 라이브러리 (pip install pyyaml)
import os       # 환경변수 접근
import json     # JSONB 컬럼 저장을 위한 직렬화
from pathlib import Path  # OS에 독립적인 파일 경로 처리 (Windows/Mac/Linux 모두 호환)

# SQLAlchemy 비동기 관련 임포트
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text  # 순수 SQL 쿼리 실행

from dotenv import load_dotenv  # .env 파일에서 환경변수 로드


# 환경변수 로드
# .env 파일에 DATABASE_URL이 정의되어 있어야 함
load_dotenv()


# DB 연결 URL 가져오기
# str()로 감싸는 이유: os.getenv()는 None을 반환할 수 있어서
# create_async_engine은 None을 받으면 타입 에러 발생
DATABASE_URL = str(os.getenv("DATABASE_URL"))


# 비동기 DB 엔진 생성
# echo=False: SQL 쿼리 로그 출력 안 함 (True로 바꾸면 디버깅 가능)
engine = create_async_engine(DATABASE_URL, echo=False)


# 비동기 세션 팩토리 생성
# async_sessionmaker: AsyncEngine 전용 세션 팩토리
# expire_on_commit=False: 커밋 후에도 객체 속성 접근 가능하게 유지
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


# YAML 파일이 있는 루트 폴더 경로
# Path(__file__).parent: 현재 스크립트(sync_problems.py)가 있는 폴더
# / "problems": problems 하위 폴더
PROBLEMS_DIR = Path(__file__).parent / "problems"


async def sync_problems():
    """YAML 파일을 읽어서 DB에 upsert (없으면 INSERT, 있으면 UPDATE)"""

    # 비동기 DB 세션 시작
    # async with: 세션 종료 시 자동으로 close() 호출
    async with AsyncSessionLocal() as db:

        # 동기화 결과 카운터
        inserted = 0  # 새로 추가된 문제 수
        updated = 0   # 수정된 문제 수

        # problems/ 폴더 안의 하위 폴더 순회 (beginner, intermediate, advanced)
        # sorted(): 알파벳 순서로 정렬해서 일관된 순서 보장
        for level_dir in sorted(PROBLEMS_DIR.iterdir()):

            # 파일이면 스킵 (폴더만 처리)
            if not level_dir.is_dir():
                continue

            print(f"\n📂 {level_dir.name} 폴더 처리 중...")

            # 폴더 안의 .yaml 파일만 순회
            # glob("*.yaml"): 확장자가 .yaml인 파일만 필터링
            for yaml_file in sorted(level_dir.glob("*.yaml")):
                print(f"  📄 {yaml_file.name} 읽는 중...")

                # YAML 파일 읽기
                # encoding="utf-8": 한글 문제 설명 처리를 위해
                # yaml.safe_load(): 안전한 YAML 파싱 (악성 코드 실행 방지)
                with open(yaml_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)

                # test_cases를 JSON 문자열로 변환
                # DB의 JSONB 컬럼은 JSON 문자열로 저장해야 함
                # ensure_ascii=False: 한글이 \uXXXX 형태로 변환되지 않게
                test_cases_json = json.dumps(data["test_cases"], ensure_ascii=False)

                # DB에 upsert 실행
                # ON CONFLICT (title): title 컬럼에 UNIQUE 제약조건 기반
                #   - title이 DB에 없으면 → INSERT (새 문제)
                #   - title이 DB에 있으면 → UPDATE (기존 문제 수정)
                # RETURNING id, (xmax = 0) AS is_inserted:
                #   - xmax = 0: INSERT된 행 (새로 삽입)
                #   - xmax != 0: UPDATE된 행 (기존 행 수정)
                result = await db.execute(
                    text("""
                        INSERT INTO problems (
                            title, description, level, concept_tag,
                            test_cases, starter_code, order_idx
                        )
                        VALUES (
                            :title, :description, :level, :concept_tag,
                            :test_cases, :starter_code, :order_idx
                        )
                        ON CONFLICT (title)
                        DO UPDATE SET
                            description = EXCLUDED.description,
                            level = EXCLUDED.level,
                            concept_tag = EXCLUDED.concept_tag,
                            test_cases = EXCLUDED.test_cases,
                            starter_code = EXCLUDED.starter_code,
                            order_idx = EXCLUDED.order_idx
                        RETURNING id, (xmax = 0) AS is_inserted
                    """),
                    {
                        "title": data["title"],
                        "description": data["description"],
                        "level": data["level"],
                        "concept_tag": data["concept_tag"],
                        "test_cases": test_cases_json,
                        "starter_code": data["starter_code"],
                        "order_idx": data["order_idx"],
                    }
                )

                row = result.fetchone()

                # row가 None이면 처리 실패 (예외 상황)
                if row is None:
                    print(f"    ⚠️ 처리 실패: {data['title']}")
                    continue

                # INSERT/UPDATE 카운터 업데이트
                if row._mapping["is_inserted"]:
                    inserted += 1
                    print(f"    ✅ INSERT: {data['title']}")
                else:
                    updated += 1
                    print(f"    🔄 UPDATE: {data['title']}")

        # 모든 변경사항 DB에 반영
        # commit() 전까지는 DB에 실제로 저장되지 않음
        await db.commit()

        print(f"\n🎉 동기화 완료!")
        print(f"   INSERT: {inserted}개")
        print(f"   UPDATE: {updated}개")


# 스크립트 직접 실행 시 진입점
# asyncio.run(): 비동기 함수를 동기 환경에서 실행
if __name__ == "__main__":
    asyncio.run(sync_problems())