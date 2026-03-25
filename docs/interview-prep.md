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