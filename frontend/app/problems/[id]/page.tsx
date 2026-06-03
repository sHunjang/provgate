"use client";

// useState: 코드, 테스트 결과, 로딩 상태 관리
// useEffect: 컴포넌트 마운트 시 문제 데이터 API 호출
import { useState, useEffect } from "react";

// useParams: URL의 동적 파라미터를 읽어오는 Hook
// /problems/1 -> params.id = "1"
import { useParams, useRouter } from "next/navigation";

import { createClient } from "@/app/lib/supabase";
import ThemeToggle from "@/app/components/ThemeToggle";

// 만들어둔 컴포넌트와 훅 임포트
import CodeEditor from "@/app/components/CodeEditor";
import { usePyodide } from "@/app/hooks/usePyodide";

// GateModal 컴포넌트 추가
import GateModal from "@/app/components/GateModal";

// useAuth: 현재 로그인한 유저 정보 가져오기
import { useAuth } from "@/app/hooks/useAuth";

// useTimer 훅 추가
import { useTimer } from "@/app/hooks/useTimer";

// useJavaScript 훅 추가
import { useJavaScript } from "@/app/hooks/useJavaScript";

// 테스트 케이스 타입
type TestCase = {
    input: string;
    output: string;
};

// 문제 타입
type Problem = {
    id: string;
    title: string;
    description: string;
    level: string;
    concept_tag: string;
    test_cases: TestCase[];
    // JSONB로 변경됨 -> 언어별 딕셔너리
    starter_code: Record<string, string>;
    hint_1: string;
    hint_2: string;
    hint_3: string;
};

// 테스트 결과 타입
type TestResult = {
    success: boolean;
    message: string;
    results?: {
        passed: boolean;
        output: string;
        expected: string;
        message: string;
    }[];
};

export default function ProblemPage() {
    // URL 파라미터에서 문제 id 가져오기
    const params = useParams();
    const router = useRouter();
    const problemId = params.id as string;

    const { user } = useAuth();

    // 문제 데이터 상세
    const [problem, setProblem] = useState<Problem | null>(null);

    // 현재 에디터 코드 상태
    const [code, setCode] = useState("");

    // 테스트 실행 결과 상태
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // 테스트 실행 중 여부
    const [running, setRunning] = useState(false);

    // 문제 로딩 상태
    const [loading, setLoading] = useState(true);

    // 현재 표시 중인 힌트 단계 (0: 힌트 없음, 1~3: 힌트 단계)
    const [hintStep, setHintStep] = useState(0);

    // 힌트 로딩 상태
    const [hintLoading, setHintLoading] = useState(false);

    // AI 힌트 내용 저장
    const [aiHint, setAiHint] = useState<string | null>(null);

    // 게이트 모달 표시 여부
    const [gateOpen, setGateOpen] = useState(false);

    // 게이트 통과 토큰 -> 최종 제출 시 사용
    const [gateToken, setGateToken] = useState<string | null>(null);

    // 게이트 선택 모달 표시 여부
    const [showGateChoice, setShowGateChoice] = useState(false);

    // 게이트 건너뛰기 여부
    const [skipGate, setSkipGate] = useState(false);

    // 문제 시작 시간 기록 - 소요 시간 계산용
    // const [startTime] = useState<number>(Date.now());

    // 선택된 언어 상태 (기본값 python)
    const [selectedLanguage, setSelectedLanguage] = useState<"python" | "javascript">("python");

    // useTimer 훅을 통해 타이머 실행 -> 문제 풀이 소요 시간 측정
    const { formattedTime, elapsed, isVisible, toggleVisibility } = useTimer();

    // Pyodide 훅 - Python 실행 환경
    const { loading: pyodideLoading, error: pyodideError, runCode } = usePyodide();

    // JavaScript 실행 엔진
    const { runCode: runJsCode } = useJavaScript();

    // 컴포넌트 마운트 시 문제 데이터 API 호출
    useEffect(() => {
        const fetchProblem = async () => {
            try {
                setLoading(true);
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/problems/detail/${problemId}`);

                if (!res.ok) throw new Error("문제를 불러오지 못했습니다.");

                const data = await res.json();
                setProblem(data);

                // starter_code가 JSONB로 변경됨
                // 언어별 starter_code 설정
                // 예: {"python": "def solution...", "javascript": "function solution..."}
                const starterCode = data.starter_code?.[selectedLanguage] || data.starter_code?.["python"] || "";

                // starter_code를 초기 코드로 설정
                setCode(starterCode);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProblem();
        // 컴포넌트 마운트 시 문제 데이터 API 호출
        // selectedLanguage를 의존성에서 제외하는 이유:
        // 언어 변경 시 API 재호출 불필요 (starter_code는 이미 JSONB로 전체 로드됨)
        // 언어 변경은 언어 선택 버튼 onClick에서 직접 처리
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [problemId]);

    // 코드 실행 핸들러
    const handleRun = async () => {
        if (!problem) return;

        // 비로그인 시 코드 실행은 가능하지만
        // 게이트(제출)는 로그인 필요 안내
        setRunning(true);
        setTestResult(null);

        // 선택한 언어에 따라 실행 엔진 분기
        let result;
        if (selectedLanguage === "python") {
            result = await runCode(code, problem.test_cases);
        } else {
            result = await runJsCode(code, problem.test_cases);
        }

        setTestResult(result);
        setRunning(false);

        // 모든 테스트 통과 시 게이트 모달 자동 실행
        if (result.success) {
            if (!user) {
                // 비로그인 시 로그인 안내
                alert("🔐 제출하려면 로그인이 필요해요!");
                router.push("/auth/login");
                return;
            }
            setShowGateChoice(true);
        }
    };

    // 힌트 보기 핸들러
    const handleHint = async () => {
        if (hintStep >= 3 || !problem) return;

        // 비로그인 시 로그인 페이지로
        if (!user) {
            router.push("/auth/login");
            return;
        }

        const nextStep = hintStep + 1;
        setHintLoading(true);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/hint`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    problem_id: problem.id,
                    current_code: code,
                    hint_step: nextStep,
                    email: user?.email || "",
                    language: selectedLanguage, // 추가
                }),
            });

            // 429 에러: Rate Limit 초과
            if (res.status === 429) {
                const data = await res.json();
                alert(`⚠️ ${data.detail.message}\n${data.detail.reset}`);
                return;
            }

            if (!res.ok) throw new Error("힌트 생성 실패");

            const data = await res.json();

            setAiHint(data.hint);
            setHintStep(nextStep);
        } catch (err) {
            console.log(err);
        } finally {
            setHintLoading(false);
        }
    };

    // 입력값 파싱 함수 - 바깥 배열 벗겨서 보여주기
    // [[1, 2]] → [1, 2] / [["hello"]] → "hello" / [[1, 2], [3, 4]] → [1, 2], [3, 4]
    const parseDisplayInput = (input: string): string => {
        try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed) && parsed.length === 1) {
                // 인자가 1개면 바깥 배열 제거
                return JSON.stringify(parsed[0]);
            } else if (Array.isArray(parsed)) {
                // 인자가 여러개면 각각 보여주기
                return parsed.map((p) => JSON.stringify(p)).join(", ");
            }
        } catch {
            return input;
        }
        return input;
    };

    // 로딩 화면
    if (loading) {
        return (
            <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <p className="text-gray-400">문제를 불러오는 중...</p>
            </main>
        );
    }

    // 문제 없음
    if (!problem) {
        return (
            <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-400 mb-4">문제를 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.push("/problems")}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg"
                    >
                        목록으로 돌아가기
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gray-900 text-white">
            {/* 상단 헤더 */}
            <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
                {/* 왼쪽: 뒤로가기 + 문제 제목 */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push("/problems")}
                        className="text-gray-400 hover:text-white transition-all"
                    >
                        ← 목록
                    </button>
                    <div>
                        <span className="text-xs text-indigo-400 font-medium uppercase">{problem.concept_tag}</span>
                        <h1 className="text-lg font-bold mt-1">{problem.title}</h1>
                    </div>
                </div>

                {/* 언어 선택 버튼 */}
                <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
                    <button
                        onClick={() => {
                            setSelectedLanguage("python");
                            setCode(problem?.starter_code?.["python"] || "");
                            setTestResult(null);
                            setAiHint(null);
                            setHintStep(0);
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            selectedLanguage === "python"
                                ? "bg-indigo-600 text-white"
                                : "text-gray-400 hover:text-white"
                        }`}
                    >
                        Python
                    </button>
                    <button
                        onClick={() => {
                            setSelectedLanguage("javascript");
                            setCode(problem?.starter_code?.["javascript"] || "");
                            setTestResult(null);
                            setAiHint(null);
                            setHintStep(0);
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            selectedLanguage === "javascript"
                                ? "bg-yellow-500 text-white"
                                : "text-gray-400 hover:text-white"
                        }`}
                    >
                        JavaScript
                    </button>
                </div>
                {/* Python일 때만 Pyodide 로딩 상태 표시 */}
                {selectedLanguage === "python" &&
                    (pyodideLoading ? (
                        <span className="text-xs text-yellow-400">⏳ Python 환경 로딩 중...</span>
                    ) : pyodideError ? (
                        <span className="text-xs text-red-400">❌ Python 로드 실패</span>
                    ) : (
                        <span className="text-xs text-green-400">✅ Python 준비 완료</span>
                    ))}

                {/* JavaScript일 때 상태 표시 */}
                {selectedLanguage === "javascript" && (
                    <span className="text-xs text-yellow-400">✅ JavaScript 준비 완료</span>
                )}
                {/* 가운데: 타이머 + Pyodide 상태 */}
                <div className="flex items-center gap-4">
                    {/* 타이머 */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleVisibility}
                            className="text-xs text-gray-500 hover:text-gray-300 transition-all"
                        >
                            {isVisible ? "⏱️ 숨기기" : "⏱️ 타이머"}
                        </button>
                        {isVisible && (
                            <span className="text-sm font-mono text-indigo-400 font-bold">{formattedTime}</span>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 유저 정보 + 로그아웃 + 다크모드 */}
                <div className="flex items-center gap-2">
                    {/* 유저 이메일 */}
                    {user && <span className="text-xs text-gray-400 hidden sm:block">{user.email?.split("@")[0]}</span>}
                    {/* 로그아웃 버튼 */}
                    {user && (
                        <button
                            onClick={async () => {
                                const supabase = createClient();
                                await supabase.auth.signOut();
                                router.push("/auth/login");
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full
                                text-xs font-medium transition-all border
                                bg-gray-800 border-gray-600 text-gray-300
                                hover:bg-gray-700"
                        >
                            로그아웃
                        </button>
                    )}
                    {/* 다크모드 토글 */}
                    <ThemeToggle />
                </div>
            </header>

            {/* 메인 레이아웃 - 좌우 분할 */}
            <div className="flex h-[calc(100vh-64px)]">
                {/* 왼쪽: 문제 설명 */}
                <div className="w-1/2 border-r border-gray-700 p-6 overflow-y-auto">
                    {/* 난이도 뱃지 */}
                    <div className="flex items-center gap-2">
                        <span
                            className={`text-xs px-2 py-1 rounded-full font-medium
        ${
            problem.level === "beginner"
                ? "bg-green-900 text-green-300"
                : problem.level === "intermediate"
                  ? "bg-yellow-900 text-yellow-300"
                  : "bg-blue-900 text-blue-300"
        }`}
                        >
                            {problem.level === "beginner"
                                ? "입문자"
                                : problem.level === "intermediate"
                                  ? "초급자"
                                  : "중급자"}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-300">
                            {problem.concept_tag}
                        </span>
                    </div>

                    {/* 문제 설명 */}
                    <div className="mt-4 text-gray-300 whitespace-pre-wrap leading-relaxed">{problem.description}</div>

                    {/* 테스트 케이스 */}
                    <div className="mt-6">
                        <h3 className="text-sm font-bold text-gray-400 mb-3">예제 입출력</h3>
                        {problem.test_cases.map((tc, idx) => (
                            <div
                                key={idx}
                                className="mb-3 bg-gray-800 rounded-lg p-4"
                            >
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <p className="text-xs text-gray-500 mb-1">입력</p>
                                        {/* parseDisplayInput: 바깥 배열 제거해서 자연스럽게 표시 */}
                                        <code className="text-sm text-green-300">{parseDisplayInput(tc.input)}</code>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-gray-500 mb-1">출력</p>
                                        <code className="text-sm text-blue-300">{tc.output}</code>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 힌트 섹션 */}
                    <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-gray-400">AI 힌트</h3>
                            <span className="text-xs text-gray-500">{hintStep}/3 사용</span>
                        </div>

                        {/* AI 힌트 표시 */}
                        {aiHint && (
                            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-3">
                                <p className="text-xs text-yellow-400 mb-2">💡 힌트 {hintStep}</p>
                                {/* 줄바꿈 처리: \n을 기준으로 분리해서 각각 렌더링 */}
                                <div className="text-sm text-yellow-200 space-y-2">
                                    {aiHint
                                        .split("\n")
                                        .map((line, idx) => (line.trim() ? <p key={idx}>{line}</p> : null))}
                                </div>
                            </div>
                        )}

                        {/* 힌트 버튼 */}
                        {hintStep < 3 && (
                            <button
                                onClick={handleHint}
                                disabled={hintLoading}
                                className={`w-full py-2 rounded-lg border border-yellow-700 text-yellow-400 text-sm transition-all ${
                                    hintLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-yellow-900/30"
                                }`}
                            >
                                {hintLoading
                                    ? "힌트 생성 중..."
                                    : hintStep === 0
                                      ? "AI 힌트 받기 💡"
                                      : "다음 힌트 받기 💡"}
                            </button>
                        )}
                    </div>

                    {/* 테스트 결과 */}
                    {testResult && (
                        <div className="mt-6">
                            {/* 결과 요약 */}
                            <div
                                className={`p-3 rounded-lg mb-3 font-bold text-sm ${
                                    testResult.success ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
                                }`}
                            >
                                {testResult.message}
                            </div>

                            {/* 테스트 케이스별 상세 결과 */}
                            {testResult.results?.map((r, idx) => (
                                <div
                                    key={idx}
                                    className={`mb-3 rounded-lg overflow-hidden border ${
                                        r.passed ? "border-green-700" : "border-red-700"
                                    }`}
                                >
                                    {/* 테스트 헤더 */}
                                    <div
                                        className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${
                                            r.passed ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
                                        }`}
                                    >
                                        <span>{r.passed ? "✅" : "❌"}</span>
                                        <span>테스트 {idx + 1}</span>
                                    </div>

                                    {/* 입력/출력 표 */}
                                    <div className="bg-gray-800 divide-y divide-gray-700">
                                        <div className="flex text-xs">
                                            <div className="w-24 px-3 py-2 text-gray-500 bg-gray-900 font-medium">
                                                예상 출력
                                            </div>
                                            <div className="flex-1 px-3 py-2 text-blue-300 font-mono">{r.expected}</div>
                                        </div>
                                        {!r.passed && (
                                            <div className="flex text-xs">
                                                <div className="w-24 px-3 py-2 text-gray-500 bg-gray-900 font-medium">
                                                    실제 출력
                                                </div>
                                                <div className="flex-1 px-3 py-2 text-red-300 font-mono">
                                                    {r.output || "출력 없음"}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 오른쪽: 코드 에디터 */}
                <div className="w-1/2 flex flex-col p-6">
                    <CodeEditor
                        value={code}
                        onChange={setCode}
                        height="calc(100vh - 200px)"
                    />

                    {/* 실행 버튼 */}
                    <button
                        onClick={handleRun}
                        disabled={(selectedLanguage === "python" && pyodideLoading) || running}
                        className={`mt-4 py-3 rounded-xl font-semibold transition-all ${
                            (selectedLanguage === "python" && pyodideLoading) || running
                                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                    >
                        {running ? "실행 중..." : "▶ 코드 실행"}
                    </button>

                    {/* 게이트 선택 모달 */}
                    {showGateChoice && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
                                <div className="text-4xl mb-4">🎉</div>
                                <h2 className="text-xl font-bold text-white mb-2">모든 테스트 통과!</h2>
                                <p className="text-gray-400 text-sm mb-6">
                                    이해 확인 게이트를 통과하면 완전히 완료됩니다. 게이트는 같은 개념의 다른 문제로 진짜
                                    이해를 검증해요.
                                </p>
                                <div className="flex flex-col gap-3">
                                    {/* 게이트 진행 */}
                                    <button
                                        onClick={() => {
                                            setShowGateChoice(false);
                                            setGateOpen(true);
                                        }}
                                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
                                    >
                                        🔍 이해 확인하기
                                    </button>
                                    {/* 나중에 하기 */}
                                    <button
                                        onClick={() => {
                                            setShowGateChoice(false);
                                            // 게이트 없이 제출 가능하도록 임시 토큰 설정
                                            setSkipGate(true);
                                        }}
                                        className="w-full py-3 bg-gray-700 text-gray-300 rounded-xl font-semibold hover:bg-gray-600 transition-all"
                                    >
                                        나중에 하기
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 게이트 통과 후 제출 버튼 활성화 */}
                    {(gateToken || skipGate) && (
                        <button
                            className="mt-2 py-3 rounded-xl font-semibold transition-all bg-green-600 text-white hover:bg-green-700"
                            onClick={async () => {
                                if (!problem) return;

                                // 비로그인 시 로그인 페이지로
                                if (!user) {
                                    router.push("/auth/login");
                                    return;
                                }

                                // 소요 시간 계산 (초 단위)
                                // const timeSpentSec = Math.floor((Date.now() - startTime) / 1000);
                                const timeSpentSec = elapsed;

                                try {
                                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/submit`, {
                                        method: "POST",
                                        headers: { "Content-type": "application/json" },
                                        body: JSON.stringify({
                                            problem_id: problem.id,
                                            email: user?.email || "",
                                            token: gateToken ?? null,
                                            code: code,
                                            time_spent_sec: timeSpentSec,
                                            skip_gate: skipGate,
                                        }),
                                    });

                                    if (!res.ok) throw new Error("제출 실패");

                                    const data = await res.json();

                                    // 피드백 페이지로 이동
                                    // 통계를 쿼리 파라미터로 전달
                                    const params = new URLSearchParams({
                                        level: problem.level,
                                        stats: JSON.stringify(data.stats),
                                    });
                                    router.push(`/problems/feedback/${problem.id}?${params.toString()}`);
                                } catch (err) {
                                    console.error(err);
                                    alert("제출 중 오류가 발생했습니다.");
                                }
                            }}
                        >
                            ✅ 최종 제출하기
                        </button>
                    )}
                </div>
            </div>

            {/* 게이트 모달 */}
            <GateModal
                isOpen={gateOpen}
                problemId={problem.id}
                email={user?.email || ""}
                language={selectedLanguage}
                onPass={(token) => {
                    // 토큰 저장
                    setGateToken(token);
                    setGateOpen(false);
                }}
                onClose={() => setGateOpen(false)}
            />
        </main>
    );
}
