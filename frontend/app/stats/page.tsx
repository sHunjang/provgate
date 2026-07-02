"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import { createClient } from "@/app/lib/supabase";
// import ThemeToggle from "@/app/components/ThemeToggle";
import SiteNav from "../components/SiteNav";

// ============================================================
// 타입 정의
// ============================================================
type Stats = {
    total_completed: number;
    beginner_completed: number;
    intermediate_completed: number;
    advanced_completed: number;
    beginner_total: number;
    intermediate_total: number;
    advanced_total: number;
    all_total: number;
    avg_time_sec: number;
    total_hints: number;
    total_gate_attempts: number;
    recent_submissions: {
        problem_id: string;
        title: string;
        level: string;
        concept_tag: string;
        time_spent_sec: number;
        hint_count: number;
        gate_passed: boolean;
        submitted_at: string;
        track: string;
    }[];
};

const levelLabel: Record<string, string> = {
    beginner: "입문자",
    intermediate: "초급자",
    advanced: "중급자",
};

// ============================================================
// 신규: 난이도별 색상을 CSS 변수로 통일
// ============================================================
// 기존엔 text-green-400 같은 Tailwind 고정 색이었는데,
// /learn 페이지에서 이미 확립한 매핑(입문=accent/초급=accent2/중급=accent3)을
// 그대로 재사용해서 "앱 전체에서 같은 난이도는 같은 색"이라는
// 시각적 일관성을 만듦 (사용자가 색만 보고도 난이도를 학습하게 됨)
const levelColorVar: Record<string, string> = {
    beginner: "var(--accent)",
    intermediate: "var(--accent2)",
    advanced: "var(--accent3)",
};

// 초 → MM:SS 형식으로 변환
// Math.floor로 정수 분(minute)만 추출, % 연산자로 나머지 초(second)를 구함
// padStart(2, "0"): 한 자리 수(예: 5)를 "05"처럼 두 자리로 맞춰줌
const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

// 날짜 포맷 변환 - toLocaleDateString으로 브라우저의 지역화(locale) 포맷 사용
const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
};

export default function StatsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    // 비로그인 시 로그인 페이지로 리디렉션
    // 통계는 개인 데이터라 반드시 로그인 상태여야 조회 가능
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [authLoading, user, router]);

    // 통계 데이터 조회
    useEffect(() => {
        if (!user?.email) return;

        const fetchStats = async () => {
            try {
                setLoading(true);

                // Supabase 세션에서 JWT Access Token 가져오기
                // JWT(JSON Web Token): 로그인 시 발급되는 서명된 토큰으로,
                // 서버는 이 토큰만 보고도 "누가 요청했는지" 검증 가능
                // (매 요청마다 이메일/비밀번호를 다시 보낼 필요가 없음)
                const supabase = createClient();
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const token = session?.access_token;

                if (!token) {
                    router.push("/auth/login");
                    return;
                }

                // Authorization 헤더에 "Bearer {토큰}" 형식으로 담아 전송
                // 백엔드는 이 헤더를 읽어서 토큰을 검증하고 유저를 식별함
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stats`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!res.ok) throw new Error("통계 조회 실패");

                const data = await res.json();
                setStats(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [authLoading, user, router]);

    // 로딩 화면 (인증 확인 중이거나 통계 조회 중)
    if (authLoading || loading) {
        return (
            <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
                <p className="text-[var(--text-2)] text-sm">통계를 불러오는 중...</p>
            </main>
        );
    }

    // stats가 아직 null이면(에러 등) 아무것도 렌더링 안 함
    if (!stats) return null;

    const totalProblems = stats.all_total;

    // 분모가 0일 때 NaN 방지
    // (0 / 0 = NaN, NaN은 화면에 "NaN%"처럼 그대로 노출되는 버그를 유발)
    const completionRate = totalProblems > 0 ? Math.round((stats.total_completed / totalProblems) * 100) : 0;

    // AI가 생성한 문제 제목은 "원본 제목 #해시8자리" 형태로 저장돼 있어서
    // "#" 기준으로 잘라 화면엔 원본 제목만 보여줌
    const displayTitle = (title: string) => title.split(" #")[0];

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <SiteNav primaryAction={{ label: "문제", href: "/learn" }} />

            <div className="max-w-3xl mx-auto px-6 py-8">
                <div className="mb-6">
                    <h1 className="text-xl font-bold tracking-tight">학습 통계</h1>
                    <p className="text-xs text-[var(--text-2)] mt-1">{user?.email?.split("@")[0]}님의 학습 현황</p>
                </div>

                {/* 전체 진행률 */}
                <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-[var(--text-2)]">전체 진행률</h2>
                        <span
                            className="text-xl font-bold"
                            style={{ color: "var(--accent)" }}
                        >
                            {completionRate}%
                        </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--border-c)] mb-3">
                        <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${completionRate}%`, background: "var(--accent)" }}
                        />
                    </div>
                    <p className="text-xs text-[var(--text-3)]">
                        전체 {totalProblems}문제 중 {stats.total_completed}문제 완료
                    </p>
                </div>

                {/* 난이도별 완료 현황 */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                        { key: "beginner", count: stats.beginner_completed, total: stats.beginner_total },
                        { key: "intermediate", count: stats.intermediate_completed, total: stats.intermediate_total },
                        { key: "advanced", count: stats.advanced_completed, total: stats.advanced_total },
                    ].map(({ key, count, total }) => (
                        <div
                            key={key}
                            className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-4 text-center"
                        >
                            <p
                                className="text-xs font-medium mb-2"
                                style={{ color: levelColorVar[key] }}
                            >
                                {levelLabel[key]}
                            </p>
                            <p className="text-2xl font-bold tracking-tight mb-1">
                                {count}
                                <span className="text-sm font-medium text-[var(--text-3)]">/{total}</span>
                            </p>
                            <div className="w-full h-1 rounded-full bg-[var(--border-c)] mt-2">
                                <div
                                    className="h-1 rounded-full transition-all duration-500"
                                    style={{
                                        width: `${total > 0 ? Math.round((count / total) * 100) : 0}%`,
                                        background: levelColorVar[key],
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* 요약 통계 3종 */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-4 text-center">
                        <p className="text-[10px] text-[var(--text-3)] mb-1.5">평균 풀이 시간</p>
                        <p
                            className="text-lg font-bold font-mono"
                            style={{ color: "var(--accent3)" }}
                        >
                            {formatTime(stats.avg_time_sec)}
                        </p>
                    </div>
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-4 text-center">
                        <p className="text-[10px] text-[var(--text-3)] mb-1.5">총 힌트 사용</p>
                        <p
                            className="text-lg font-bold"
                            style={{ color: "var(--accent2)" }}
                        >
                            {stats.total_hints}회
                        </p>
                    </div>
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-4 text-center">
                        <p className="text-[10px] text-[var(--text-3)] mb-1.5">총 게이트 시도</p>
                        <p
                            className="text-lg font-bold"
                            style={{ color: "var(--accent)" }}
                        >
                            {stats.total_gate_attempts}회
                        </p>
                    </div>
                </div>

                {/* 최근 풀이 히스토리 */}
                <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-5">
                    <h2 className="text-sm font-bold text-[var(--text-2)] mb-3">최근 풀이 히스토리</h2>

                    {stats.recent_submissions.length === 0 ? (
                        <p className="text-xs text-[var(--text-3)] text-center py-6">아직 풀이 기록이 없습니다.</p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {stats.recent_submissions.map((sub, idx) => (
                                // key로 idx를 쓴 이유: 백엔드가 submission의 고유 id를 안 내려주고 있어서
                                // 배열 인덱스로 대체함. 리스트 순서가 바뀌지 않는 "최근 기록" 특성상
                                // 인덱스를 key로 써도 실질적인 문제는 없음 (다만 원칙적으론 고유 id가 더 안전)
                                <div
                                    key={idx}
                                    onClick={() => router.push(`/learn/${sub.track}/${sub.problem_id}`)}
                                    className="flex items-center justify-between p-3 rounded-md cursor-pointer
                                        hover:bg-[var(--bg-3)] transition-colors"
                                >
                                    <div className="flex items-center gap-2.5">
                                        {/* 완료 여부에 따라 아이콘 색만 다르게 (완료=그린, 진행중=중립) */}
                                        <i
                                            className={`ti ${sub.gate_passed ? "ti-check" : "ti-clock"}`}
                                            style={{
                                                color: sub.gate_passed ? "var(--accent)" : "var(--text-3)",
                                                fontSize: "14px",
                                            }}
                                            aria-hidden="true"
                                        />
                                        <div>
                                            <p className="text-xs font-medium">{displayTitle(sub.title)}</p>
                                            <p
                                                className="text-[10px] mt-0.5"
                                                style={{ color: levelColorVar[sub.level] }}
                                            >
                                                {levelLabel[sub.level]} · {sub.concept_tag}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-[var(--text-2)]">
                                            {formatTime(sub.time_spent_sec)}
                                        </p>
                                        <p className="text-[10px] text-[var(--text-3)]">
                                            {formatDate(sub.submitted_at)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
