"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

import SiteNav, { SiteNavLink } from "../components/SiteNav";

// 신규: 공통 레벨 매핑 사용
// 기존엔 이 파일 안에 LEVEL_FILTERS/levelBadge를 직접 정의했었는데,
// 이름/색상을 한 곳(levelMeta.ts)에서 관리하도록 옮김
import { LEVEL_META, LEVEL_ORDER, type Level } from "../lib/levelMeta";

import { createClient } from "../lib/supabase";

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

// 신규: 필터 pill 목록 — "전체"는 레벨이 아니라 필터 옵션이라
// LEVEL_ORDER와 별개로 앞에 붙임. 나머지 3개는 LEVEL_ORDER를 순회하며
// LEVEL_META의 shortLabel(기초/응용/심화)을 그대로 사용
// (기존엔 "입문/초급/중급"을 이 파일 안에 직접 하드코딩했었음)
const LEVEL_FILTERS = [
    { value: "all", label: "전체" },
    ...LEVEL_ORDER.map((level) => ({ value: level as string, label: LEVEL_META[level].shortLabel })),
];

// 삭제: levelBadge 딕셔너리 — 이제 LEVEL_META로 대체됨

// ============================================================
// LearnContent — 실제 로직이 들어있는 컴포넌트
// ============================================================
// useSearchParams()를 쓰기 때문에 하단 Learn()에서 Suspense로 감싸야 함
function LearnContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();

    const [allProblems, setAllProblems] = useState<Problem[]>([]);

    const learnLinks: SiteNavLink[] = [{ label: "통계", href: "/stats" }];

    // 모바일 트랙 선택 드롭다운(첨부 예시처럼 pill 형태) 열림/닫힘
    const [trackDropdownOpen, setTrackDropdownOpen] = useState(false);

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

                // 로그인 상태면 토큰 획득 (게스트는 토큰 없이 진행)
                const supabase = createClient();
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const token = session?.access_token;

                const email = user?.email || "";

                // 조건부 Authorization 헤더 - 토큰 있으면 포함, 없으면 생략
                const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

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
                        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/problems/${lv}`, {
                            headers: authHeaders,
                        }).then((res) => {
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
            <SiteNav
                links={learnLinks}
                activeLabel="학습"
            />

            {/* 사이드바 + 본문 레이아웃 (수정 없음, 기존 그대로) */}
            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] min-h-[calc(100vh-56px)]">
                <aside className="hidden md:block bg-[var(--bg-3)] border-r border-[var(--border-c)] py-5">
                    <div className="px-3.5 mb-3">
                        <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1.5">트랙</p>
                        {visibleTracks.map((t) => (
                            <button
                                key={t.slug}
                                onClick={() => {
                                    setActiveTrack(t.slug);
                                    setActiveLevelFilter("all");
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

                <div className="p-5">
                    {loading && <p className="text-sm text-[var(--text-2)] py-10 text-center">불러오는 중...</p>}
                    {error && <p className="text-sm text-red-500 py-10 text-center">{error}</p>}

                    {!loading && !error && (
                        <>
                            {resumeProblem && (
                                <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-3.5 mb-4">
                                    <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1">
                                        이어하기
                                    </p>
                                    <p className="text-xs font-bold mb-0.5">{resumeProblem.title}</p>
                                    {/* 수정: levelBadge[...].label → LEVEL_META[...].shortLabel */}
                                    <p className="text-[10px] text-[var(--text-2)] mb-2">
                                        {resumeProblem.problem_type} ·{" "}
                                        {LEVEL_META[resumeProblem.level as Level].shortLabel}
                                    </p>
                                    <button
                                        // resumeProblem은 activeTrack으로 필터링된 목록에서 나온 값이라
                                        // activeTrack이 곧 이 문제의 트랙과 동일함
                                        onClick={() => router.push(`/learn/${activeTrack}/${resumeProblem.id}`)}
                                        className="inline-block text-[10px] rounded px-3 py-1.5"
                                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                                    >
                                        이어서 풀기 →
                                    </button>
                                </div>
                            )}

                            {/* ============================================================
                                리스트 헤더
                                - 데스크탑: 기존처럼 고정 텍스트 h1 (hidden md:block)
                                - 모바일: "트랙명 ∨" pill 버튼 + 드롭다운
                                ============================================================ */}
                            <div className="flex items-center justify-between mb-3 relative">
                                {/* 데스크탑 전용 고정 타이틀 */}
                                <h1 className="hidden md:block text-sm font-bold tracking-tight">
                                    {TRACKS.find((t) => t.slug === activeTrack)?.name}
                                </h1>

                                {/* 모바일 전용 트랙 선택 pill + 드롭다운 */}
                                <div className="md:hidden relative">
                                    <button
                                        onClick={() => setTrackDropdownOpen(!trackDropdownOpen)}
                                        className="flex items-center gap-1.5 text-xs font-bold border border-[var(--border-strong)] rounded-full px-3 py-1.5 bg-[var(--bg-2)]"
                                    >
                                        {TRACKS.find((t) => t.slug === activeTrack)?.name}
                                        <i
                                            className={`ti ti-chevron-down transition-transform ${trackDropdownOpen ? "rotate-180" : ""}`}
                                            style={{ fontSize: "12px" }}
                                            aria-hidden="true"
                                        />
                                    </button>

                                    {trackDropdownOpen && (
                                        <div className="absolute top-full left-0 mt-1.5 bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-md shadow-sm z-40 min-w-[160px] py-1">
                                            {visibleTracks.map((t) => (
                                                <button
                                                    key={t.slug}
                                                    onClick={() => {
                                                        setActiveTrack(t.slug);
                                                        setActiveLevelFilter("all");
                                                        router.replace(`/learn?track=${t.slug}`, { scroll: false });
                                                        setTrackDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--bg-3)]"
                                                >
                                                    <span
                                                        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                                                        style={{ background: t.color }}
                                                    />
                                                    {t.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 난이도 필터 pill — LEVEL_FILTERS가 이제 LEVEL_META 기반이라
                                    이 렌더링 코드 자체는 수정 없이 그대로 재사용 가능 */}
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

                            {filteredProblems.length === 0 ? (
                                <p className="text-sm text-[var(--text-3)] py-10 text-center">
                                    조건에 맞는 문제가 없습니다.
                                </p>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    {filteredProblems.map((p) => {
                                        // 수정: levelBadge[p.level] → LEVEL_META[p.level as Level]
                                        const badge = LEVEL_META[p.level as Level];
                                        const trackMeta = TRACKS.find((t) => t.slug === p.track);
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => router.push(`/learn/${p.track}/${p.id}`)}
                                                className="flex items-center justify-between px-2 py-2.5 rounded-md hover:bg-[var(--bg-3)] transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-2">
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
                                                    {/* 수정: badge.label → badge.shortLabel (기초/응용/심화) */}
                                                    <span
                                                        className="text-[9px] rounded px-1.5 py-0.5"
                                                        style={{ background: badge.bg, color: badge.fg }}
                                                    >
                                                        {badge.shortLabel}
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
