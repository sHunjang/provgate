"use client";

import { Suspense } from "react";

// useEffect: 컴포넌트 렌더링 후 API 호출에 사용
// useState: 결과 데이터 상세 관리
import { useEffect, useState } from "react";

// useRouter: 페이지 이동
// useSearchParams: URL 쿼리 파라미터 읽기
import { useRouter, useSearchParams } from "next/navigation";

// 온보딩 완료 결과 타입 정의
type OnboardingResult = {
    email: string;
    declared_level: string;
    confirmed_level: string;
    score: number;
    total: number;
    ratio: number;
    roadmap: string[];
};

// 수준 한글 변환 - 딕셔너리로 O(1) 조회
const levelLabel: Record<string, string> = {
    beginner: "입문자",
    intermediate: "초급자",
    advanced: "중급자",
};

function ResultContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // URL 쿼리 파라미터에서 데이터 파싱
    const level = searchParams.get("level") || "beginner";
    const answers = JSON.parse(searchParams.get("answers") || "[]");
    const correctAnswers = JSON.parse(searchParams.get("correctAnswers") || "[]");

    // 결과 데이터 파싱
    const [result, setResult] = useState<OnboardingResult | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    // 컴포넌트 마운트 시 온보딩 완료 API 호출
    useEffect(() => {
        const completeOnboarding = async () => {
            try {
                setLoading(true);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/complete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        // 임시 이메일 - 나중에 인증 붙이면 교체
                        email: "test@test.com",
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
    }, []);

    // 로딩 화면
    if (loading) {
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
                <div className="text-center">
                    <div className="text-5xl mb-4">📊</div>
                    <p className="text-lg text-gray-600">결과를 분석하고 있어요...</p>
                </div>
            </main>
        );
    }

    // 에러 화면
    if (error) {
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
                <div className="text-center">
                    <div className="text-5xl mb-4">😢</div>
                    <p className="text-lg text-gray-600">{error}</p>
                    <button
                        onClick={() => router.push("/")}
                        className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg"
                    >
                        처음으로 돌아가기
                    </button>
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

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-2xl">
                {/* 점수 카드 */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm mb-6 text-center">
                    <div className="text-5xl mb-4">
                        {result!.ratio >= 80 ? "🎉" : result!.ratio >= 40 ? "👍" : "💪"}
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">진단 완료!</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        5문항 중 <span className="font-bold text-indigo-600">{result!.score}개</span> 정답 (
                        {result!.ratio}%)
                    </p>

                    {/* 수준 확정 결과 */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-4">
                        {levelUp ? (
                            <>
                                <p className="text-sm text-gray-500 mb-1">선택하신 수준보다 실력이 더 높으시네요! 🚀</p>
                                <p className="text-lg font-bold text-indigo-700">
                                    {levelLabel[result!.declared_level]} → {levelLabel[result!.confirmed_level]}
                                </p>
                            </>
                        ) : levelDown ? (
                            <>
                                <p className="text-sm text-gray-500 mb-1">조금 더 기초부터 다져보아요! 💪</p>
                                <p className="text-lg font-bold text-indigo-700">
                                    {levelLabel[result!.declared_level]} → {levelLabel[result!.confirmed_level]}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-500 mb-1">확정된 학습 수준</p>
                                <p className="text-lg font-bold text-indigo-700">
                                    {levelLabel[result!.confirmed_level]}
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* 로드맵 카드 */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm mb-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">📚 학습 로드맵</h2>
                    <div className="space-y-3">
                        {result!.roadmap.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3"
                            >
                                {/* 순서 번호 */}
                                <span className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
                                    {idx + 1}
                                </span>
                                <span className="text-gray-700">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 시작 버튼 */}
                <button
                    onClick={() => router.push("/problems")}
                    className="w-full py-4 bg-indigo-600 text-white rounded-xl
            font-semibold text-lg hover:bg-indigo-700 transition-all"
                >
                    학습 시작하기 →
                </button>
            </div>
        </main>
    );
}

export default function ResultPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                    <p className="text-gray-600 dark:text-gray-400" />
                </main>
            }
        >
            <ResultContent />
        </Suspense>
    );
}
