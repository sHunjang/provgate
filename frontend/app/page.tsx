"use client";

// useState: 컴포넌트 안에서 상태(데이터)를 관리하는 React Hook
// 상태가 바뀌면 컴포넌트가 자동으로 다시 렌더링됨
import { useState } from "react";

// Next.js의 라우터 - 페이지 이동에 사용
// Link 컴포넌트 대신 useRouter를 쓰는 이유:
// 버튼 클릭 후 데이터를 가지고 이동해야 하기 때문
import { useRouter } from "next/navigation";

// 수준 타입 정의 - TypeScript의 유니온 타입
// 이 3가지 문자열만 허용, 오타 방지
type level = "beginner" | "intermediate" | "advanced";

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

    // Next.js 라우터 인스턴스
    const router = useRouter();

    // 다음 단계로 이동하는 함수
    // 선택한 수준을 URL 쿼리 파라미터로 전달
    // ex: /onboarding/quiz?level=beginner
    const handleNext = () => {
        if (!selectedLevel) return;

        router.push(`/onboarding/quiz?level=${selectedLevel}`);
    };

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
            {/* 헤더 */}
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">ThinkCode</h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                    AI 힌트를 써도 이해를 강제하는 코딩 학습 플랫폼
                </p>
            </div>

            {/* 수준 선택 섹션 */}
            <div className="w-full max-w-3xl">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6 text-center">
                    현재 본인의 수준을 선택해주세요
                </h2>

                {/* 수준 카드 3개 - map()으로 배열을 JSX로 변환 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    {levels.map((level) => (
                        <button
                            key={level.id}
                            // 선택 여부에 따라 스타일 동적 변경
                            className={`p-6 rounded-xl border-2 transition-all cursor-pointer text-left
                ${
                    selectedLevel === level.id
                        ? level.selectedColor // 선택됨
                        : `border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${level.color}` // 미선택
                }`}
                            onClick={() => setSelectedLevel(level.id)}
                        >
                            <div className="text-4xl mb-3">{level.icon}</div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{level.title}</h3>
                            {/* whitespace-pre-line: \n을 줄바꿈으로 표시 */}
                            <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{level.description}</p>
                        </button>
                    ))}
                </div>

                {/* 다음 버튼 - 수준 선택 전에는 비활성화 */}
                <button
                    onClick={handleNext}
                    disabled={!selectedLevel}
                    className={`w-full py-4 rounded-xl font-semibold text-lg transition-all
            ${
                selectedLevel
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
                >
                    진단 퀴즈 시작하기 →
                </button>
            </div>
        </main>
    );
}
