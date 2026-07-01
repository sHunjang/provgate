"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

// ============================================================
// 타입 정의
// ============================================================
type Problem = {
    id: string;
    title: string;
    description: string;
    level: "beginner" | "intermediate" | "advanced";
    concept_tag: string;
    order_idx: number;
    status: "not_started" | "in_progress" | "completed";
    is_completed: boolean;
    track: string; // "foundation" | "project" | "prompt" | "ai_generated"
    problem_type: string;
};

// 트랙 메타데이터 - 홈 페이지의 tracks 배열과 slug가 반드시 일치해야 함
// (다르면 홈에서 넘어온 ?track= 값이 여기서 매칭이 안 돼 기본값으로 떨어짐)
const TRACKS = [
    { slug: "foundation", name: "Python 기초", color: "var(--accent)" },
    { slug: "project", name: "실무 설계", color: "var(--accent2)" },
    { slug: "prompt", name: "AI 활용", color: "var(--accent3)" },
    // 개인 맞춤 트랙 — 유사 문제를 생성한 적 있는 유저에게만 노출됨 (아래 visibleTracks 참고)
    { slug: "ai_generated", name: "AI 추천 문제", color: "var(--text-2)" },
] as const;

const LEVEL_FILTERS = [
    { value: "all", label: "전체" },
    { value: "beginner", label: "입문" },
    { value: "intermediate", label: "초급" },
    { value: "advanced", label: "중급" },
] as const;

const levelBadge: Record<string, { bg: string; fg: string; label: string }> = {
    beginner: { bg: "var(--accent-bg)", fg: "var(--accent)", label: "입문" },
    intermediate: { bg: "var(--accent2-bg)", fg: "var(--accent2)", label: "초급" },
    advanced: { bg: "var(--accent3-bg)", fg: "var(--accent3)", label: "중급" },
};

// ============================================================
// LearnContent — 실제 로직이 들어있는 컴포넌트
// ============================================================
// useSearchParams()를 쓰기 때문에 하단 Learn()에서 Suspense로 감싸야 함
function LearnContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();

    const [allProblems, setAllProblems] = useState<Problem[]>([]);

    // ============================================================
    // activeTrack 초기값을 URL의 ?track= 값에서 가져오기
    // ============================================================
    // useState(초기화 함수): 함수를 넘기면 컴포넌트가 처음 렌더링될 때
    // "딱 한 번만" 실행됨 (Lazy Initialization 패턴 — 매 렌더마다 재계산 방지)
    // 홈에서 /learn?track=project로 넘어왔으면 그 값을 쓰고,
    // 값이 없거나 유효하지 않으면(오타 등) 기본값(첫 번째 트랙)으로 대체
    const [activeTrack, setActiveTrack] = useState<string>(() => {
        const trackParam = searchParams.get("track");
        const validSlugs = TRACKS.map((t) => t.slug);
        // includes(): 배열 안에 특정 값이 존재하는지 O(n)으로 확인
        if (trackParam && (validSlugs as readonly string[]).includes(trackParam)) {
            return trackParam;
        }
        return TRACKS[0].slug;
    });

    const [activeLevelFilter, setActiveLevelFilter] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ------------------------------------------------------------
    // 데이터 로드
    // ------------------------------------------------------------
    // Promise.all: 여러 비동기 요청을 동시에 보내고 전부 끝날 때까지 대기
    //   순차 await 3번보다 네트워크 왕복이 병렬 처리되어 훨씬 빠름
    useEffect(() => {
        if (authLoading) return;

        const initialize = async () => {
            try {
                setLoading(true);
                const email = user?.email || "";

                // 로그인 유저는 온보딩 여부 먼저 체크
                if (email) {
                    const levelRes = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/user-level?email=${encodeURIComponent(email)}`,
                    );
                    if (levelRes.ok) {
                        const levelData = await levelRes.json();
                        if (!levelData.has_onboarding) {
                            router.push("/?needOnboarding=true");
                            return;
                        }
                    }
                }

                // 3개 난이도를 동시에 요청 → 응답 배열로 받음
                const levels = ["beginner", "intermediate", "advanced"];
                const responses = await Promise.all(
                    levels.map((lv) =>
                        fetch(
                            `${process.env.NEXT_PUBLIC_API_URL}/api/problems/${lv}?email=${encodeURIComponent(email)}`,
                        ).then((res) => {
                            if (!res.ok) throw new Error("문제 목록을 불러오지 못했습니다.");
                            return res.json();
                        }),
                    ),
                );

                // flatMap: 각 응답의 problems 배열을 하나로 평탄화(flatten)
                const merged: Problem[] = responses.flatMap((r) => r.problems);
                setAllProblems(merged);
            } catch {
                setError("문제 목록을 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, [user?.email, authLoading, router]);

    // ------------------------------------------------------------
    // 파생 데이터 (derived state)
    // ------------------------------------------------------------
    // 별도 useState로 관리하지 않고 매 렌더링마다 계산함.
    // 이유: allProblems가 바뀔 때마다 수동 동기화하는 코드를 안 짜도 되고,
    //       문제 30개 수준에서는 filter() 몇 번 돌려도 성능 영향이 없음.

    // 현재 선택된 트랙에 속한 문제만 추림
    const trackProblems = allProblems.filter((p) => p.track === activeTrack);

    // 사이드바에 실제로 노출할 트랙 목록
    // ai_generated는 "이 유저가 유사 문제를 한 번이라도 생성했을 때만" 의미가 있으므로
    // some(): 조건을 만족하는 요소가 하나라도 있으면 true (존재 여부 확인에 최적)
    const visibleTracks = TRACKS.filter((t) => {
        if (t.slug !== "ai_generated") return true;
        return allProblems.some((p) => p.track === "ai_generated");
    });

    // 트랙 문제 중 난이도 필터까지 적용한 최종 목록
    const filteredProblems =
        activeLevelFilter === "all" ? trackProblems : trackProblems.filter((p) => p.level === activeLevelFilter);

    // 트랙별 진행률: 완료 개수 / 트랙 내 전체 개수
    const completedInTrack = trackProblems.filter((p) => p.status === "completed").length;
    const totalInTrack = trackProblems.length;
    const progressPct = totalInTrack > 0 ? Math.round((completedInTrack / totalInTrack) * 100) : 0;

    // "이어하기" 카드용 데이터: 진행 중(in_progress) 문제 중 첫 번째
    const resumeProblem = trackProblems.find((p) => p.status === "in_progress");

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            {/* NAV */}
            <nav className="h-14 border-b border-[var(--border-c)] bg-[var(--bg-2)] flex items-center justify-between px-6">
                <button
                    onClick={() => router.push("/")}
                    className="font-bold text-sm tracking-tight"
                >
                    Prov<span style={{ color: "var(--accent)" }}>Gate</span>
                </button>
                <div className="flex items-center gap-5">
                    <span className="text-xs font-medium">학습</span>
                    <button
                        onClick={() => router.push("/stats")}
                        className="text-xs text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
                    >
                        통계
                    </button>
                    {user && (
                        <span className="text-xs border border-[var(--border-strong)] bg-[var(--bg-3)] rounded px-3 py-1.5">
                            {user.email?.split("@")[0]}
                        </span>
                    )}
                </div>
            </nav>

            {/* 사이드바 + 본문 2단 레이아웃 */}
            <div className="grid grid-cols-[160px_1fr] min-h-[calc(100vh-56px)]">
                {/* ============================================
                    사이드바
                    ============================================ */}
                <aside className="bg-[var(--bg-3)] border-r border-[var(--border-c)] py-5">
                    <div className="px-3.5 mb-3">
                        <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1.5">트랙</p>
                        {/* visibleTracks 사용 — ai_generated는 조건부 노출 */}
                        {visibleTracks.map((t) => (
                            <button
                                key={t.slug}
                                onClick={() => {
                                    setActiveTrack(t.slug);
                                    // 트랙 전환 시 난이도 필터는 "전체"로 리셋
                                    // (직전 트랙에서 "중급" 필터를 켜둔 채 넘어가면
                                    //  "왜 문제가 안 보이지?" 하는 혼란 방지)
                                    setActiveLevelFilter("all");

                                    // URL도 함께 갱신해서 화면 상태와 주소창을 동기화
                                    // scroll: false → 페이지 이동 시 스크롤이 맨 위로 튀는 것 방지
                                    //   (사이드바 클릭은 같은 페이지 안에서의 상태 전환이라
                                    //    스크롤 위치를 유지하는 게 자연스러움)
                                    router.replace(`/learn?track=${t.slug}`, { scroll: false });
                                }}
                                className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded flex items-center gap-1.5 mb-0.5 transition-colors
                                    ${activeTrack === t.slug ? "bg-[var(--bg-2)] font-medium" : "text-[var(--text-2)] hover:bg-[var(--bg-2)]/50"}`}
                            >
                                <span
                                    className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                                    style={{ background: t.color }}
                                />
                                {t.name}
                            </button>
                        ))}
                    </div>

                    {/* 진행률 바 - 선택된 트랙 기준 */}
                    <div className="px-3.5 mb-3">
                        <p className="text-[10px] text-[var(--text-3)] mb-1">
                            {completedInTrack} / {totalInTrack} 완료
                        </p>
                        <div className="h-[2px] bg-[var(--border-c)] rounded-full">
                            <div
                                className="h-[2px] rounded-full"
                                style={{ width: `${progressPct}%`, background: "var(--accent)" }}
                            />
                        </div>
                    </div>

                    <div className="h-px bg-[var(--border-c)] my-3.5" />

                    <div className="px-3.5">
                        <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1.5">메뉴</p>
                        <button className="w-full text-left text-[11px] font-medium py-1 flex items-center gap-1.5">
                            문제 목록
                        </button>
                        <button
                            onClick={() => router.push("/stats")}
                            className="w-full text-left text-[11px] text-[var(--text-2)] py-1 flex items-center gap-1.5"
                        >
                            통계
                        </button>
                    </div>
                </aside>

                {/* ============================================
                    본문 — 이어하기 카드 + 필터 + 문제 리스트
                    ============================================ */}
                <div className="p-5">
                    {loading && <p className="text-sm text-[var(--text-2)] py-10 text-center">불러오는 중...</p>}
                    {error && <p className="text-sm text-red-500 py-10 text-center">{error}</p>}

                    {!loading && !error && (
                        <>
                            {/* 이어하기 카드 - resumeProblem이 있을 때만 표시 */}
                            {resumeProblem && (
                                <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-3.5 mb-4">
                                    <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1">
                                        이어하기
                                    </p>
                                    <p className="text-xs font-bold mb-0.5">{resumeProblem.title}</p>
                                    <p className="text-[10px] text-[var(--text-2)] mb-2">
                                        {resumeProblem.problem_type} · {levelBadge[resumeProblem.level].label}
                                    </p>
                                    <button
                                        onClick={() => router.push(`/problems/${resumeProblem.id}`)}
                                        className="inline-block text-[10px] rounded px-3 py-1.5"
                                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                                    >
                                        이어서 풀기 →
                                    </button>
                                </div>
                            )}

                            {/* 리스트 헤더 + 필터 pill */}
                            <div className="flex items-center justify-between mb-3">
                                <h1 className="text-sm font-bold tracking-tight">
                                    {TRACKS.find((t) => t.slug === activeTrack)?.name}
                                </h1>
                                <div className="flex gap-1">
                                    {LEVEL_FILTERS.map((f) => (
                                        <button
                                            key={f.value}
                                            onClick={() => setActiveLevelFilter(f.value)}
                                            className={`text-[10px] rounded px-2.5 py-1 border transition-colors
                                                ${
                                                    activeLevelFilter === f.value
                                                        ? "border-[var(--border-strong)] bg-[var(--bg-3)]"
                                                        : "border-[var(--border-c)] text-[var(--text-3)] bg-[var(--bg)]"
                                                }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 문제 리스트 */}
                            {filteredProblems.length === 0 ? (
                                <p className="text-sm text-[var(--text-3)] py-10 text-center">
                                    조건에 맞는 문제가 없습니다.
                                </p>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    {filteredProblems.map((p) => {
                                        const badge = levelBadge[p.level];
                                        const trackMeta = TRACKS.find((t) => t.slug === p.track);
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => router.push(`/problems/${p.id}`)}
                                                className="flex items-center justify-between px-2 py-2.5 rounded-md hover:bg-[var(--bg-3)] transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {/* 완료 여부에 따라 dot 색 다르게 (완료=트랙 색, 미완료=회색) */}
                                                    <span
                                                        className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                                                        style={{
                                                            background:
                                                                p.status === "completed"
                                                                    ? trackMeta?.color
                                                                    : "var(--border-strong)",
                                                        }}
                                                    />
                                                    <div>
                                                        <p className="text-xs font-medium">{p.title}</p>
                                                        <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                                                            {p.concept_tag} · {p.problem_type}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="text-[9px] rounded px-1.5 py-0.5"
                                                        style={{ background: badge.bg, color: badge.fg }}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                    {p.status === "completed" ? (
                                                        <span
                                                            className="text-xs"
                                                            style={{ color: "var(--accent)" }}
                                                        >
                                                            ✓
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-[var(--text-3)]">›</span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

// ============================================================
// Learn — 실제로 export되는 페이지 컴포넌트
// ============================================================
// useSearchParams()를 쓰는 컴포넌트는 Suspense로 감싸야 하는
// Next.js 14 규칙 때문에 LearnContent를 바로 export하지 않음
export default function Learn() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
                    <p className="text-[var(--text-2)]">로딩 중...</p>
                </main>
            }
        >
            <LearnContent />
        </Suspense>
    );
}
