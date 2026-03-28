# 면접 대비 Q&A

## Q. FastAPI를 선택한 이유가 뭔가요?
Python 기반이라 Claude API 같은 AI 서비스와 연동이 자연스럽고,
async/await를 기본 지원해서 외부 API 비동기 호출에 적합합니다.
또한 Pydantic 기반 자동 문서화(/docs)로 API 명세 관리가 편합니다.

## Q. 프로젝트 폴더 구조를 왜 이렇게 나눴나요?
관심사 분리(Separation of Concerns) 원칙을 적용했습니다.
DB 연결(core/), 비즈니스 로직(api/routes/), 데이터 모델(models/),
요청/응답 형식(schemas/)을 각각 다른 레이어로 분리해서
코드 변경 시 영향 범위를 최소화했습니다.

## Q. 싱글톤 패턴을 어디에 적용했나요?
config.py에서 Settings 인스턴스를 모듈 레벨에서 한 번만 생성했습니다.
여러 파일에서 import해도 항상 같은 인스턴스를 공유하기 때문에
환경변수를 매번 새로 읽지 않아도 됩니다.

## Q. 의존성 주입 패턴이 뭔가요?
database.py의 get_db() 함수가 대표적인 예입니다.
FastAPI의 Depends()에 등록하면 요청마다 자동으로 DB 세션을
열고 닫아줍니다. 엔드포인트 코드가 세션 관리를 직접 하지 않아도
되니 코드가 깔끔해지고 테스트하기도 쉬워집니다.

## Q. CORS가 뭔가요? 왜 설정했나요?
브라우저 보안 정책(Same-Origin Policy)으로 인해
다른 도메인 간 요청이 기본적으로 차단됩니다.
프론트엔드(localhost:3000)에서 백엔드(localhost:8000)로
요청할 때 이 문제가 생겨서 CORSMiddleware로 허용 도메인을
명시적으로 설정했습니다.

## Q. Supabase 연결 방식을 어떻게 선택했나요?
Direct Connection과 Session pooler 두 가지 방식이 있는데,
로컬 개발 환경이 IPv4라 IPv6 전용인 Direct connection 사용이 불가했습니다.
Session Pooler(포트 6543)로 변경해서 해결했고, 추가로 Session pooler는 
연결 수를 효율적으로 관리해줘서 무료 플랜에서도 안정적으로 운영할 수 있습니다.

## Q. Next.js App Router를 선택한 이유가 뭔가요?
Next.js 13부터 도입된 App Router는 Pages Router 대비
서버 컴포넌트(RSC)를 기본으로 지원해서 클라이언트 번들 크기를 줄일 수 있습니다.
또, 레이아웃 중첩, 스트리밍 SSR 등 최신 기능을 활용할 수 있어서 선택했습니다.

## Q. 환경변수를 어떻게 관리했나요?
백엔드의 경우 pydantic-settings의 BaseSettings로 중앙화했고,
프론트엔드는 Next.js의 .env.local을 사용했습니다.
NEXT_PUBLIC_ 접두사가 붙은 변수만 브라우저에 노출되고 나머지는
서버에서만 접근 가능해서 API 키 같은 민감정보를 보호할 수 있습니다.
두 파일 모두 .gitingore에 추가해서 Git에 올라가지 않도록 했습니다.

## Q. 온보딩 수준 확정 로직을 어떻게 설계했나요?
사용자가 선택한 수준(declared_level)을 기준으로
퀴즈 정답 비율에 따라 confirmed_level을 조정했습니다.
80% 이상이면 한 단계 상향, 40~80%면 유지, 40% 미만이면 한 단계 하향합니다.
level_order 리스트와 인덱스를 활용해서 수준 간 이동을 처리했고,
min/max로 경계값(beginner 이하, advanced 이상)을 방지했습니다.

## Q. DB upsert를 어떻게 처리했나요?
PostgreSQL의 ON CONFLICT DO UPDATE 구문을 사용했습니다.
같은 이메일로 온보딩을 다시 하면 INSERT 대신 UPDATE가 실행됩니다.
이렇게 하면 중복 데이터 없이 항상 최신 온보딩 결과를 유지할 수 있습니다.

## Q. Claude API 응답을 어떻게 파싱했나요?
Claude가 JSON 앞뒤에 ```json 코드 블록을 붙이는 경우가 있어서
startswith/endswith로 마커를 감지하고 슬라이싱으로 제거하는
전처리 로직을 추가했습니다. 이후 json.loads()로 파싱했습니다.
한글 응답은 토큰 소비가 영어보다 2~3배 많아서
max_tokens를 넉넉하게 2000으로 설정했습니다.