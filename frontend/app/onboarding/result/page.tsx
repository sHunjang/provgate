"use client";

import { Suspense } from "react";

// useEffect: 컴포넌트 렌더링 후 API 호출에 사용
// useState: 결과 데이터 상세 관리
import { useEffect, useState, useRef } from "react";

// useRouter: 페이지 이동
// useSearchParams: URL 쿼리 파라미터 읽기
import { useRouter, useSearchParams } from "next/navigation";

// useAuth: 현재 로그인한 유저 정보 가져오기
import { useAuth } from "@/app/hooks/useAuth";

// 신규: 사이트 공통 네비게이션
import SiteNav from "@/app/components/SiteNav";

// 신규: 공통 레벨 매핑 사용
// 기존엔 이 파일 안에 levelLabel/levelColorVar 딕셔너리를 직접 정의했었는데,
// 이름/색상을 한 곳(levelMeta.ts)에서 관리하도록 옮김
import { LEVEL_META, type Level } from "@/app/lib/levelMeta";

// 온보딩 완료 결과 타입 정의
type OnboardingResult = {
    email: string;
    declared_level: string;
    confirmed_level: string;
    score: number;
    total: number;
    ratio: number;
    // 수정: string[] → 구조화된 객체 배열
    // 백엔드가 이제 "개념 이름 + 그 개념의 대표 문제 id"를 함께 내려줌
    // (로드맵 항목을 클릭하면 바로 문제로 이동시키기 위함)
    roadmap: { concept_tag: string; problem_id: string }[];
};

// 퀴즈 문항 타입 정의
type Question = {
    id: number;
    question: string;
    options: string[];
    answer: number;
    concept: string;
    explanation: string;
};

// 삭제: levelLabel 딕셔너리 — 이제 LEVEL_META로 대체됨

function ResultContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // 현재 로그인한 유저 정보
    // authLoading: Supabase에서 유저 정보를 가져오는 중인지 여부
    const { user, loading: authLoading } = useAuth();

    // API 중복 호출 방지용 ref
    // useRef: 리렌더링 없이 값을 유지하는 Hook
    const hasCalledRef = useRef(false);

    // URL 쿼리 파라미터에서 데이터 파싱
    const level = searchParams.get("level") || "beginner";
    const answers = JSON.parse(searchParams.get("answers") || "[]");
    const correctAnswers = JSON.parse(searchParams.get("correctAnswers") || "[]");

    // questions 파싱
    const questions = JSON.parse(searchParams.get("questions") || "[]");

    // 결과 데이터 파싱
    const [result, setResult] = useState<OnboardingResult | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    // 컴포넌트 마운트 시 온보딩 완료 API 호출
    useEffect(() => {
        // authLoading이 끝날 때까지 대기
        if (authLoading) return;

        // 이미 호출했으면 재실행 방지
        if (hasCalledRef.current) return;

        // 유저 정보가 없으면 (비로그인) 에러 처리
        if (!user) {
            setError("로그인이 필요합니다.");
            setLoading(false);
            return;
        }

        hasCalledRef.current = true;

        const completeOnboarding = async () => {
            try {
                setLoading(true);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/complete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        // 임시 이메일 - 나중에 인증 붙이면 교체
                        email: user?.email || "",
                        declared_level: level,
                        answers,
                        correct_answers: correctAnswers,
                    }),
                });

                if (!res.ok) throw new Error("온보딩 완료 처리에 실패했습니다.");

                const data = await res.json();

                setResult(data);
            } catch {
                setError("결과를 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };

        completeOnboarding();
    }, [user, authLoading, answers, correctAnswers, level]);

    // 로딩 화면 - user 로딩 중일 때도 표시
    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--bg)]">
                <SiteNav />
                <div className="flex flex-col items-center justify-center py-24">
                    <div className="text-center">
                        <div
                            className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-5"
                            style={{
                                borderColor: "var(--accent-bg)",
                                borderTopColor: "var(--accent)",
                            }}
                        />
                        <p className="text-base text-[var(--text-2)]">결과를 분석하고 있어요...</p>
                    </div>
                </div>
            </main>
        );
    }

    // 에러 화면
    if (error) {
        return (
            <main className="min-h-screen bg-[var(--bg)]">
                <SiteNav />
                <div className="flex flex-col items-center justify-center py-24">
                    <div className="text-center">
                        <div className="text-5xl mb-4">😢</div>
                        <p className="text-base text-[var(--text-2)]">{error}</p>
                        <button
                            onClick={() => router.push("/")}
                            className="mt-4 px-6 py-2 rounded-lg text-sm"
                            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                        >
                            처음으로 돌아가기
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    // 수준이 올랐는지 확인
    const levelOrder = ["beginner", "intermediate", "advanced"];
    const declaredIdx = levelOrder.indexOf(result!.declared_level);
    const confirmedIdx = levelOrder.indexOf(result!.confirmed_level);
    const levelUp = confirmedIdx > declaredIdx;
    const levelDown = confirmedIdx < declaredIdx;

    // 신규: confirmed_level에 해당하는 레벨 메타 정보를 미리 꺼내둠
    // (타입 캐스팅 as Level: result의 confirmed_level은 API에서 string으로
    //  오지만, 실제 값은 항상 "beginner"|"intermediate"|"advanced" 중 하나임을
    //  우리가 알고 있으므로 안전하게 Level 타입으로 좁혀서 LEVEL_META 조회에 사용)
    const confirmedMeta = LEVEL_META[result!.confirmed_level as Level];
    const declaredMeta = LEVEL_META[result!.declared_level as Level];

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            {/* 신규: SiteNav */}
            <SiteNav />

            <div className="flex flex-col items-center px-6 py-10">
                <div className="w-full max-w-2xl">
                    {/* 점수 카드 */}
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-8 mb-6 text-center">
                        <div className="text-5xl mb-4">
                            {result!.ratio >= 80 ? "🎉" : result!.ratio >= 40 ? "👍" : "💪"}
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight mb-2">진단 완료!</h1>
                        <p className="text-sm text-[var(--text-2)] mb-6">
                            5문항 중{" "}
                            <span
                                className="font-bold"
                                style={{ color: "var(--accent)" }}
                            >
                                {result!.score}개
                            </span>{" "}
                            정답 ({result!.ratio}%)
                        </p>

                        {/* ============================================================
                            수준 확정 결과
                            수정: bg-indigo-50/text-indigo-700 하드코딩 → LEVEL_META 기반
                            - 배경: confirmedMeta.bg (레벨별 옅은~진한 그린 농도)
                            - 레벨명: LEVEL_META[...].label ("입문자" 등 → "기초 이해" 등)
                            - 안내 문구 색: 기존엔 text-[var(--text-3)](고정 회색)이었는데,
                              advanced일 때 배경이 진한 초록이라 회색 글씨가 안 보이는
                              문제가 있었음. confirmedMeta.fg를 그대로 쓰되 살짝
                              투명도(opacity)를 줘서, "레벨 텍스트보다는 옅지만
                              배경 위에서 항상 읽히는" 안내 문구로 만듦
                            ============================================================ */}
                        <div
                            className="rounded-md p-4"
                            style={{ background: confirmedMeta.bg }}
                        >
                            {levelUp ? (
                                <>
                                    <p
                                        className="text-xs mb-1"
                                        style={{ color: confirmedMeta.fg, opacity: 0.75 }}
                                    >
                                        선택하신 수준보다 실력이 더 높으시네요! 🚀
                                    </p>
                                    <p
                                        className="text-base font-bold"
                                        style={{ color: confirmedMeta.fg }}
                                    >
                                        {declaredMeta.label} → {confirmedMeta.label}
                                    </p>
                                </>
                            ) : levelDown ? (
                                <>
                                    <p
                                        className="text-xs mb-1"
                                        style={{ color: confirmedMeta.fg, opacity: 0.75 }}
                                    >
                                        조금 더 기초부터 다져보아요! 💪
                                    </p>
                                    <p
                                        className="text-base font-bold"
                                        style={{ color: confirmedMeta.fg }}
                                    >
                                        {declaredMeta.label} → {confirmedMeta.label}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p
                                        className="text-xs mb-1"
                                        style={{ color: confirmedMeta.fg, opacity: 0.75 }}
                                    >
                                        확정된 학습 수준
                                    </p>
                                    <p
                                        className="text-base font-bold"
                                        style={{ color: confirmedMeta.fg }}
                                    >
                                        {confirmedMeta.label}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 문제별 결과 */}
                    {questions.length > 0 && (
                        <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-6 mb-6">
                            <h2 className="text-base font-bold mb-4">📝 문제별 결과</h2>
                            <div className="space-y-3">
                                {questions.map((q: Question, idx: number) => {
                                    const userAnswer = answers[idx];
                                    const isCorrect = userAnswer === q.answer;
                                    return (
                                        <div
                                            key={q.id}
                                            className="rounded-md p-4 border"
                                            style={
                                                isCorrect
                                                    ? { borderColor: "var(--accent)", background: "var(--accent-bg)" }
                                                    : { borderColor: "#dc2626", background: "#fee2e2" }
                                            }
                                        >
                                            {/* 문제 헤더 */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span>{isCorrect ? "✅" : "❌"}</span>
                                                <span className="text-xs font-medium text-[var(--text-3)]">
                                                    {q.concept}
                                                </span>
                                            </div>

                                            {/* 문제 내용 */}
                                            <p className="text-sm text-[var(--text)] mb-3 whitespace-pre-wrap">
                                                {q.question
                                                    .replace(/```python/g, "")
                                                    .replace(/```/g, "")
                                                    .trim()}
                                            </p>

                                            {/* 내 답 vs 정답 */}
                                            <div className="space-y-1">
                                                <div
                                                    className="text-xs px-3 py-1.5 rounded-md"
                                                    style={
                                                        isCorrect
                                                            ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                                            : { background: "#fee2e2", color: "#dc2626" }
                                                    }
                                                >
                                                    <span className="font-medium">내 답: </span>
                                                    {q.options[userAnswer] || "미답변"}
                                                </div>

                                                {/* 틀렸을 때만 정답 표시 */}
                                                {!isCorrect && (
                                                    <div
                                                        className="text-xs px-3 py-1.5 rounded-md"
                                                        style={{
                                                            background: "var(--accent-bg)",
                                                            color: "var(--accent)",
                                                        }}
                                                    >
                                                        <span className="font-medium">정답: </span>
                                                        {q.options[q.answer]}
                                                    </div>
                                                )}
                                            </div>

                                            {/* 해설 */}
                                            <div className="mt-3 text-xs text-[var(--text-2)] bg-[var(--bg-3)] rounded-md p-3">
                                                <span className="font-medium">💡 해설: </span>
                                                {q.explanation}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 로드맵 카드 */}
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-8 mb-6">
                        <h2 className="text-base font-bold mb-1">📚 학습 로드맵</h2>
                        <p className="text-xs text-[var(--text-3)] mb-4">항목을 눌러 바로 문제를 풀어보세요</p>
                        <div className="space-y-2">
                            {result!.roadmap.map((item, idx) => (
                                <button
                                    key={item.problem_id}
                                    onClick={() => router.push(`/learn/foundation/${item.problem_id}`)}
                                    className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-[var(--bg-3)] transition-colors text-left"
                                >
                                    {/* 순서 번호 */}
                                    <span
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                        style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                                    >
                                        {idx + 1}
                                    </span>
                                    <span className="text-sm text-[var(--text-2)] flex-1">{item.concept_tag}</span>
                                    <i
                                        className="ti ti-chevron-right text-[var(--text-3)]"
                                        style={{ fontSize: "14px" }}
                                        aria-hidden="true"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 시작 버튼 */}
                    <button
                        onClick={() => router.push("/learn")}
                        className="w-full py-3.5 rounded-md font-semibold text-sm transition-opacity hover:opacity-90"
                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                    >
                        학습 시작하기 →
                    </button>
                </div>
            </div>
        </main>
    );
}

export default function ResultPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
                    <p className="text-[var(--text-2)]" />
                </main>
            }
        >
            <ResultContent />
        </Suspense>
    );
}
