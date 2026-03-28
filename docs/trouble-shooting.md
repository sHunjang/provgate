# Trouble Shooting

## 2026-03-25

### 1. Git 기본 브랜치 master → main 변경
- **상황**: GitHub 레포 생성 시 기본 브랜치가 master로 설정됨
- **원인**: GitHub 구버전 기본값
- **해결**: `git branch -m master main` 으로 로컬 변경 후 원격 반영
- **교훈**: 요즘 업계 표준은 main. 레포 생성 시 설정에서 미리 바꿔두기

### 2. Git이 빈 폴더를 추적하지 않는 문제
- **상황**: mkdir로 frontend/, backend/ 생성했지만 GitHub에 안 올라감
- **원인**: Git은 파일이 없는 폴더를 추적하지 않음
- **해결**: .gitkeep 파일을 각 폴더에 추가
- **교훈**: 빈 폴더가 필요할 때 .gitkeep 관례 사용

### 3. app/main.py FastAPI 인스턴스 중복 선언
- **상황**: app = FastAPI()를 두 번 선언
- **원인**: 코드 작성 실수
- **해결**: 인스턴스는 한 번만 선언하고 .add_middleware()로 설정 추가
- **교훈**: 두 번째 선언이 첫 번째를 덮어씀. 인스턴스는 항상 단일 선언

### 4. Supabase DB 연결 실패 (Direct connection → Session pooler)
- **상황**: /health/db 접속 시 500 에러
- **에러1**: `No module named 'psycopg2'`
  - 원인: DATABASE_URL이 `postgresql://` 로 시작해서 psycopg2 드라이버를 찾음
  - 해결: `postgresql+asyncpg://` 로 변경
- **에러2**: `No module named 'greenlet'`
  - 원인: SQLAlchemy async 내부 의존성 누락
  - 해결: `pip install greenlet`
- **에러3**: `socket.gaierror: nodename nor servname provided`
  - 원인: Direct connection은 IPv6 전용 → 로컬 Mac(IPv4) 환경에서 접속 불가
  - 해결: Supabase Connect → Session pooler URL(포트 6543)로 변경

### 5. Claude API JSON 파싱 에러 - 코드 블록 마커
- **상황**: /api/onboarding/quiz/generate 호출 시 500에러
- **원인**: Claude가 JSON 앞뒤에 ```json 코드 블록을 붙여서 응답
  json.loads()는 순수 JSON만 파싱 가능해서 실패
- **해결**: 응답 텍스트에서 ```, 마커를 제거하는 전처리 로직 추가

### 6. Claude API 응답 중간에 잘림
- **상황**: JSON 파싱 에러 지속 발생
- **원인**: max_token=1000으로 설정했을 때 한글 5문항 응답이 중간에 잘림
  한글은 영어보다 토큰 소비가 2-3배 많음
- **해결**: max_token=2000으로 증가