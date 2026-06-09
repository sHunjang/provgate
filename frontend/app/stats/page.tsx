"use client";

// useState: 통계 데이터, 로딩 상태 관리
// useEffect: 컴포넌트 마운트 시 통계 API 호출
import { useState, useEffect } from "react";

// useRouter: 페이지 이동
import { useRouter } from "next/navigation";

// useAuth: 현재 로그인한 유저 정보
import { useAuth } from "@/app/hooks/useAuth";

// Supabase 세션에서 JWT Access Token을 발급 받기 위한 호출
import { createClient } from "@/app/lib/supabase";

// 통계 타입 정의
type Stats = {
    total_completed: number;
    beginner_completed: number;
    intermediate_completed: number;
    advanced_completed: number;

    // 레벨별 전체 문제 수
    beginner_total: number;
    intermediate_total: number;
    advanced_total: number;
    all_total: number;

    avg_time_sec: number;
    total_hints: number;
    total_gate_attempts: number;
    recent_submissions: {
        title: string;
        level: string;
        concept_tag: string;
        time_spent_sec: number;
        hint_count: number;
        gate_passed: boolean;
        submitted_at: string;
    }[];
};

// 난이도 한글 변환
const levelLabel: Record<string, string> = {
    beginner: "입문자",
    intermediate: "초급자",
    advanced: "중급자",
};

// 난이도별 색상
const levelColor: Record<string, string> = {
    beginner: "text-green-400",
    intermediate: "text-yellow-400",
    advanced: "text-blue-400",
};

// 초 → MM:SS 형식으로 변환
const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

// 날짜 포맷 변환
// "2024-01-01T12:00:00" → "2024.01.01"
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

    // 통계 데이터 상태
    const [stats, setStats] = useState<Stats | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 비로그인 시 로그인 페이지로 이동
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [authLoading, user, router]);

    // router를 의존성 배열에 넣는 이유?
    // useEffect 안에서 router를 사용하고 있는데
    // 의존성 배열에 없으면?
    // React 입장에서:
    // "router가 바뀔 수도 있는데
    //  내가 그걸 감지를 못하잖아!"
    //          ↓
    //       경고 발생

    // 통계 데이터 조회
    useEffect(() => {
        if (!user?.email) return;

        const fetchStats = async () => {
            try {
                setLoading(true);

                // Supabase 세션에서 JWT Access Token 가져오기
                const supabase = createClient();
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const token = session?.access_token;

                // 토큰이 없으면 로그인 페이지로 이동
                if (!token) {
                    router.push("/auth/login");
                    return;
                }

                // JWT 토큰을 Authorization 헤더에 포함해서 요청
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

    // 로딩 화면
    if (authLoading || loading) {
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <p className="text-gray-400">통계를 불러오는 중...</p>
            </main>
        );
    }

    if (!stats) return null;

    // 전체 문제 수 대비 완료 비율 계산
    // all_total: 백엔드에서 실제 problems 개수를 세서 내려준 값
    // (하드코딩하면 문제 추가 시마다 수정해야 하므로 동적으로 받음)
    const totalProblems = stats.all_total;

    // 분모가 0일 때 NaN 방지 (문제가 하나도 없는 극단적 상황 대비)
    // 0으로 나누면 JavaScript에서 NaN이 나오고 화면이 깨짐
    const completionRate = totalProblems > 0 ? Math.round((stats.total_completed / totalProblems) * 100) : 0;

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-8">
            <div className="max-w-4xl mx-auto">
                {/* 헤더 */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        {/* ProvGate 로고 - 클릭 시 홈으로 이동 */}
                        <button
                            onClick={() => router.push("/")}
                            className="text-indigo-500 font-bold text-sm mb-1 hover:text-indigo-400 transition-all"
                        >
                            ProvGate
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">학습 통계</h1>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                            {user?.email?.split("@")[0]}님의 학습 현황
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/problems")}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all"
                    >
                        문제 풀러 가기 →
                    </button>
                </div>

                {/* 전체 진행률 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-bold text-gray-700 dark:text-gray-300">전체 진행률</h2>
                        <span className="text-2xl font-bold text-indigo-400">{completionRate}%</span>
                    </div>

                    {/* 진행률 바 */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-3">
                        <div
                            className="bg-indigo-500 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${completionRate}%` }}
                        />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        전체 {totalProblems}문제 중 {stats.total_completed}문제 완료
                    </p>
                </div>

                {/* 난이도별 완료 현황 */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                        { key: "beginner", count: stats.beginner_completed, total: stats.beginner_total },
                        { key: "intermediate", count: stats.intermediate_completed, total: stats.intermediate_total },
                        { key: "advanced", count: stats.advanced_completed, total: stats.advanced_total },
                    ].map(({ key, count, total }) => (
                        <div
                            key={key}
                            className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 text-center"
                        >
                            <p className={`text-sm font-medium mb-2 ${levelColor[key]}`}>{levelLabel[key]}</p>
                            <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                                {count}
                                <span className="text-lg text-gray-400">/{total}</span>
                            </p>
                            {/* 난이도별 진행률 바 */}
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-3">
                                <div
                                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${total > 0 ? Math.round((count / total) * 100) : 0}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* 요약 통계 */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    {/* 평균 풀이 시간 */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">평균 풀이 시간</p>
                        <p className="text-2xl font-bold text-blue-400 font-mono">{formatTime(stats.avg_time_sec)}</p>
                    </div>

                    {/* 총 힌트 사용 */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">총 힌트 사용</p>
                        <p className="text-2xl font-bold text-yellow-400">{stats.total_hints}회</p>
                    </div>

                    {/* 총 게이트 시도 */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">총 게이트 시도</p>
                        <p className="text-2xl font-bold text-purple-400">{stats.total_gate_attempts}회</p>
                    </div>
                </div>

                {/* 최근 풀이 히스토리 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                    <h2 className="font-bold text-gray-700 dark:text-gray-300 mb-4">최근 풀이 히스토리</h2>

                    {stats.recent_submissions.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">아직 풀이 기록이 없습니다.</p>
                    ) : (
                        <div className="space-y-3">
                            {stats.recent_submissions.map((sub, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl"
                                >
                                    <div className="flex items-center gap-3">
                                        {/* 완료 여부 아이콘 */}
                                        <span>{sub.gate_passed ? "✅" : "⏳"}</span>
                                        <div>
                                            <p className="font-medium text-sm text-gray-900 dark:text-white">
                                                {sub.title}
                                            </p>
                                            <p className={`text-xs ${levelColor[sub.level]}`}>
                                                {levelLabel[sub.level]} · {sub.concept_tag}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {formatTime(sub.time_spent_sec)}
                                        </p>
                                        <p className="text-xs text-gray-400">{formatDate(sub.submitted_at)}</p>
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
