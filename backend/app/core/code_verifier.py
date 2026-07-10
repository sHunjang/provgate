# ============================================================
# AI 생성 문제의 "코드 실행 결과" 정답을 검증하는 모듈
# ============================================================
# 배경: Claude가 "이 코드를 실행하면 뭐가 나올까요?" 유형의 문제를
# 만들 때, 가끔 스스로 손으로 계산하는 과정에서 실수를 해서
# 코드/보기/정답이 서로 안 맞는 문제를 만드는 경우가 있었음.
#
# 해결: AI가 "정답이라고 주장하는 것"을 그대로 믿지 않고,
# 문제 안에 포함된 코드를 실제 실행해서 나온
# 진짜 출력값과 비교함. 이 비교는 문자열 == 비교라서 애매함이 없음 — 창의성이나 스타일 판단이 필요한 게 아니라 "같다/다르다"만 확인하는 기계적인 작업.
#
# 보안 주의: AI가 만든 코드라도 서버에서 exec()하는 건 원칙적으로
# 위험할 수 있음(프롬프트 인젝션 등으로 악성 코드가 섞일 가능성을
# 완전히 배제할 수 없음). 그래서 아래 3중 방어를 둠:
#   1) 위험한 키워드가 코드에 있으면 아예 실행하지 않고 거부
#   2) 별도 프로세스(subprocess)로 격리 — 이 프로세스가 죽어도
#      서버 본체는 영향 없음
#   3) 실행 시간 제한(timeout) + 메모리 제한 — 무한루프나
#      메모리 폭탄 방지

import re
import subprocess
import sys
import os
from typing import Optional

import ast


# ============================================================
# 1단계: 위험한 코드 패턴 차단
# ============================================================
# 완벽한 방어는 아니지만(우회 가능성은 항상 존재), "명백히 위험한
# 시도"는 여기서 1차로 걸러냄. 파일/네트워크/시스템 접근을 시도하는
# 코드는 애초에 실행 자체를 안 함
BLOCKED_PATTERNS = [
    "import os", "import sys", "import subprocess", "import socket",
    "import shutil", "import requests", "import urllib",
    "open(", "__import__", "eval(", "exec(", "compile(",
    "input(", "os.system", "os.popen",
]


def _contains_blocked_pattern(code: str) -> Optional[str]:
    """코드에 차단 패턴이 있으면 그 패턴을, 없으면 None을 반환"""
    for pattern in BLOCKED_PATTERNS:
        if pattern in code:
            return pattern
    return None


# ============================================================
# 2단계: 별도 프로세스에서 안전하게 실행
# ============================================================
def _limit_resources():
    """
    subprocess가 리눅스/macOS에서 시작되기 직전에 실행되는 함수
    (preexec_fn으로 등록됨).
    resource.setrlimit: 이 프로세스가 쓸 수 있는 자원의 상한선을 강제로 설정
      - RLIMIT_CPU: CPU 사용 시간 2초 초과하면 강제 종료
      - RLIMIT_AS: 메모리 100MB 초과 사용 시 강제 종료
    Windows는 resource 모듈 자체가 없어서 이 함수는 유닉스 계열에서만 씀
    """
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
    resource.setrlimit(resource.RLIMIT_AS, (100 * 1024 * 1024, 100 * 1024 * 1024))


def run_python_safely(code: str, timeout: int = 5) -> tuple[bool, str]:
    """
    코드를 격리된 프로세스에서 실행하고 (성공여부, 출력또는에러메시지)를 반환

    -I: isolated mode — 환경변수, 사용자 site-packages 등을 무시
        (환경에 영향을 주거나 받지 않도록 격리)
    -S: site 모듈 자동 import 생략 — 시작 속도 + 약간의 추가 격리
    capture_output=True: 표준출력/표준에러를 파이썬으로 캡처
    timeout: 이 시간(초) 안에 안 끝나면 TimeoutExpired 예외 발생
    """
    blocked = _contains_blocked_pattern(code)
    if blocked:
        return False, f"허용되지 않는 코드 패턴이 포함되어 있습니다: {blocked}"

    try:
        result = subprocess.run(
            [sys.executable, "-I", "-S", "-c", code],
            capture_output=True,
            text=True,
            timeout=timeout,
            # preexec_fn은 유닉스 전용 (Windows에선 None으로 생략)
            preexec_fn=_limit_resources if os.name != "nt" else None,
        )
        if result.returncode != 0:
            # 코드 자체가 에러를 낸 경우(문법 오류 등) — 이것도
            # "AI가 만든 문제가 잘못됐다"는 신호이므로 실패로 취급
            return False, result.stderr.strip()[:300]
        return True, result.stdout.strip()

    except subprocess.TimeoutExpired:
        return False, "실행 시간 초과 (무한루프 의심)"
    except Exception as e:
        return False, f"실행 중 오류: {e}"


# ============================================================
# 3단계: 문제에서 코드 블록 추출
# ============================================================
def extract_code_block(question_text: str) -> Optional[str]:
    """
    문제 텍스트 안에 ```python ... ``` 또는 ``` ... ``` 형태로
    포함된 코드를 꺼냄. 정규식 re.DOTALL: '.'이 줄바꿈까지 포함해서
    매칭하도록 함 (코드가 여러 줄이므로 필요)
    """
    match = re.search(r"```(?:python)?\s*\n(.*?)```", question_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


# ============================================================
# 4단계: 출력값과 AI의 정답 보기를 비교
# ============================================================
def _normalize(text: str) -> str:
    """
    "A. ['alice', 'bob']" 같은 보기 텍스트와, print()가 실제로
    찍어낸 "['alice', 'bob']"을 비교하려면 형식을 맞춰야 함:
      - 앞의 "A. " 같은 보기 번호 제거
      - 작은따옴표/큰따옴표 차이 무시 (파이썬 print는 보통 작은따옴표로
        출력하지만 AI는 큰따옴표로 적을 수도 있음)
      - 공백 전부 제거 (사람마다 쉼표 뒤 띄어쓰기가 다를 수 있으므로)
    """
    text = re.sub(r"^[A-D]\.\s*", "", text.strip())
    text = text.replace("'", '"')
    text = re.sub(r"\s+", "", text)
    return text

# ============================================================
# 보기 중복 검사
# ============================================================
# 오늘 발견한 버그: AI가 4개 보기를 만들 때 실수로 같은 값을
# 두 번 만드는 경우가 있었음 (예: A와 C가 둘 다 "3 Hi World").
# 이러면 AI가 어느 쪽을 정답으로 골랐든, "실행 결과 == AI가 고른
# 보기" 비교는 우연히 통과해버려서 기존 검증기가 이 결함을 놓쳤음.
# 그래서 "정답이 맞는가"와 별개로 "보기끼리 서로 다른가"를
# 추가로 확인해야 함
def has_duplicate_options(options: list[str]) -> bool:
    """
    정규화된 보기 값 기준으로 중복이 있으면 True 반환.
    set()은 중복된 원소를 자동으로 하나로 합치므로,
    len(원본 리스트) != len(set으로 만든 것) 이면 중복이 있었다는 뜻
    """
    normalized = [_normalize(opt) for opt in options]
    return len(set(normalized)) != len(normalized)


def verify_code_answer(
    question_text: str, options: list[str], answer_index: int, timeout: int = 5
) -> Optional[bool]:
    """
    코드 실행 결과를 묻는 문제인지 확인하고, 맞다면 AI의 정답이
    실제 실행 결과와 일치하는지 + 보기끼리 중복이 없는지 검증함.

    반환값 3가지 의미:
      True  → 코드를 실행해봤고, 정답도 맞고 보기 중복도 없음 (통과)
      False → 정답 불일치 또는 보기 중복 발견 (둘 다 재생성 트리거)
      None  → 코드가 없는 문제라서 검증 대상이 아님 (스킵)
    """
    code = extract_code_block(question_text)
    if not code:
        return None

    # ============================================================
    # 코드 실행 여부와 무관하게 보기 중복은 항상 먼저 체크
    # ============================================================
    # "코드가 있는 문제"라면 보기가 실제 실행 결과(숫자, 리스트 등)라서
    # 중복이 생기기 쉬움. 정답 자체가 맞더라도 보기가 중복되면
    # 4지선다로서 결함이 있는 문제이므로 통과시키면 안 됨
    if has_duplicate_options(options):
        return False

    success, output = run_python_safely(code, timeout)
    if not success:
        return False

    if not (0 <= answer_index < len(options)):
        return False

    claimed_answer = options[answer_index]
    return _normalize(output) == _normalize(claimed_answer)


# ============================================================
# 유사 문제(similar-problem)의 test_cases 형식 검증
# ============================================================
# similar-problem은 게이트/퀴즈와 달리 "정답 코드"가 없어서
# (사용자가 직접 풀어야 하는 새 문제이므로), "이 test_case가
# 실제로 옳은 정답인가"는 검증할 방법이 없음.
# 대신 검증 가능한 건 "형식이 최소한 올바른가"뿐임:
#   - input이 파이썬 리스트 리터럴로 파싱 가능한가
#     (예: "[1000, 2000]"은 OK, "1000, 2000"은 형식 오류)
#   - output이 비어있지 않은가
# 이건 예전에 실제로 겪었던 "starter_codes 포맷 버그"와 같은 계열의
# 문제를 미리 걸러내는 안전장치
def validate_test_cases_format(test_cases: list[dict]) -> bool:
    """
    test_cases 리스트의 각 항목이 최소 형식 요건을 만족하는지 확인.
    하나라도 어긋나면 False (전체 재생성 트리거).
    """
    if not test_cases:
        return False

    for tc in test_cases:
        if "input" not in tc or "output" not in tc:
            return False

        # ast.literal_eval: eval()과 달리 "리터럴"(숫자, 문자열, 리스트,
        # 딕셔너리 등)만 안전하게 파싱함 — 임의 코드 실행이 안 되므로
        # 여기서는 exec/subprocess 격리 없이 그냥 써도 안전함
        try:
            parsed_input = ast.literal_eval(tc["input"])
        except (ValueError, SyntaxError):
            return False

        # input은 함수 인자 목록이어야 하므로 리스트 형태여야 함
        # (프롬프트에서 요구한 "[value1, value2]" 형식과 일치하는지)
        if not isinstance(parsed_input, list):
            return False

        if not str(tc["output"]).strip():
            return False

    return True