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

    // 초기 로드 완료 여부 추적
    // const hasFetchRef = useRef(false);

    // 이전 이메일 추적용 ref
    // const prevEmailRef = useRef<string>("");

    // 문제 목록 상태
    const [problems, setProblems] = useState<Problem[]>([]);

    // 완료된 문제 ID 목록
    // const [completedIds, setCompletedIds] = useState<string[]>([]);

    // 선택된 난이도 필터 (null이면 전체)
    const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    // 유저 확정 수준 조회 후 selectedLevel 초기값 설정
    useEffect(() => {
        const fetchUserLevel = async () => {
            if (!user?.email) return;

            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/user-level?email=${encodeURIComponent(user.email)}`,
                );

                if (!res.ok) return;

                const data = await res.json();

                // 온보딩 기록이 있으면 confirmed_level로 초기값 설정
                if (data.has_onboarding && data.confirmed_level) {
                    setSelectedLevel(data.confirmed_level);
                }
            } catch {
                console.error("유저 수준 조회 실패");
            }
        };

        fetchUserLevel();
    }, [user]);

    // 컴포넌트 마운트 시 문제 목록 API 호출 -> 초기 로드 + 난이도 변경 시 조회
    useEffect(() => {
        // 인증 로딩 중이면 대기
        if (authLoading) return;

        // const email = user?.email || "";

        // // 이메일이 같고 selectedLevel도 같으면 재조회 안 함
        // if (email === prevEmailRef.current && hasFetchRef.current) return;

        // // 난이도 필터 변경 시에는 항상 재조회
        // // 초기 로드 시에는 1번만 조회
        // prevEmailRef.current = email;
        // hasFetchRef.current = true;

        const fetchProblems = async () => {
            try {
                setLoading(true);

                // 난이도 필터 적용
                const level = selectedLevel || "beginner";

                // 이메일을 쿼리 파라미터로 전달 -> API 1번으로 완료 여부까지 조회
                const email = user?.email || "";
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/problems/${level}?email=${encodeURIComponent(email)}`,
                );

                if (!res.ok) throw new Error("문제 목록을 불러오지 못했습니다.");

                const data = await res.json();
                setProblems(data.problems);

                // 백엔드에서 완료 여부를 이미 포함해서 반환
                // is_completed 필드로 완료된 문제 ID 추출
                // const completed = data.problems
                //     .filter((p: Problem & { is_completed: boolean }) => p.is_completed)
                //     .map((p: Problem & { is_completed: boolean }) => p.id);

                // setCompletedIds(completed);
            } catch {
                setError("문제 목록을 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };

        fetchProblems();
    }, [selectedLevel, authLoading]);

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-8">
            <div className="max-w-4xl mx-auto">
                {/* 헤더 */}
                <div className="mb-8">
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
                                                <h2 className="font-semibold text-gray-900 dark:text-white">
                                                    {problem.title}
                                                </h2>
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
                                                {/* 난이도 뱃지 */}
                                                <span
                                                    className={`text-xs px-3 py-1 rounded-full font-medium
                        ${levelStyle[problem.level]}`}
                                                >
                                                    {problem.concept_tag}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 line-clamp-2">
                                            {problem.description}
                                        </p>
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
