"use client";

// useState: 유사 문제 데이터, 로딩 상태 관리
// useEffect: 컴포넌트 마운트 시 유사 문제 생성 API 호출
import { useState, useEffect } from "react";

// useParams: URL의 동적 파라미터 읽기 (/feedback/[id] -> id)
// useSearchParams: URL 쿼리 파라미터 읽기 (stats, level)
// useRouter: 페이지 이동
import { useParams, useSearchParams, useRouter } from "next/navigation";

// useAuth: 현재 로그인한 유저 정보 가져오기
// similar-problem API가 "누구 전용으로 문제를 저장할지" 알아야 해서 필요해짐
import { useAuth } from "@/app/hooks/useAuth";

// 유사 문제 타입 정의
type SimilarProblem = {
    // 신규: 백엔드가 DB에 저장한 후 발급한 실제 문제 ID
    // 이 값이 있어야 "이 문제 도전하기" 버튼이 실제 문제 페이지로 이동 가능
    id: string;
    title: string;
    description: string;
    concept_tag: string;
    level: string;
    test_cases: { input: string; output: string }[];
    starter_code: string;
    // hint_1: string;
    // hint_2: string;
    // hint_3: string;
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

    // 현재 로그인한 유저 정보
    // similar-problem 생성 요청 시 email을 같이 보내야
    // 백엔드가 "이 문제는 이 사용자 전용"으로 저장할 수 있음
    const { user } = useAuth();

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

    // 신규: 이미 유사 문제 생성을 요청했는지 여부
    // useAuth()의 user 객체가 렌더링마다 새 참조로 바뀔 수 있어서,
    // useEffect의 의존성 배열에 user를 넣으면 의도치 않게 여러 번 실행될 위험이 있음
    // (오늘 발견한 Supabase lock 경합 버그와 같은 "중복 실행" 계열 문제)
    // 이 플래그로 "한 번 요청했으면 더 이상 안 함"을 보장해서,
    // AI가 같은 화면에서 문제를 여러 개 중복 생성하는 것을 막음
    const [hasFetched, setHasFetched] = useState(false);

    // 컴포넌트 마운트 시 유사 문제 생성
    useEffect(() => {
        // user 정보가 아직 로딩 중(null)이면 기다림
        // 이미 요청을 보냈으면(hasFetched) 다시 보내지 않음
        if (!user || hasFetched) return;

        const fetchSimilarProblem = async () => {
            try {
                setLoading(true);

                // 요청 시작 시점에 바로 플래그를 세팅
                // (fetch가 끝나기 전에 useEffect가 다시 실행되더라도
                //  이 시점 이후로는 if (!user || hasFetched) 에서 즉시 걸러짐)
                setHasFetched(true);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/similar-problem`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        problem_id: problemId,
                        level,
                        // 신규: 이 문제를 받을 사용자 이메일
                        // 백엔드가 이 값으로 user_id를 조회해서 owner_user_id로 저장함
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
                                // 신규: 백엔드가 DB에 즉시 저장한 problem_id로 실제 라우팅
                                // 이 문제는 owner_user_id로 현재 사용자에게만 연결되어 있어서
                                // 다른 사람의 문제 목록에는 노출되지 않음 (개인 전용)
                                onClick={() => router.push(`/problems/${similarProblem.id}`)}
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
