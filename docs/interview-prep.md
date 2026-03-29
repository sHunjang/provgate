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

## Q. Next.js App Router와 Pages Router의 차이가 뭔가요?
Pages Router는 next/router를 사용하고 pages/ 폴더 기반이지만,
App Router는 next/navigation을 사용하고 app/ 폴더 기반입니다.
App Router는 서버 컴포넌트를 기본으로 지원하고,
"use client" 선언으로 클라이언트 컴포넌트를 명시적으로 구분합니다.
이 프로젝트는 최신 방식인 App Router를 채택했습니다.

## Q. 서버 컴포넌트와 클라이언트 컴포넌트의 차이가 뭔가요?
서버 컴포넌트는 Next.js 14의 기본값으로 서버에서 렌더링됩니다.
DB 접근, API 호출에 유리하지만 useState, useRouter 같은
React Hook을 사용할 수 없습니다.
클라이언트 컴포넌트는 파일 상단에 "use client"를 선언하면 되고,
브라우저에서 실행되어 React Hook 사용이 가능합니다.
이 프로젝트에서는 퀴즈, 결과 페이지처럼 상태 관리가 필요한
컴포넌트에 "use client"를 적용했습니다.

## Q. useEffect를 어떻게 활용했나요?
퀴즈 페이지와 결과 페이지에서 컴포넌트 마운트 시
Claude API를 호출하는 용도로 사용했습니다.
두 번째 인자로 의존성 배열을 전달해서
level이 바뀔 때만 재실행되도록 제어했습니다.
개발 환경에서 React Strict Mode로 인해 2번 실행되는 현상을
경험했고, 이는 배포 환경에서는 발생하지 않습니다.

## Q. TypeScript를 사용하면서 어떤 이점이 있었나요?
Question, OnboardingResult 같은 타입을 명시적으로 정의해서
API 응답 데이터 구조를 코드에서 바로 확인할 수 있었습니다.
또한 result가 null일 수 있다는 경고처럼 런타임 에러를
컴파일 타임에 미리 발견할 수 있어서 안정성이 높아졌습니다.

## Q. 왜 Python 코드를 서버가 아닌 브라우저에서 실행했나요?
Pyodide(WebAssembly 기반 Python 런타임)를 사용해서
브라우저에서 직접 Python을 실행했습니다.
서버에서 실행하면 악성 코드 실행 위험과 서버 부하 문제가 있지만,
브라우저에서 실행하면 샌드박스 환경이라 보안이 보장되고
서버 비용도 발생하지 않습니다.

## Q. 테스트 케이스 채점을 어떻게 구현했나요?
Python의 sys.stdout을 StringIO로 교체해서 print() 출력을 캡처했습니다.
input() 함수를 mock 함수로 교체해서 테스트 입력값을 자동으로 주입했습니다.
실행 결과를 Pyodide globals에서 꺼내서 예상 출력값과 비교했습니다.

## Q. useRef를 왜 사용했나요?
Pyodide 인스턴스를 useState 대신 useRef로 관리했습니다.
useState는 값이 바뀌면 컴포넌트가 리렌더링되지만,
useRef는 값이 바뀌어도 리렌더링이 발생하지 않습니다.
Pyodide 인스턴스는 한 번 로드하면 변경할 필요가 없고,
리렌더링을 유발할 필요도 없어서 useRef가 적합했습니다.