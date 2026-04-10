"use client";

// useState: 코드, 테스트 결과, 로딩 상태 관리
// useEffect: 컴포넌트 마운트 시 문제 데이터 API 호출
import { useState, useEffect } from "react";

// useParams: URL의 동적 파라미터를 읽어오는 Hook
// /problems/1 -> params.id = "1"
import { useParams, useRouter } from "next/navigation";

// 만들어둔 컴포넌트와 훅 임포트
import CodeEditor from "@/app/components/CodeEditor";
import { usePyodide } from "@/app/hooks/usePyodide";

// GateModal 컴포넌트 추가
import GateModal from "@/app/components/GateModal";

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
    starter_code: string;
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

// // 임시 문제 데이터 - 나중에 API로 교체
// const MOCK_PROBLEM: Problem = {
//     id: "1",
//     title: "두 수의 합",
//     description: `두 정수 a, b를 입력받아 합을 출력하는 프로그램을 작성하세요.
//     입력: 두 정수 a, b (공백으로 구분)
//     출력: a + b의 값`,
//     level: "beginner",
//     concept_tag: "입출력, 변수",
//     test_cases: [
//         { input: "1 2", output: "3" },
//         { input: "10 20", output: "30" },
//         { input: "-1 1", output: "0" },
//     ],
//     starter_code: `# 두 수를 입력받아 합을 출력하세요
// a, b = map(int, input().split())

// # 여기에 코드를 작성하세요
// print(a+b)
// `,
// };

export default function ProblemPage() {
    // URL 파라미터에서 문제 id 가져오기
    const params = useParams();
    const router = useRouter();
    const problemId = params.id as string;

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

    // 문제 시작 시간 기록 - 소요 시간 계산용
    const [startTime] = useState<number>(Date.now());

    // Pyodide 훅 - Python 실행 환경
    const { loading: pyodideLoading, error: pyodideError, runCode } = usePyodide();

    // 컴포넌트 마운트 시 문제 데이터 API 호출
    useEffect(() => {
        const fetchProblem = async () => {
            try {
                setLoading(true);
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/problems/detail/${problemId}`);

                if (!res.ok) throw new Error("문제를 불러오지 못했습니다.");

                const data = await res.json();
                setProblem(data);

                // starter_code를 초기 코드로 설정
                setCode(data.starter_code || "");
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchProblem();
    }, [problemId]);

    // 코드 실행 핸들러
    const handleRun = async () => {
        if (!problem) return;

        setRunning(true);
        setTestResult(null);

        const result = await runCode(code, problem.test_cases);

        setTestResult(result);
        setRunning(false);

        // 모든 테스트 통과 시 게이트 모달 자동 실행
        if (result.success) {
            setGateOpen(true);
        }
    };

    // 힌트 보기 핸들러
    const handleHint = async () => {
        if (hintStep >= 3 || !problem) return;

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

                    // 임시 이메일 - 나중에 인증 붙이면 교체
                    email: "test@test.com",
                }),
            });

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

    // // 현재 힌트 내용
    // const getCurrentHint = () => {
    //     if (!problem) return "";

    //     const hints: Record<number, string> = {
    //         1: problem.hint_1,
    //         2: problem.hint_2,
    //         3: problem.hint_3,
    //     };
    //     return hints[hintStep] || "";
    // };

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
                <div className="flex items-center gap-4">
                    {/* 뒤로가기 */}
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

                {/* Pyodide 로딩 상태 */}
                <div className="flex items-center gap-2">
                    {pyodideLoading ? (
                        <span className="text-xs text-yellow-400">⏳ Python 환경 로딩 중...</span>
                    ) : pyodideError ? (
                        <span className="text-xs text-red-400">❌ Python 로드 실패</span>
                    ) : (
                        <span className="text-xs text-green-400">✅ Python 준비 완료</span>
                    )}
                </div>
            </header>

            {/* 메인 레이아웃 - 좌우 분할 */}
            <div className="flex h-[calc(100vh-64px)]">
                {/* 왼쪽: 문제 설명 */}
                <div className="w-1/2 border-r border-gray-700 p-6 overflow-y-auto">
                    {/* 난이도 뱃지 */}
                    <span className="text-xs px-2 py-1 rounded-full bg-green-900 text-green-300">{problem.level}</span>

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
                                        <code className="text-sm text-green-300">{tc.input}</code>
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
                                <p className="text-xs text-yellow-400 mb-1">💡 힌트 {hintStep}</p>
                                <p className="text-sm text-yellow-200">{aiHint}</p>
                            </div>
                        )}

                        {/* 힌트 버튼 */}
                        {hintStep < 3 && (
                            <button
                                onClick={handleHint}
                                disabled={hintLoading}
                                className={`w-full py-2 rounded-lg border border-yellow-700 text-yellow-400 text-sm transition-all ${hintLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-yellow-900/30"}`}
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
                        disabled={pyodideLoading || running}
                        className={`mt-4 py-3 rounded-xl font-semibold transition-all
                ${
                    pyodideLoading || running
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
                    >
                        {running ? "실행 중..." : "▶ 코드 실행"}
                    </button>
                    {/* 게이트 통과 후 제출 버튼 활성화 */}
                    {gateToken && (
                        <button
                            className="mt-2 py-3 rounded-xl font-semibold transition-all bg-green-600 text-white hover:bg-green-700"
                            onClick={async () => {
                                if (!problem) return;

                                // 소요 시간 계산 (초 단위)
                                const timeSpentSec = Math.floor((Date.now() - startTime) / 1000);

                                try {
                                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/submit`, {
                                        method: "POST",
                                        headers: { "Content-type": "application/json" },
                                        body: JSON.stringify({
                                            problem_id: problem.id,
                                            email: "test@test.com",
                                            token: gateToken,
                                            code: code,
                                            time_spent_sec: timeSpentSec,
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
                email="test@test.com"
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
