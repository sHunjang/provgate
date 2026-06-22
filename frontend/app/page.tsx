"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./hooks/useAuth";

// 수준 타입 정의 - TypeScript의 유니온 타입
// 이 3가지 문자열만 허용, 오타 방지
type level = "beginner" | "intermediate" | "advanced";

// 모드 타입 정의
// null: 아무것도 선택 안 된 상태
// "diagnose": 진단하기 선택
// "practice": 문제 풀기 선택
type Mode = "diagnose" | "practice" | null;

// 수준 카드 데이터 - 배열로 관리하면 UI 추가/수정이 쉬움
const levels = [
    {
        id: "beginner" as level,
        title: "입문자",
        description: "파이썬을 처음 배우거나\n기초 문법을 막 익힌 단계",
        icon: "🌱",
        color: "border-green-400 hover:bg-green-50",
        selectedColor: "border-green-400 bg-green-50",
    },
    {
        id: "intermediate" as level,
        title: "초급자",
        description: "변수, 조건문, 반복문을 알고\n함수와 리스트를 다룰 수 있는 단계",
        icon: "🔥",
        color: "border-yellow-400 hover:bg-yellow-50",
        selectedColor: "border-yellow-400 bg-yellow-50",
    },
    {
        id: "advanced" as level,
        title: "중급자",
        description: "클래스, 재귀, 알고리즘 기초를 알고\n실무 경험이 있는 단계",
        icon: "⚡️",
        color: "border-blue-400 hover:bg-blue-50",
        selectedColor: "border-blue-400 bg-blue-50",
    },
];

// useSearchParams를 쓰는 실제 컴포넌트를 분리
// Next.js 14 규칙: useSearchParams()는 반드시 Suspense 경계 안에서만 사용 가능
// 이유: 서버사이드 렌더링(SSR) 중에 useSearchParams()가 호출되면
//       빌드 타임에 에러가 발생하기 때문
// 해결: 실제 로직을 HomeContent로 분리하고,
//       Home(export default)에서 Suspense로 감싸서 클라이언트에서만 실행되도록 보장
// 참고: onboarding/quiz/page.tsx, onboarding/result/page.tsx와 동일한 패턴
function HomeContent() {
    // 선택한 수준 상태 - null이면 아무것도 선택 안 된 상태
    const [selectedLevel, setSelectedLevel] = useState<level | null>(null);

    // 현재 선택된 모드 (진단 or 문제 풀기)
    const [mode, setMode] = useState<Mode>(null);

    // Next.js 라우터 인스턴스 - 페이지 이동에 사용
    const router = useRouter();

    // 현재 로그인한 유저 정보
    // user가 null이면 비로그인 상태
    const { user } = useAuth();

    // URL 쿼리 파라미터 읽기
    // problems/page.tsx에서 온보딩 안 한 사용자를 /?needOnboarding=true로 리디렉션
    // 이 값이 있으면 "진단하기를 먼저 해주세요" 안내 메시지를 표시
    const searchParams = useSearchParams();
    const needOnboarding = searchParams.get("needOnboarding");

    // 시작 버튼 핸들러
    const handleStart = () => {
        if (mode === "practice") {
            // 문제 풀기는 로그인 없어도 목록 볼 수 있음
            // (problems/page.tsx에서 온보딩 여부를 체크해서 리디렉션)
            router.push("/problems");
            return;
        }

        // 진단하기는 로그인 필요
        if (!user) {
            router.push("/auth/login");
            return;
        }

        if (mode === "diagnose" && selectedLevel) {
            router.push(`/onboarding/quiz?level=${selectedLevel}`);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
            {/* 헤더 */}
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Provgate</h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">AI와 함께, 이해는 스스로</p>
            </div>

            {/* 온보딩 안내 메시지 */}
            {/* problems/page.tsx에서 진단 안 한 사용자를 리디렉션할 때만 표시 */}
            {/* 사용자가 "왜 홈으로 돌아왔는지" 이유를 바로 알 수 있도록 안내 */}
            {needOnboarding && (
                <div
                    className="mb-6 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20
                    border border-yellow-300 dark:border-yellow-700 rounded-xl text-center
                    w-full max-w-3xl"
                >
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
                        📋 문제 풀기 전에 먼저 진단하기를 완료해주세요
                    </p>
                </div>
            )}

            <div className="w-full max-w-3xl">
                {/* 모드 선택 */}
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6 text-center">
                    무엇을 하실건가요?
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {/* 진단하기 카드 */}
                    <button
                        onClick={() => {
                            setMode("diagnose");
                            setSelectedLevel(null);
                        }}
                        className={`p-6 rounded-xl border-2 transition-all text-left
                            ${
                                mode === "diagnose"
                                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300"
                            }`}
                    >
                        <div className="text-4xl mb-3">🎯</div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">진단하기</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            AI가 나의 Python 실력을 진단하고{"\n"}맞춤 학습 수준을 추천해드려요
                        </p>
                    </button>

                    {/* 문제 풀기 카드 */}
                    <button
                        onClick={() => {
                            setMode("practice");
                            setSelectedLevel(null);
                        }}
                        className={`p-6 rounded-xl border-2 transition-all text-left
                            ${
                                mode === "practice"
                                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300"
                            }`}
                    >
                        <div className="text-4xl mb-3">💻</div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">문제 풀기</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            바로 문제 목록으로 이동해서{"\n"}코딩 문제를 풀어보세요
                        </p>
                    </button>
                </div>

                {/* 진단 모드일 때 수준 선택 */}
                {mode === "diagnose" && (
                    <div className="mb-8">
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
                            현재 본인의 수준을 선택해주세요
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {levels.map((level) => (
                                <button
                                    key={level.id}
                                    onClick={() => setSelectedLevel(level.id)}
                                    className={`p-6 rounded-xl border-2 transition-all text-left
                                        ${
                                            selectedLevel === level.id
                                                ? level.selectedColor
                                                : `border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${level.color}`
                                        }`}
                                >
                                    <div className="text-4xl mb-3">{level.icon}</div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                        {level.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                                        {level.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 비로그인 안내 */}
                {!user && mode === "diagnose" && (
                    <p className="text-center text-sm text-red-500 mb-3">🔐 진단하기는 로그인이 필요해요</p>
                )}

                {/* 시작 버튼 */}
                <button
                    onClick={handleStart}
                    disabled={!mode || (mode === "diagnose" && !selectedLevel)}
                    className={`w-full py-4 rounded-xl font-semibold text-lg transition-all
                        ${
                            !mode || (mode === "diagnose" && !selectedLevel)
                                ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                                : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                        }`}
                >
                    {mode === "practice"
                        ? "문제 풀러 가기 →"
                        : !user && mode === "diagnose"
                          ? "로그인 후 진단하기 🔐"
                          : mode === "diagnose" && selectedLevel
                            ? "진단 시작하기 →"
                            : "위에서 선택해주세요"}
                </button>
            </div>
        </main>
    );
}

// Suspense로 HomeContent를 감싸서 export
// Next.js 14: useSearchParams()를 쓰는 컴포넌트는 반드시 Suspense 경계 필요
// Suspense가 없으면 빌드 타임에 "useSearchParams() should be wrapped in a suspense boundary" 에러 발생
// fallback: HomeContent가 로드되기 전 잠깐 보여줄 로딩 화면
export default function Home() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                    <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
                </main>
            }
        >
            <HomeContent />
        </Suspense>
    );
}
