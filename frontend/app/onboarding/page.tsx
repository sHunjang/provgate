"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import SiteNav from "@/app/components/SiteNav";

// 수준 타입 정의 - TypeScript의 유니온 타입
// 이 3가지 문자열만 허용, 오타 방지
type Level = "beginner" | "intermediate" | "advanced";

// 수준 카드 데이터 - 배열로 관리하면 UI 추가/수정이 쉬움
// 원래 홈 화면에 있던 levels 배열을 그대로 옮겨오되, 색상만 새 팔레트로 교체
const levels: {
    id: Level;
    title: string;
    description: string;
    icon: string;
    dot: string;
    bg: string;
}[] = [
    {
        id: "beginner",
        title: "입문자",
        description: "파이썬을 처음 배우거나\n기초 문법을 막 익힌 단계",
        icon: "🌱",
        dot: "var(--accent)",
        bg: "var(--accent-bg)",
    },
    {
        id: "intermediate",
        title: "초급자",
        description: "변수, 조건문, 반복문을 알고\n함수와 리스트를 다룰 수 있는 단계",
        icon: "🔥",
        dot: "var(--accent2)",
        bg: "var(--accent2-bg)",
    },
    {
        id: "advanced",
        title: "중급자",
        description: "클래스, 재귀, 알고리즘 기초를 알고\n실무 경험이 있는 단계",
        icon: "⚡️",
        dot: "var(--accent3)",
        bg: "var(--accent3-bg)",
    },
];

export default function OnboardingLevelSelectPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    // 선택한 수준 상태 - null이면 아직 아무것도 선택 안 함
    const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);

    // 진단 시작 버튼 클릭
    const handleStart = () => {
        if (!selectedLevel) return;
        router.push(`/onboarding/quiz?level=${selectedLevel}`);
    };

    // 인증 확인이 끝났는데 비로그인 상태면 로그인 페이지로
    // (진단 결과 저장에 user_id가 필요하므로, 이 단계에서 미리 걸러줌)
    if (!authLoading && !user) {
        router.push("/auth/login");
        return null;
    }

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <SiteNav />

            <div className="max-w-2xl mx-auto px-6 py-14">
                <div className="text-center mb-10">
                    <p className="text-[10px] tracking-widest uppercase text-[var(--text-3)] mb-3">진단하기</p>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">현재 본인의 수준을 선택해주세요</h1>
                    <p className="text-sm text-[var(--text-2)]">선택한 수준에 맞춰 AI가 진단 문제를 생성해요</p>
                </div>

                {/* 수준 카드 3개 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                    {levels.map((level) => (
                        <button
                            key={level.id}
                            onClick={() => setSelectedLevel(level.id)}
                            className="p-5 rounded-md border-2 text-left transition-all"
                            style={
                                selectedLevel === level.id
                                    ? { borderColor: level.dot, background: level.bg }
                                    : { borderColor: "var(--border-c)", background: "var(--bg-2)" }
                            }
                        >
                            <div className="text-3xl mb-3">{level.icon}</div>
                            <h3 className="text-sm font-bold mb-1.5">{level.title}</h3>
                            <p className="text-xs text-[var(--text-2)] whitespace-pre-line leading-relaxed">
                                {level.description}
                            </p>
                        </button>
                    ))}
                </div>

                {/* 진단 시작하기 버튼 */}
                <button
                    onClick={handleStart}
                    disabled={!selectedLevel}
                    className="w-full py-3.5 rounded-md font-semibold text-sm transition-all"
                    style={
                        selectedLevel
                            ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                            : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                    }
                >
                    {selectedLevel ? "진단 시작하기 →" : "위에서 수준을 선택해주세요"}
                </button>
            </div>
        </main>
    );
}
