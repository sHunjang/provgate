"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";
// import ThemeToggle from "@/app/components/ThemeToggle";
import SiteNav from "@/app/components/SiteNav";

type SimilarProblem = {
    id: string;
    title: string;
    description: string;
    concept_tag: string;
    level: string;
    test_cases: { input: string; output: string }[];
    starter_code: string;
};

type Stats = {
    hint_count: number;
    gate_attempts: number;
    time_spent_sec: number;
};

// ============================================================
// 신규: 힌트 사용 평가 색상도 CSS 변수로 통일
// ============================================================
// 기존엔 text-yellow-400/green-400/blue-400/gray-400을 각 조건마다
// 하드코딩했는데, /learn·/stats에서 써온 accent 팔레트로 통일함
const getHintEval = (count: number) => {
    if (count === 0) return { text: "힌트 없이 해결! 🏆", color: "var(--accent)" };
    if (count <= 1) return { text: "힌트 최소화 👍", color: "var(--accent)" };
    if (count <= 2) return { text: "힌트 조금 사용", color: "var(--accent3)" };
    return { text: "힌트 많이 사용 💪", color: "var(--text-3)" };
};

export default function FeedbackPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();

    const problemId = params.id as string;
    // 신규: URL의 [track] 세그먼트 — "이 문제 도전하기" 이동 시 쓰진 않지만
    // (유사 문제는 ai_generated 트랙 고정이라) "목록으로" 버튼에서 참고용으로 보유
    const level = searchParams.get("level") || "beginner";
    const stats: Stats = JSON.parse(
        searchParams.get("stats") || '{"hint_count": 0, "gate_attempts":0, "time_spent_sec": 0}',
    );

    const [similarProblem, setSimilarProblem] = useState<SimilarProblem | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasFetched, setHasFetched] = useState(false);
    const submittedCode = searchParams.get("code") || "";
    const [showCode, setShowCode] = useState(false);

    useEffect(() => {
        if (!user || hasFetched) return;

        const fetchSimilarProblem = async () => {
            try {
                setLoading(true);
                setHasFetched(true);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/similar-problem`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        problem_id: problemId,
                        level,
                        email: user.email,
                    }),
                });

                if (!res.ok) throw new Error("유사 문제 생성 실패");

                const data = await res.json();
                setSimilarProblem(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchSimilarProblem();
    }, [problemId, level, user, hasFetched]);

    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}분 ${sec}초`;
    };

    const hintEval = getHintEval(stats.hint_count);

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <SiteNav />

            <div className="max-w-2xl mx-auto px-6 py-10">
                {/* 헤더 */}
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🎉</div>
                    <h1 className="text-2xl font-bold tracking-tight mb-1">제출 완료!</h1>
                    <p className="text-sm text-[var(--text-2)]">수고했어요! 결과를 확인해보세요.</p>
                </div>

                {/* 통계 카드 */}
                <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-5 mb-4">
                    <h2 className="text-sm font-bold text-[var(--text-2)] mb-4">📊 풀이 통계</h2>
                    <div className="grid grid-cols-3 gap-3">
                        {/* 힌트 사용 횟수 */}
                        <div className="text-center p-3 bg-[var(--bg-3)] rounded-md">
                            <p
                                className="text-2xl font-bold mb-1"
                                style={{ color: "var(--accent3)" }}
                            >
                                {stats.hint_count}
                            </p>
                            <p className="text-[10px] text-[var(--text-3)]">힌트 사용</p>
                            <p
                                className="text-[10px] mt-1"
                                style={{ color: hintEval.color }}
                            >
                                {hintEval.text}
                            </p>
                        </div>

                        {/* 게이트 시도 횟수 */}
                        <div className="text-center p-3 bg-[var(--bg-3)] rounded-md">
                            <p
                                className="text-2xl font-bold mb-1"
                                style={{ color: "var(--accent2)" }}
                            >
                                {stats.gate_attempts}
                            </p>
                            <p className="text-[10px] text-[var(--text-3)]">게이트 시도</p>
                            <p
                                className="text-[10px] mt-1"
                                style={{ color: stats.gate_attempts <= 1 ? "var(--accent)" : "var(--text-3)" }}
                            >
                                {stats.gate_attempts <= 1 ? "한 번에 통과! 🎯" : "재시도 후 통과"}
                            </p>
                        </div>

                        {/* 소요 시간 */}
                        <div className="text-center p-3 bg-[var(--bg-3)] rounded-md">
                            <p
                                className="text-2xl font-bold mb-1"
                                style={{ color: "var(--accent)" }}
                            >
                                {Math.floor(stats.time_spent_sec / 60)}
                            </p>
                            <p className="text-[10px] text-[var(--text-3)]">분 소요</p>
                            <p className="text-[10px] mt-1 text-[var(--text-3)]">{formatTime(stats.time_spent_sec)}</p>
                        </div>
                    </div>
                </div>

                {/* 내 제출 코드 */}
                {submittedCode && (
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-5 mb-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-[var(--text-2)]">📝 내 제출 코드</h2>
                            <button
                                onClick={() => setShowCode(!showCode)}
                                className="text-xs px-3 py-1.5 rounded-md bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg)] transition-all"
                            >
                                {showCode ? "숨기기 ▲" : "보기 ▼"}
                            </button>
                        </div>

                        {showCode && (
                            <pre className="mt-4 p-4 bg-[var(--bg-3)] rounded-md text-xs text-[var(--text-2)] font-mono overflow-x-auto whitespace-pre-wrap border border-[var(--border-c)]">
                                {submittedCode}
                            </pre>
                        )}
                    </div>
                )}

                {/* 유사 문제 추천 */}
                <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-5 mb-4">
                    <h2 className="text-sm font-bold text-[var(--text-2)] mb-4">🔥 다음 도전 문제</h2>

                    {loading ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-[var(--text-2)]">AI가 맞춤 문제를 생성하고 있어요...</p>
                        </div>
                    ) : similarProblem ? (
                        <div>
                            {/* 문제 정보 배지 */}
                            <div className="flex items-center gap-2 mb-3">
                                <span
                                    className="text-xs px-2.5 py-1 rounded-full"
                                    style={{ background: "var(--accent3-bg)", color: "var(--accent3)" }}
                                >
                                    {similarProblem.concept_tag}
                                </span>
                                <span
                                    className="text-xs px-2.5 py-1 rounded-full"
                                    style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                                >
                                    {similarProblem.level}
                                </span>
                            </div>

                            <h3 className="text-base font-bold mb-2">{similarProblem.title}</h3>

                            <p className="text-sm text-[var(--text-2)] whitespace-pre-wrap mb-4">
                                {similarProblem.description}
                            </p>

                            {/* 테스트 케이스 미리보기 */}
                            <div className="bg-[var(--bg-3)] rounded-md p-3 mb-4">
                                <p className="text-[10px] text-[var(--text-3)] mb-2">예제 입출력</p>
                                {similarProblem.test_cases.slice(0, 2).map((tc, idx) => (
                                    <div
                                        key={idx}
                                        className="flex gap-4 text-xs mb-1.5"
                                    >
                                        <div className="flex-1">
                                            <span className="text-[var(--text-3)]">입력: </span>
                                            <code style={{ color: "var(--accent)" }}>{tc.input}</code>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-[var(--text-3)]">출력: </span>
                                            <code style={{ color: "var(--accent3)" }}>{tc.output}</code>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 도전하기 버튼 — ai_generated 트랙 고정 라우팅 */}
                            <button
                                onClick={() => router.push(`/learn/ai_generated/${similarProblem.id}`)}
                                className="w-full py-2.5 rounded-md text-sm font-semibold transition-opacity hover:opacity-90"
                                style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                            >
                                이 문제 도전하기 →
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-[var(--text-3)] text-center py-4">유사 문제를 불러올 수 없습니다.</p>
                    )}
                </div>

                {/* 하단 버튼 */}
                <button
                    onClick={() => router.push("/learn")}
                    className="w-full py-2.5 rounded-md text-sm font-semibold bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg)] transition-all"
                >
                    문제 목록으로 돌아가기
                </button>
            </div>
        </main>
    );
}
