"use client";

// useState: 컴포넌트 안에서 상태(데이터)를 관리하는 React Hook
// 상태가 바뀌면 컴포넌트가 자동으로 다시 렌더링됨
import { useState } from "react";

// Next.js의 라우터 - 페이지 이동에 사용
// Link 컴포넌트 대신 useRouter를 쓰는 이유:
// 버튼 클릭 후 데이터를 가지고 이동해야 하기 때문
import { useRouter } from "next/navigation";

// useAuth: 현재 로그인한 유저 정보를 가져오는 커스텀 훅
// user가 null이면 비로그인 상태
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

export default function Home() {
    //선택한 수준 상태 - null 이면 아무것도 선택 안 된 상태
    const [selectedLevel, setSelectedLevel] = useState<level | null>(null);

    // 현재 선택된 모드 (진단 or 문제 풀기)
    const [mode, setMode] = useState<Mode>(null);

    // Next.js 라우터 인스턴스
    const router = useRouter();

    // 현재 로그인한 유저 정보
    // user가 null이면 비로그인 상태
    const { user } = useAuth();

    // 시작 버튼 핸들러
    const handleStart = () => {
        // 비로그인 시 로그인 페이지로
        if (!user) {
            router.push("/auth/login");
            return;
        }

        if (mode === "practice") {
            // 문제 풀기 -> 문제 목록으로 바로 이동
            router.push("/problems");
        } else if (mode === "diagnose" && selectedLevel) {
            // 진단하기 -> 퀴즈 페이지로 이동
            router.push(`/onboarding/quiz?level=${selectedLevel}`);
        }
    };

    // 다음 단계로 이동하는 함수
    // 선택한 수준을 URL 쿼리 파라미터로 전달
    // ex: /onboarding/quiz?level=beginner
    // const handleNext = () => {
    //     if (!selectedLevel) return;

    //     // 비로그인 상태면 로그인 페이지로 이동
    //     if (!user) {
    //         router.push("/auth/login");
    //         return;
    //     }

    //     router.push(`/onboarding/quiz?level=${selectedLevel}`);
    // };

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
            {/* 헤더 */}
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Provgate</h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">AI와 함께, 이해는 스스로</p>
            </div>

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
                {!user && mode && <p className="text-center text-sm text-red-500 mb-3">🔐 로그인이 필요해요</p>}

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
                    {!user && mode
                        ? "로그인 후 시작하기 🔐"
                        : mode === "practice"
                          ? "문제 풀러 가기 →"
                          : mode === "diagnose" && selectedLevel
                            ? "진단 시작하기 →"
                            : "위에서 선택해주세요"}
                </button>
            </div>
        </main>
    );
}
