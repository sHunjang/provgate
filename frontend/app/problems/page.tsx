"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 문제 타입 정의
type Problem = {
    id: string;
    title: string;
    description: string;
    level: string;
    concept_tag: string;
    order_idx: number;
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

    // 문제 목록 상태
    const [problems, setProblems] = useState<Problem[]>([]);

    // 선택된 난이도 필터 (null이면 전체)
    const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    // 컴포넌트 마운트 시 문제 목록 API 호출
    useEffect(() => {
        const fetchProblems = async () => {
            try {
                setLoading(true);

                // 난이도 필터 적용
                const level = selectedLevel || "beginner";
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/problems/${level}`);

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
    }, [selectedLevel]);

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
                            problems.map((problem, idx) => (
                                <div
                                    key={problem.id}
                                    onClick={() => router.push(`/problems/${problem.id}`)}
                                    className="bg-white dark:bg-gray-800 rounded-xl p-6 cursor-pointer
                                        hover:bg-gray-50 dark:hover:bg-gray-700 transition-all
                                        border border-gray-200 dark:border-gray-700
                                        hover:border-indigo-500"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            {/* 문제 번호 */}
                                            <span className="text-gray-400 dark:text-gray-500 font-mono text-sm">
                                                #{String(idx + 1).padStart(2, "0")}
                                            </span>
                                            {/* 문제 제목 */}
                                            <h2 className="font-semibold text-gray-900 dark:text-white">
                                                {problem.title}
                                            </h2>
                                        </div>
                                        {/* 난이도 뱃지 */}
                                        <span
                                            className={`text-xs px-3 py-1 rounded-full font-medium
                                            ${levelStyle[problem.level]}`}
                                        >
                                            {problem.concept_tag}
                                        </span>
                                    </div>
                                    {/* 문제 설명 미리보기 */}
                                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 line-clamp-2">
                                        {problem.description}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
