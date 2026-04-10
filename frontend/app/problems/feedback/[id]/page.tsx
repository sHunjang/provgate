"use client";

// useState: 유사 문제 데이터, 로딩 상태 관리
// useEffect: 컴포넌트 마운트 시 유사 문제 생성 API 호출
import { useState, useEffect } from "react";

// useParams: URL의 동적 파라미터 읽기 (/feedback/[id] -> id)
// useSearchParams: URL 쿼리 파라미터 읽기 (stats, level)
// useRouter: 페이지 이동
import { useParams, useSearchParams, useRouter } from "next/navigation";

// 유사 문제 타입 정의
type SimilarProblem = {
    title: string;
    description: string;
    concept_tag: string;
    level: string;
    test_cases: { input: string; output: string }[];
    starter_code: string;
    hint_1: string;
    hint_2: string;
    hint_3: string;
};

// 통계 타입 정의
type Stats = {
    hint_count: number;
    gate_attempts: number;
    time_spent_sec: number;
};

export default function FeedbackPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    // URL 쿼리 파라미터에서 통계와 수준 가져오기
    const problemId = params.id as string;
    const level = searchParams.get("level") || "beginner";
    const stats: Stats = JSON.parse(
        searchParams.get("stats") || '{"hint_count": 0, "gate_attempts":0, "time_spent_sec": 0}',
    );

    // 유사 문제 데이터 상태
    const [similarProblem, setSimilarProblem] = useState<SimilarProblem | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 컴포넌트 마운트 시 유사 문제 생성
    useEffect(() => {
        const fetchSimilarProblem = async () => {
            try {
                setLoading(true);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/similar-problem`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        problem_id: problemId,
                        level,
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
    }, [problemId, level]);

    // 시간 포맷 변환 함수
    // 120초 -> "2분 0초"
    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}분 ${sec}초`;
    };

    // 힌트 사용 평가
    // 힌트를 적게 쓸수록 좋음
    const getHintEval = (count: number) => {
        if (count == 0) return { text: "힌트 없이 해결! 🏆", color: "text-yellow-400" };
        if (count <= 1) return { text: "힌트 최소화 👍", color: "text-green-400" };
        if (count <= 2) return { text: "힌트 조금 사용", color: "text-blue-400" };
        return { text: "힌트 많이 사용 💪", color: "text-gray-400" };
    };

    const hintEval = getHintEval(stats.hint_count);

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-8">
            <div className="max-w-2xl mx-auto">
                {/* 헤더 */}
                <div className="text-center mb-10">
                    <div className="text-6xl mb-4">🎉</div>
                    <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">제출 완료!</h1>
                    <p className="text-gray-500 dark:text-gray-400">수고했어요! 결과를 확인해보세요.</p>
                </div>

                {/* 통계 카드 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">📊 풀이 통계</h2>
                    <div className="grid grid-cols-3 gap-4">
                        {/* 힌트 사용 횟수 */}
                        <div className="text-center p-4 bg-gray-100 dark:bg-gray-700 rounded-xl">
                            <p className="text-3xl font-bold text-indigo-400 mb-1">{stats.hint_count}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">힌트 사용</p>
                            <p className={`text-xs mt-1 ${hintEval.color}`}>{hintEval.text}</p>
                        </div>

                        {/* 게이트 시도 횟수 */}
                        <div className="text-center p-4 bg-gray-100 dark:bg-gray-700 rounded-xl">
                            <p className="text-3xl font-bold text-purple-400 mb-1">{stats.gate_attempts}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">게이트 시도</p>
                            <p
                                className={`text-xs mt-1 ${
                                    stats.gate_attempts <= 1 ? "text-green-400" : "text-gray-400"
                                }`}
                            >
                                {stats.gate_attempts <= 1 ? "한 번에 통과! 🎯" : "재시도 후 통과"}
                            </p>
                        </div>

                        {/* 소요 시간 */}
                        <div className="text-center p-4 bg-gray-100 dark:bg-gray-700 rounded-xl">
                            <p className="text-3xl font-bold text-blue-400 mb-1">
                                {Math.floor(stats.time_spent_sec / 60)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">분 소요</p>
                            <p className="text-xs mt-1 text-gray-400">{formatTime(stats.time_spent_sec)}</p>
                        </div>
                    </div>
                </div>

                {/* 유사 문제 추천 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">🔥 다음 도전 문제</h2>

                    {loading ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500 dark:text-gray-400">AI가 맞춤 문제를 생성하고 있어요...</p>
                        </div>
                    ) : similarProblem ? (
                        <div>
                            {/* 문제 정보 */}
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-xs px-3 py-1 rounded-full bg-indigo-900 text-indigo-300">
                                    {similarProblem.concept_tag}
                                </span>
                                <span className="text-xs px-3 py-1 rounded-full bg-green-900 text-green-300">
                                    {similarProblem.level}
                                </span>
                            </div>

                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                                {similarProblem.title}
                            </h3>

                            <p className="text-gray-500 dark:text-gray-400 text-sm whitespace-pre-wrap mb-4">
                                {similarProblem.description}
                            </p>

                            {/* 테스트 케이스 미리보기 */}
                            <div className="bg-gray-100 dark:bg-gray-700 rounded-xl p-4 mb-4">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">예제 입출력</p>
                                {similarProblem.test_cases.slice(0, 2).map((tc, idx) => (
                                    <div
                                        key={idx}
                                        className="flex gap-4 text-sm mb-2"
                                    >
                                        <div className="flex-1">
                                            <span className="text-gray-500 text-xs">입력: </span>
                                            <code className="text-green-600 dark:text-green-300">{tc.input}</code>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-gray-500 text-xs">출력: </span>
                                            <code className="text-blue-600 dark:text-blue-300">{tc.output}</code>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 도전하기 버튼 */}
                            <button
                                // 수정 전
                                // onClick={() => {
                                //     // 유사 문제를 sessionStorage에 저장 후 에디터로 이동
                                //     sessionStorage.setItem("similarProblem", JSON.stringify(similarProblem));
                                //     router.push("/problems/similar");
                                // }}
                                // 수정 후 - sessionStorage에 저장하고 에디터 페이지에서 불러오는 방식 대신
                                // 피드백 페이지에서 직접 유사 문제를 보여주는 방식으로 변경
                                // 일단 버튼 클릭 시 문제 목록으로 이동
                                onClick={() => router.push("/problems")}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl
                                    font-semibold hover:bg-indigo-700 transition-all"
                            >
                                이 문제 도전하기 →
                            </button>
                        </div>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                            유사 문제를 불러올 수 없습니다.
                        </p>
                    )}
                </div>

                {/* 하단 버튼 */}
                <button
                    onClick={() => router.push("/problems")}
                    className="w-full py-3 bg-gray-200 dark:bg-gray-700 text-gray-600
                        dark:text-gray-300 rounded-xl font-semibold
                        hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                >
                    문제 목록으로 돌아가기
                </button>
            </div>
        </main>
    );
}
