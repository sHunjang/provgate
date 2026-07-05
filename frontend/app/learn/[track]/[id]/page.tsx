"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { createClient } from "@/app/lib/supabase";
import ThemeToggle from "@/app/components/ThemeToggle";
import CodeEditor from "@/app/components/CodeEditor";
import { usePyodide } from "@/app/hooks/usePyodide";
import GateModal from "@/app/components/GateModal";
import { useAuth } from "@/app/hooks/useAuth";
import { useTimer } from "@/app/hooks/useTimer";
import { useJavaScript } from "@/app/hooks/useJavaScript";
import AIReadingSection from "@/app/components/AIReadingSection";
import AIDebuggingSection from "@/app/components/AIDebuggingSection";
import AIQuestionSection from "@/app/components/AIQuestionSection";
import DesignImplementationSection from "@/app/components/DesignImplementationSection";

// 신규: 공통 레벨 매핑 사용
// 기존엔 이 파일 안에 levelColor 딕셔너리를 직접 정의했었는데,
// 이름/색상을 한 곳(levelMeta.ts)에서 관리하도록 옮김
import { LEVEL_META, type Level } from "@/app/lib/levelMeta";

type TestCase = { input: string; output: string };

type Problem = {
    id: string;
    title: string;
    description: string;
    level: string;
    concept_tag: string;
    test_cases: TestCase[];
    starter_code: Record<string, string>;
    language: string;
    problem_type: "coding" | "ai_reading" | "ai_debugging" | "ai_question" | "design_implementation";
    track: string;
    ai_code: string | null;
    questions: { question: string; choices: string[]; answer: number; explanation: string }[] | null;
    answer_type: "multiple_choice" | "code_edit" | "text";
    requirements?: string | null;
    thinking_hints?: string[] | null;
};

type TestResult = {
    success: boolean;
    message: string;
    results?: { passed: boolean; output: string; expected: string; message: string }[];
};

// 삭제: levelColor 딕셔너리 — 이제 LEVEL_META로 대체됨

// 문제 유형별 배지 — 팔레트 3색을 순환 재사용 (팔레트 외 색을 새로 만들지 않기 위함)
const typeColor: Record<string, { bg: string; fg: string; label: string }> = {
    ai_reading: { bg: "var(--accent3-bg)", fg: "var(--accent3)", label: "🔍 코드 읽기" },
    ai_debugging: { bg: "var(--accent2-bg)", fg: "var(--accent2)", label: "🐛 디버깅" },
    ai_question: { bg: "var(--accent3-bg)", fg: "var(--accent3)", label: "💬 AI 질문" },
    design_implementation: { bg: "var(--bg-3)", fg: "var(--text-2)", label: "✏️ 설계 과제" },
};

export default function ProblemPage() {
    const params = useParams();
    const router = useRouter();
    const problemId = params.id as string;
    const urlTrack = params.track as string;

    const { user } = useAuth();

    const [problem, setProblem] = useState<Problem | null>(null);

    const [code, setCode] = useState("");

    const [testResult, setTestResult] = useState<TestResult | null>(null);

    const [running, setRunning] = useState(false);

    const [loading, setLoading] = useState(true);

    const [hintStep, setHintStep] = useState(0);

    const [hintLoading, setHintLoading] = useState(false);

    const [aiHint, setAiHint] = useState<string | null>(null);

    const [gateOpen, setGateOpen] = useState(false);

    const [gateToken, setGateToken] = useState<string | null>(null);

    const [showGateChoice, setShowGateChoice] = useState(false);

    const [skipGate, setSkipGate] = useState(false);

    const [aiAnswers, setAiAnswers] = useState<number[] | null>(null);

    const [conditionsSubmitted, setConditionsSubmitted] = useState(false);

    // 모바일 헤더 드롭다운 열림/닫힘
    // 이 페이지는 SiteNav를 쓰지 않는 특수 페이지(문제 풀이 전용 자체 헤더)라
    // 홈/learn에서 썼던 것과 같은 패턴을 이 안에서 독립적으로 구현함
    const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

    const [selectedLanguage, setSelectedLanguage] = useState<"python" | "javascript">("python");

    const { formattedTime, elapsed, isVisible, toggleVisibility } = useTimer();

    const { loading: pyodideLoading, error: pyodideError, runCode } = usePyodide();

    const { runCode: runJsCode } = useJavaScript();

    const needsCodeExecution =
        problem?.problem_type === "coding" ||
        problem?.problem_type === "ai_debugging" ||
        problem?.problem_type === "design_implementation";

    useEffect(() => {
        const fetchProblem = async () => {
            try {
                setLoading(true);
                const email = user?.email || "";
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/problems/detail/${problemId}?email=${encodeURIComponent(email)}`,
                );
                if (!res.ok) throw new Error("문제를 불러오지 못했습니다.");
                const data = await res.json();
                setProblem(data);
                const previousCode = data.previous_code;
                const starterCode = data.starter_code?.[selectedLanguage] || data.starter_code?.["python"] || "";
                setCode(previousCode || starterCode);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProblem();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [problemId, user?.email]);

    const handleRun = async () => {
        if (!problem) return;
        setRunning(true);
        setTestResult(null);

        let result;
        if (selectedLanguage === "python") {
            result = await runCode(code, problem.test_cases);
        } else {
            result = await runJsCode(code, problem.test_cases);
        }

        setTestResult(result);
        setRunning(false);

        if (problem.problem_type === "design_implementation") return;

        if (result.success) {
            if (!user) {
                alert("🔐 제출하려면 로그인이 필요해요!");
                router.push("/auth/login");
                return;
            }
            setShowGateChoice(true);
        }
    };

    const handleAIComplete = (answers: number[] = []) => {
        if (!user) {
            alert("🔐 제출하려면 로그인이 필요해요!");
            router.push("/auth/login");
            return;
        }
        setAiAnswers(answers);
        setShowGateChoice(true);
    };

    const handleHint = async () => {
        if (hintStep >= 3 || !problem) return;
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
                    language: selectedLanguage,
                }),
            });
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

    const parseDisplayInput = (input: string): string => {
        try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed) && parsed.length === 1) {
                return JSON.stringify(parsed[0]);
            } else if (Array.isArray(parsed)) {
                return parsed.map((p) => JSON.stringify(p)).join(", ");
            }
        } catch {
            return input;
        }
        return input;
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center">
                <p className="text-[var(--text-2)] text-sm">문제를 불러오는 중...</p>
            </main>
        );
    }

    if (!problem) {
        return (
            <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-[var(--text-2)] text-sm mb-4">문제를 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.push("/learn")}
                        className="px-6 py-2 rounded text-sm"
                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                    >
                        목록으로 돌아가기
                    </button>
                </div>
            </main>
        );
    }

    // 수정: levelColor[problem.level] → LEVEL_META[problem.level as Level]
    const lvl = LEVEL_META[problem.level as Level];
    const typ = typeColor[problem.problem_type];

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            {/* ===== 상단 헤더 ===== */}
            {/* 수정: relative 추가 (모바일 드롭다운의 기준점) */}
            <header className="border-b border-[var(--border-c)] px-6 py-4 flex items-center justify-between bg-[var(--bg-2)] relative">
                {/* 왼쪽: 뒤로가기 + 제목 — 데스크탑/모바일 공통으로 항상 표시 */}
                <div className="flex items-center gap-4 min-w-0">
                    <button
                        onClick={() => router.push("/learn")}
                        className="text-sm text-[var(--text-3)] hover:text-[var(--text)] transition-colors flex-shrink-0"
                    >
                        ← 목록
                    </button>
                    {/* min-w-0 + truncate: 제목이 길 때 줄바꿈 대신 말줄임표로 잘리게 함
                        (모바일 좁은 화면에서 제목이 여러 줄로 밀리는 걸 방지) */}
                    <div className="min-w-0">
                        <span
                            className="text-xs font-medium uppercase"
                            style={{ color: "var(--accent)" }}
                        >
                            {problem.concept_tag}
                        </span>
                        <h1 className="text-lg font-bold mt-1 truncate">{problem.title}</h1>
                    </div>
                </div>

                {/* ============================================================
                    데스크탑 전용: 언어선택 + 환경상태 + 타이머
                    ============================================================ */}
                <div className="hidden md:flex items-center gap-4">
                    {needsCodeExecution && (
                        <div className="flex items-center gap-2 bg-[var(--bg-3)] rounded-lg p-1">
                            <button
                                onClick={() => {
                                    setSelectedLanguage("python");
                                    setCode(problem?.starter_code?.["python"] || "");
                                    setTestResult(null);
                                    setAiHint(null);
                                    setHintStep(0);
                                }}
                                className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                                style={
                                    selectedLanguage === "python"
                                        ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                        : { color: "var(--text-3)" }
                                }
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
                                className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                                style={
                                    selectedLanguage === "javascript"
                                        ? { background: "var(--accent2)", color: "#fff" }
                                        : { color: "var(--text-3)" }
                                }
                            >
                                JavaScript
                            </button>
                        </div>
                    )}

                    {selectedLanguage === "python" &&
                        needsCodeExecution &&
                        (pyodideLoading ? (
                            <span
                                className="text-xs"
                                style={{ color: "var(--accent2)" }}
                            >
                                ⏳ Python 환경 로딩 중...
                            </span>
                        ) : pyodideError ? (
                            <span className="text-xs text-red-500">❌ Python 로드 실패</span>
                        ) : (
                            <span
                                className="text-xs"
                                style={{ color: "var(--accent)" }}
                            >
                                ✅ Python 준비 완료
                            </span>
                        ))}

                    {selectedLanguage === "javascript" && needsCodeExecution && (
                        <span
                            className="text-xs"
                            style={{ color: "var(--accent2)" }}
                        >
                            ✅ JavaScript 준비 완료
                        </span>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleVisibility}
                            className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
                        >
                            {isVisible ? "⏱️ 숨기기" : "⏱️ 타이머"}
                        </button>
                        {isVisible && (
                            <span
                                className="text-sm font-mono font-bold"
                                style={{ color: "var(--accent)" }}
                            >
                                {formattedTime}
                            </span>
                        )}
                    </div>
                </div>

                {/* ============================================================
                    데스크탑 전용: 유저 + 로그아웃 + 테마
                    ============================================================ */}
                <div className="hidden md:flex items-center gap-2">
                    {user && (
                        <span className="text-xs text-[var(--text-3)] hidden sm:block">
                            {user.email?.split("@")[0]}
                        </span>
                    )}
                    {user && (
                        <button
                            onClick={async () => {
                                const supabase = createClient();
                                await supabase.auth.signOut();
                                router.push("/");
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium
                                border border-[var(--border-strong)] bg-[var(--bg-3)] text-[var(--text-2)]
                                hover:bg-[var(--bg)] transition-all"
                        >
                            로그아웃
                        </button>
                    )}
                    <ThemeToggle />
                </div>

                {/* ============================================================
                    신규: 모바일 전용 — 테마 토글 + 햄버거만 표시
                    (SiteNav의 모바일 그룹과 동일한 패턴: 테마는 항상 보이게,
                     나머지는 햄버거 뒤로 숨김)
                    ============================================================ */}
                <div className="md:hidden flex items-center gap-2 flex-shrink-0">
                    <ThemeToggle />
                    <button
                        onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                        className="p-1.5 text-[var(--text-2)]"
                        aria-label="메뉴 열기"
                    >
                        <i
                            className={`ti ${headerMenuOpen ? "ti-x" : "ti-menu-2"}`}
                            style={{ fontSize: "18px" }}
                            aria-hidden="true"
                        />
                    </button>
                </div>

                {/* 모바일 드롭다운 — 언어선택/환경상태/타이머/유저/로그아웃을 전부 여기로 이동 */}
                {headerMenuOpen && (
                    <div className="md:hidden absolute top-full left-0 right-0 bg-[var(--bg-2)] border-b border-[var(--border-c)] flex flex-col p-4 gap-3 z-50">
                        {needsCodeExecution && (
                            <div className="flex items-center gap-2 bg-[var(--bg-3)] rounded-lg p-1 self-start">
                                <button
                                    onClick={() => {
                                        setSelectedLanguage("python");
                                        setCode(problem?.starter_code?.["python"] || "");
                                        setTestResult(null);
                                        setAiHint(null);
                                        setHintStep(0);
                                    }}
                                    className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                                    style={
                                        selectedLanguage === "python"
                                            ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                            : { color: "var(--text-3)" }
                                    }
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
                                    className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                                    style={
                                        selectedLanguage === "javascript"
                                            ? { background: "var(--accent2)", color: "#fff" }
                                            : { color: "var(--text-3)" }
                                    }
                                >
                                    JavaScript
                                </button>
                            </div>
                        )}

                        {selectedLanguage === "python" &&
                            needsCodeExecution &&
                            (pyodideLoading ? (
                                <span
                                    className="text-sm"
                                    style={{ color: "var(--accent2)" }}
                                >
                                    ⏳ Python 환경 로딩 중...
                                </span>
                            ) : pyodideError ? (
                                <span className="text-sm text-red-500">❌ Python 로드 실패</span>
                            ) : (
                                <span
                                    className="text-sm"
                                    style={{ color: "var(--accent)" }}
                                >
                                    ✅ Python 준비 완료
                                </span>
                            ))}

                        {selectedLanguage === "javascript" && needsCodeExecution && (
                            <span
                                className="text-sm"
                                style={{ color: "var(--accent2)" }}
                            >
                                ✅ JavaScript 준비 완료
                            </span>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleVisibility}
                                className="text-sm text-[var(--text-2)]"
                            >
                                {isVisible ? "⏱️ 타이머 숨기기" : "⏱️ 타이머 보기"}
                            </button>
                            {isVisible && (
                                <span
                                    className="text-sm font-mono font-bold"
                                    style={{ color: "var(--accent)" }}
                                >
                                    {formattedTime}
                                </span>
                            )}
                        </div>

                        <div className="border-t border-[var(--border-c)] pt-3">
                            {user ? (
                                <>
                                    <p className="text-sm text-[var(--text-2)] mb-2">{user.email}</p>
                                    <button
                                        onClick={async () => {
                                            const supabase = createClient();
                                            await supabase.auth.signOut();
                                            setHeaderMenuOpen(false);
                                            router.push("/");
                                        }}
                                        className="text-sm"
                                        style={{ color: "var(--accent2)" }}
                                    >
                                        로그아웃
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => {
                                        router.push("/auth/login");
                                        setHeaderMenuOpen(false);
                                    }}
                                    className="text-sm text-[var(--text-2)]"
                                >
                                    로그인
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {/* ===== 메인 레이아웃 - 좌우 분할 ===== */}
            <div className="flex flex-col md:flex-row md:h-[calc(100vh-64px)]">
                {/* ===== 왼쪽: 문제 설명 ===== */}
                <div className="w-full md:w-1/2 border-r border-[var(--border-c)] p-6 overflow-y-auto bg-[var(--bg-3)]">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* lvl.label / lvl.bg / lvl.fg 는 LEVEL_META도 동일한 필드명을
                            갖고 있어서 JSX 자체는 수정 없이 그대로 재사용 가능 */}
                        <span
                            className="text-xs px-2 py-1 rounded-full font-medium"
                            style={{ background: lvl.bg, color: lvl.fg }}
                        >
                            {lvl.label}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-2)] text-[var(--text-2)]">
                            {problem.concept_tag}
                        </span>
                        {problem.problem_type !== "coding" && (
                            <span
                                className="text-xs px-2 py-1 rounded-full font-medium"
                                style={{ background: typ.bg, color: typ.fg }}
                            >
                                {typ.label}
                            </span>
                        )}
                        {problem.problem_type === "design_implementation" && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-2)] text-[var(--text-3)]">
                                🚫 AI 없이 직접
                            </span>
                        )}
                    </div>

                    {problem.problem_type !== "design_implementation" && (
                        <div className="mt-4 text-[var(--text-2)] whitespace-pre-wrap leading-relaxed text-sm">
                            {problem.description}
                        </div>
                    )}

                    {(problem.problem_type === "coding" || problem.problem_type === "ai_debugging") && (
                        <div className="mt-6">
                            <h3 className="text-sm font-bold text-[var(--text-2)] mb-3">예제 입출력</h3>
                            {problem.test_cases.map((tc, idx) => (
                                <div
                                    key={idx}
                                    className="mb-3 bg-[var(--bg-2)] rounded-lg p-4"
                                >
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <p className="text-xs text-[var(--text-3)] mb-1">입력</p>
                                            <code
                                                className="text-sm"
                                                style={{ color: "var(--accent)" }}
                                            >
                                                {parseDisplayInput(tc.input)}
                                            </code>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs text-[var(--text-3)] mb-1">출력</p>
                                            <code
                                                className="text-sm"
                                                style={{ color: "var(--accent3)" }}
                                            >
                                                {tc.output}
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {problem.problem_type === "coding" && (
                        <>
                            <div className="mt-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-[var(--text-2)]">AI 힌트</h3>
                                    <span className="text-xs text-[var(--text-3)]">{hintStep}/3 사용</span>
                                </div>
                                {aiHint && (
                                    <div
                                        className="rounded-lg p-4 mb-3"
                                        style={{ background: "var(--accent2-bg)" }}
                                    >
                                        <p
                                            className="text-xs mb-2"
                                            style={{ color: "var(--accent2)" }}
                                        >
                                            💡 힌트 {hintStep}
                                        </p>
                                        <div
                                            className="text-sm space-y-2"
                                            style={{ color: "var(--text)" }}
                                        >
                                            {aiHint
                                                .split("\n")
                                                .map((line, idx) => (line.trim() ? <p key={idx}>{line}</p> : null))}
                                        </div>
                                    </div>
                                )}
                                {hintStep < 3 && (
                                    <button
                                        onClick={handleHint}
                                        disabled={hintLoading}
                                        className="w-full py-2 rounded-lg border text-sm transition-all"
                                        style={{
                                            borderColor: "var(--accent2)",
                                            color: "var(--accent2)",
                                            opacity: hintLoading ? 0.5 : 1,
                                            cursor: hintLoading ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        {hintLoading
                                            ? "사용자 작성 코드 기반 힌트 생성 중..."
                                            : hintStep === 0
                                              ? "AI 힌트 받기 💡"
                                              : "다음 힌트 받기 💡"}
                                    </button>
                                )}
                            </div>

                            {testResult && (
                                <div className="mt-6">
                                    <div
                                        className="p-3 rounded-lg mb-3 font-bold text-sm"
                                        style={
                                            testResult.success
                                                ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                                : { background: "#fee2e2", color: "#dc2626" }
                                        }
                                    >
                                        {testResult.message}
                                    </div>
                                    {testResult.results?.map((r, idx) => (
                                        <div
                                            key={idx}
                                            className="mb-3 rounded-lg overflow-hidden border"
                                            style={{ borderColor: r.passed ? "var(--accent)" : "#dc2626" }}
                                        >
                                            <div
                                                className="px-4 py-2 text-xs font-bold flex items-center gap-2"
                                                style={
                                                    r.passed
                                                        ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                                        : { background: "#fee2e2", color: "#dc2626" }
                                                }
                                            >
                                                <span>{r.passed ? "✅" : "❌"}</span>
                                                <span>테스트 {idx + 1}</span>
                                            </div>
                                            <div className="bg-[var(--bg-2)] divide-y divide-[var(--border-c)]">
                                                <div className="flex text-xs">
                                                    <div className="w-24 px-3 py-2 text-[var(--text-3)] bg-[var(--bg-3)] font-medium">
                                                        예상 출력
                                                    </div>
                                                    <div
                                                        className="flex-1 px-3 py-2 font-mono"
                                                        style={{ color: "var(--accent3)" }}
                                                    >
                                                        {r.expected}
                                                    </div>
                                                </div>
                                                {!r.passed && (
                                                    <div className="flex text-xs">
                                                        <div className="w-24 px-3 py-2 text-[var(--text-3)] bg-[var(--bg-3)] font-medium">
                                                            실제 출력
                                                        </div>
                                                        <div className="flex-1 px-3 py-2 font-mono text-red-500">
                                                            {r.output || "출력 없음"}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {problem.problem_type === "ai_reading" && (
                        <AIReadingSection
                            problem={problem}
                            onComplete={handleAIComplete}
                        />
                    )}
                    {problem.problem_type === "ai_debugging" && (
                        <AIDebuggingSection
                            problem={problem}
                            aiCode={problem.ai_code || ""}
                        />
                    )}
                    {problem.problem_type === "ai_question" && (
                        <AIQuestionSection
                            problem={problem}
                            onComplete={handleAIComplete}
                        />
                    )}
                    {problem.problem_type === "design_implementation" && (
                        <DesignImplementationSection
                            problem={problem}
                            code={code}
                            executionResult={testResult}
                            email={user?.email || ""}
                            onConditionsSubmit={() => setConditionsSubmitted(true)}
                            onComplete={() => handleAIComplete()}
                        />
                    )}
                </div>

                {/* ===== 오른쪽: 코드 에디터 ===== */}
                <div className="w-full md:w-1/2 flex flex-col p-6 bg-[var(--bg)]">
                    {problem.problem_type === "ai_reading" || problem.problem_type === "ai_question" ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center text-[var(--text-3)]">
                                <div className="text-4xl mb-4">
                                    {problem.problem_type === "ai_reading" ? "🔍" : "💬"}
                                </div>
                                <p className="text-sm">
                                    {problem.problem_type === "ai_reading"
                                        ? "왼쪽 코드를 읽고 답을 선택하세요"
                                        : "왼쪽에서 가장 좋은 프롬프트를 선택하세요"}
                                </p>
                            </div>
                        </div>
                    ) : problem.problem_type === "design_implementation" && !conditionsSubmitted ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center text-[var(--text-3)]">
                                <div className="text-4xl mb-4">✏️</div>
                                <p className="text-sm">왼쪽에서 먼저 당신의 설계를 작성하고 제출해주세요</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <CodeEditor
                                value={code}
                                onChange={setCode}
                                height="60vh"
                            />

                            {problem.problem_type === "coding" && (
                                <button
                                    onClick={handleRun}
                                    disabled={(selectedLanguage === "python" && pyodideLoading) || running}
                                    className="mt-4 py-3 rounded-xl font-semibold transition-all text-sm"
                                    style={
                                        (selectedLanguage === "python" && pyodideLoading) || running
                                            ? {
                                                  background: "var(--bg-3)",
                                                  color: "var(--text-3)",
                                                  cursor: "not-allowed",
                                              }
                                            : { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                    }
                                >
                                    {running ? "실행 중..." : "▶ 코드 실행"}
                                </button>
                            )}

                            {problem.problem_type === "ai_debugging" && (
                                <button
                                    onClick={handleRun}
                                    disabled={(selectedLanguage === "python" && pyodideLoading) || running}
                                    className="mt-4 py-3 rounded-xl font-semibold transition-all text-sm"
                                    style={
                                        (selectedLanguage === "python" && pyodideLoading) || running
                                            ? {
                                                  background: "var(--bg-3)",
                                                  color: "var(--text-3)",
                                                  cursor: "not-allowed",
                                              }
                                            : { background: "var(--accent2)", color: "#fff" }
                                    }
                                >
                                    {running ? "실행 중..." : "🐛 버그 수정 후 실행"}
                                </button>
                            )}

                            {problem.problem_type === "design_implementation" && (
                                <button
                                    onClick={handleRun}
                                    disabled={(selectedLanguage === "python" && pyodideLoading) || running}
                                    className="mt-4 py-3 rounded-xl font-semibold transition-all text-sm"
                                    style={
                                        (selectedLanguage === "python" && pyodideLoading) || running
                                            ? {
                                                  background: "var(--bg-3)",
                                                  color: "var(--text-3)",
                                                  cursor: "not-allowed",
                                              }
                                            : { background: "var(--accent3)", color: "#fff" }
                                    }
                                >
                                    {running ? "실행 중..." : "▶ 내 설계대로 짠 코드 실행"}
                                </button>
                            )}

                            {(problem.problem_type === "ai_debugging" ||
                                problem.problem_type === "design_implementation") &&
                                testResult && (
                                    <div className="mt-3">
                                        <div
                                            className="p-3 rounded-lg font-bold text-sm"
                                            style={
                                                testResult.success
                                                    ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                                    : { background: "#fee2e2", color: "#dc2626" }
                                            }
                                        >
                                            {testResult.message}
                                        </div>
                                    </div>
                                )}
                        </>
                    )}
                </div>
            </div>

            {/* ===== 게이트 선택 모달 ===== */}
            {showGateChoice && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[var(--bg-2)] rounded-2xl p-8 max-w-md w-full mx-4 text-center border border-[var(--border-c)]">
                        <div className="text-4xl mb-4">🎉</div>
                        <h2 className="text-xl font-bold mb-2">학습 완료!</h2>
                        <p className="text-[var(--text-2)] text-sm mb-6">
                            이해 확인 게이트를 통과하면 완전히 완료됩니다. 게이트는 같은 개념의 다른 문제로 진짜 이해를
                            검증해요.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    setShowGateChoice(false);
                                    setGateOpen(true);
                                }}
                                className="w-full py-3 rounded-xl font-semibold transition-all"
                                style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                            >
                                🔍 이해 확인하기
                            </button>
                            <button
                                onClick={() => {
                                    setShowGateChoice(false);
                                    setSkipGate(true);
                                }}
                                className="w-full py-3 rounded-xl font-semibold transition-all bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg)]"
                            >
                                나중에 하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== 최종 제출 버튼 (하단 고정) ===== */}
            {(gateToken || skipGate) && (
                <div className="fixed bottom-6 right-6 z-40">
                    <button
                        className="px-6 py-3 rounded-xl font-semibold transition-all shadow-lg text-sm"
                        style={{ background: "var(--accent)", color: "#fff" }}
                        onClick={async () => {
                            if (!problem) return;
                            if (!user) {
                                router.push("/auth/login");
                                return;
                            }
                            const timeSpentSec = elapsed;
                            const submitCode =
                                aiAnswers !== null && aiAnswers.length > 0 ? JSON.stringify(aiAnswers) : code;
                            try {
                                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/submit`, {
                                    method: "POST",
                                    headers: { "Content-type": "application/json" },
                                    body: JSON.stringify({
                                        problem_id: problem.id,
                                        email: user?.email || "",
                                        token: gateToken ?? null,
                                        code: submitCode,
                                        time_spent_sec: timeSpentSec,
                                        skip_gate: skipGate,
                                    }),
                                });
                                if (!res.ok) throw new Error("제출 실패");
                                const data = await res.json();
                                const queryParams = new URLSearchParams({
                                    level: problem.level,
                                    stats: JSON.stringify(data.stats),
                                    code: data.submitted_code || "",
                                });
                                router.push(`/learn/${urlTrack}/${problem.id}/result?${queryParams.toString()}`);
                            } catch (err) {
                                console.error(err);
                                alert("제출 중 오류가 발생했습니다.");
                            }
                        }}
                    >
                        ✅ 최종 제출하기
                    </button>
                </div>
            )}

            <GateModal
                isOpen={gateOpen}
                problemId={problem.id}
                email={user?.email || ""}
                language={selectedLanguage}
                onPass={(token) => {
                    setGateToken(token);
                    setGateOpen(false);
                }}
                onClose={() => setGateOpen(false)}
            />
        </main>
    );
}
