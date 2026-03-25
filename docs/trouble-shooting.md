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