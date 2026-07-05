"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import SiteNav from "@/app/components/SiteNav";

// 신규: 공통 레벨 매핑 사용
// 기존엔 이 파일 안에 levels 배열을 직접 정의했었는데,
// 이름/색상을 한 곳(levelMeta.ts)에서 관리하도록 옮김
import { LEVEL_META, LEVEL_ORDER, type Level } from "@/app/lib/levelMeta";

// 레벨별 아이콘은 이 페이지(카드 UI)에서만 쓰는 시각 요소라
// levelMeta.ts로 옮기지 않고 여기 로컬로 둠
// (levelMeta는 "이름/색"처럼 여러 페이지가 공유하는 것만 담당)
const levelIcon: Record<Level, string> = {
    beginner: "🌱",
    intermediate: "🔥",
    advanced: "⚡️",
};

// 레벨별 설명 문구도 이 페이지 전용이라 로컬로 유지
const levelDescription: Record<Level, string> = {
    beginner: "파이썬을 처음 배우거나\n기초 문법을 막 익힌 단계",
    intermediate: "변수, 조건문, 반복문을 알고\n함수와 리스트를 다룰 수 있는 단계",
    advanced: "클래스, 재귀, 알고리즘 기초를 알고\n실무 경험이 있는 단계",
};

export default function OnboardingLevelSelectPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);

    const handleStart = () => {
        if (!selectedLevel) return;
        router.push(`/onboarding/quiz?level=${selectedLevel}`);
    };

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

                {/* 수준 카드 3개 — LEVEL_ORDER로 순회하며 LEVEL_META에서 라벨/색 조회 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                    {/* 선택 시 배경을 meta.bg(레벨별 농도)로 바꾸던 것 →
                        배경은 항상 옅은 톤(level-1-bg, 즉 '기초 이해'와 동일)으로 통일하고
                        테두리 색만 meta.fg로 다르게 줌.
                        이유: advanced(level-3-bg)가 진한 초록이라 회색 설명 텍스트와
                        대비가 안 나와서 안 읽히는 문제가 있었음. 배경을 통일하면
                        텍스트 색을 레벨마다 따로 신경 쓸 필요 없이 항상 가독성이 보장됨 */}
                    {LEVEL_ORDER.map((level) => {
                        const meta = LEVEL_META[level];
                        return (
                            <button
                                key={level}
                                onClick={() => setSelectedLevel(level)}
                                className="p-5 rounded-md border-2 text-left transition-all"
                                style={
                                    selectedLevel === level
                                        ? { borderColor: meta.line, background: "var(--level-1-bg)" }
                                        : { borderColor: "var(--border-c)", background: "var(--bg-2)" }
                                }
                            >
                                <div className="text-3xl mb-3">{levelIcon[level]}</div>
                                <h3 className="text-sm font-bold mb-1.5">{meta.label}</h3>
                                <p className="text-xs text-[var(--text-2)] whitespace-pre-line leading-relaxed">
                                    {levelDescription[level]}
                                </p>
                            </button>
                        );
                    })}
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
