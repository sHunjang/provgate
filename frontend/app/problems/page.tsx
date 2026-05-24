"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// useAuth: 현재 로그인한 유저 정보 가져오기
import { useAuth } from "../hooks/useAuth";

// 문제 타입 정의
type Problem = {
    id: string;
    title: string;
    description: string;
    level: string;
    concept_tag: string;
    order_idx: number;
    status: "not_started" | "in_progress" | "completed";
    is_completed: boolean;
};

// 난이도별 스타일 - 딕셔너리로 O(1) 조회
const levelStyle: Record<string, string> = {
    beginner: "bg-green-900 text-green-300",
    intermediate: "bg-yellow-900 text-yellow-300",
    advanced: "bg-blue-900 text-blue-300",
};

// 난이도 한글 변환
const levelLabel: Record<string, string> = {
    beginner: "입문자",
    intermediate: "초급자",
    advanced: "중급자",
};

export default function ProblemPage() {
    const router = useRouter();

    // 현재 로그인한 유저 정보
    const { user, loading: authLoading } = useAuth();

    // 문제 목록 상태
    const [problems, setProblems] = useState<Problem[]>([]);

    // 선택된 난이도 필터 (null이면 전체)
    const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    // 초기화 완료 여부 플래그
    // true가 되면 두 번째 useEffect가 동작
    const [initialized, setInitialized] = useState(false);

    // 초기 로드: 유저 수준 조회 후 문제 목록 한 번에 가져오기
    // 기존에는 fetchUserLevel → selectedLevel 변경 → fetchProblems 순서로
    // API가 3~4번 중복 호출되는 문제가 있었음
    // 개선: 유저 수준 조회 + 문제 목록 조회를 하나의 useEffect로 통합
    // user.email이 변경될 때만 실행 (로그인/로그아웃 시)
    useEffect(() => {
        // 인증 로딩 중이면 대기
        // authLoading이 false가 된 후 user 정보 확정되면 실행
        if (authLoading) return;

        const initialize = async () => {
            try {
                setLoading(true);
                const email = user?.email || "";

                // 기본 난이도는 beginner
                // 로그인 유저면 확정 수준으로 덮어씀
                let level = "beginner";

                // 로그인 유저면 확정 수준 먼저 조회
                // 비로그인이면 스킵 (beginner로 기본값 사용)
                if (email) {
                    const levelRes = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/user-level?email=${encodeURIComponent(email)}`,
                    );
                    if (levelRes.ok) {
                        const levelData = await levelRes.json();
                        // 온보딩 기록이 있으면 confirmed_level로 초기값 설정
                        if (levelData.has_onboarding && levelData.confirmed_level) {
                            level = levelData.confirmed_level;
                        }
                    }
                }

                // selectedLevel 업데이트 (난이도 필터 버튼 UI 반영)
                setSelectedLevel(level);

                // 문제 목록 조회
                // 이메일을 쿼리 파라미터로 전달 → API 1번으로 완료 여부까지 조회
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/problems/${level}?email=${encodeURIComponent(email)}`,
                );
                if (!res.ok) throw new Error("문제 목록을 불러오지 못했습니다.");
                const data = await res.json();
                setProblems(data.problems);

                // 초기화 완료 표시
                setInitialized(true);
            } catch {
                setError("문제 목록을 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, [user?.email, authLoading]); // user.email 변경 시에만 실행 (로그인/로그아웃)

    // 난이도 필터 변경 시에만 문제 목록 재조회
    // 초기 로드는 위 useEffect에서 처리하므로
    // selectedLevel이 null이면 스킵 (초기값 설정 전)
    useEffect(() => {
        if (!initialized || !selectedLevel) return;

        const fetchProblems = async () => {
            try {
                setLoading(true);

                // 이메일을 쿼리 파라미터로 전달 → API 1번으로 완료 여부까지 조회
                const email = user?.email || "";
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/problems/${selectedLevel}?email=${encodeURIComponent(email)}`,
                );

                if (!res.ok) throw new Error("문제 목록을 불러오지 못했습니다.");

                const data = await res.json();
                setProblems(data.problems);
            } catch {
                setError("문제 목록을 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };

        fetchProblems();
        // 난이도 필터 변경 시에만 문제 목록 재조회
        // initialized, user?.email을 의존성에서 제외하는 이유:
        // - initialized: 초기화 완료 체크용 플래그로 변경 감지 불필요
        // - user?.email: 초기 로드 useEffect에서 이미 처리
        // 두 값 모두 추가하면 중복 API 호출 발생
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLevel]); // selectedLevel 변경 시에만 실행 (난이도 필터 버튼 클릭)

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-8">
            <div className="max-w-4xl mx-auto">
                {/* 헤더 */}
                <div className="mb-8">
                    {/* ProvGate 로고 - 클릭 시 홈으로 이동 */}
                    <button
                        onClick={() => router.push("/")}
                        className="text-indigo-500 font-bold text-sm mb-3 hover:text-indigo-400 transition-all"
                    >
                        ProvGate
                    </button>
                    <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">문제 목록</h1>
                    <p className="text-gray-500 dark:text-gray-400">수준에 맞는 문제를 선택해서 풀어보세요</p>
                </div>

                {/* 난이도 필터 */}
                <div className="flex gap-3 mb-8">
                    {["beginner", "intermediate", "advanced"].map((level) => (
                        <button
                            key={level}
                            onClick={() => setSelectedLevel(level)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                                ${
                                    selectedLevel === level
                                        ? levelStyle[level]
                                        : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
                                }`}
                        >
                            {levelLabel[level]}
                        </button>
                    ))}
                </div>

                {/* 로딩 */}
                {loading && (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">문제를 불러오는 중...</div>
                )}

                {/* 에러 */}
                {error && <div className="text-center py-20 text-red-400">{error}</div>}

                {/* 문제 목록 */}
                {!loading && !error && (
                    <div className="space-y-4">
                        {problems.length === 0 ? (
                            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                                아직 문제가 없습니다.
                            </div>
                        ) : (
                            problems.map((problem, idx) => {
                                // 완료된 문제 여부 확인
                                const isCompleted = problem.status === "completed";
                                const isInProgress = problem.status === "in_progress";
                                return (
                                    <div
                                        key={problem.id}
                                        onClick={() => router.push(`/problems/${problem.id}`)}
                                        className={`bg-white dark:bg-gray-800 rounded-xl p-6 cursor-pointer
                                            hover:bg-gray-50 dark:hover:bg-gray-700 transition-all
                                            border hover:border-indigo-500
                                            ${
                                                isCompleted
                                                    ? "border-green-400 dark:border-green-600"
                                                    : isInProgress
                                                      ? "border-yellow-400 dark:border-yellow-600"
                                                      : "border-gray-200 dark:border-gray-700"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                {/* 상태에 따라 아이콘 변경 */}
                                                {isCompleted ? (
                                                    <span className="text-green-500 text-lg">✅</span>
                                                ) : isInProgress ? (
                                                    <span className="text-yellow-500 text-lg">⏳</span>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500 font-mono text-sm">
                                                        #{String(idx + 1).padStart(2, "0")}
                                                    </span>
                                                )}
                                                <div>
                                                    {/* 문제 제목 */}
                                                    <h2 className="font-semibold text-gray-900 dark:text-white">
                                                        {problem.title}
                                                    </h2>
                                                    {/* 난이도 + 개념 태그 */}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span
                                                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelStyle[problem.level]}`}
                                                        >
                                                            {levelLabel[problem.level]}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {problem.concept_tag}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {/* 상태 뱃지 */}
                                                {isCompleted && (
                                                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium">
                                                        완료
                                                    </span>
                                                )}
                                                {isInProgress && (
                                                    <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 font-medium">
                                                        진행 중
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
