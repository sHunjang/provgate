"use client";

import { useState, useMemo } from "react";

type Question = {
    question: string;
    choices: string[];
    answer?: number;
    answers?: number[];
    explanation: string;
};

type Props = {
    problem: {
        requirements?: string | null;
        questions: Question[] | null;
    };
    onComplete?: (selected: number[]) => void;
};

// ============================================================
// TradeoffJudgmentSection
// 역할: A/B 시나리오를 보여주고, "고려해야 할 요소"를 체크박스로 고르게 함
//
// 채점 방식: AI가 판단하지 않고, 선택한 인덱스 집합과 정답 집합을
// 그대로 비교함(set 비교) — AIQuestionSection과 동일한 신뢰 수준.
// 진짜 엄격한 검증은 이 화면이 아니라 게이트(재검증)에서 이뤄짐
//
// 신규: 보기 순서를 클라이언트에서 한 번 섞음
// YAML 파일에는 정답이 항상 [0, 1, 2]처럼 앞쪽에 고정돼 있는데,
// 이건 게이트(매번 AI가 새로 생성 + 서버에서 shuffle)와 달리
// "고정된 학습용 확인 화면"이라 원래는 문제 없었지만, 그래도
// 매번 같은 위치에 정답이 있는 게 신경 쓰일 수 있어 여기서도 섞음
// ============================================================
export default function TradeoffJudgmentSection({ problem, onComplete }: Props) {
    const [selected, setSelected] = useState<number[]>([]);
    const [submitted, setSubmitted] = useState(false);

    const question = problem.questions?.[0];

    // 신규: 보기 순서 셔플 + 정답 인덱스 재계산
    // useMemo로 question이 바뀔 때만 재계산 — 렌더링마다(클릭할 때마다)
    // 다시 섞이면 사용자가 클릭할 때마다 보기 위치가 바뀌는 혼란스러운
    // 경험이 되므로, 컴포넌트가 이 문제를 처음 받았을 때 딱 한 번만 섞음
    const { shuffledChoices, shuffledAnswers } = useMemo(() => {
        if (!question) return { shuffledChoices: [], shuffledAnswers: [] };

        const correctAnswers = question.answers ?? [];
        const indexed = question.choices.map((choice, idx) => ({ choice, idx }));

        // Fisher-Yates 셔플
        for (let i = indexed.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
        }

        // 원래 인덱스 → 셔플 후 새 인덱스 매핑
        const oldToNew = new Map(indexed.map((item, newIdx) => [item.idx, newIdx]));
        const newAnswers = correctAnswers.map((oldIdx) => oldToNew.get(oldIdx)!).sort((a, b) => a - b);

        return {
            shuffledChoices: indexed.map((item) => item.choice),
            shuffledAnswers: newAnswers,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [question]);

    if (!question) return null;

    const toggle = (idx: number) => {
        if (submitted) return;
        setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
    };

    // 수정: correctAnswers → shuffledAnswers (셔플된 위치 기준)
    const correctSet = new Set(shuffledAnswers);
    const selectedSet = new Set(selected);
    const isExactMatch =
        correctSet.size === selectedSet.size && Array.from(correctSet).every((v) => selectedSet.has(v));

    return (
        <div className="mt-6">
            {problem.requirements && (
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-[var(--text-2)] mb-3">📋 상황</h3>
                    <p className="text-sm text-[var(--text-2)] whitespace-pre-wrap">{problem.requirements}</p>
                </div>
            )}

            <div className="bg-[var(--bg-2)] rounded-xl p-5">
                <p className="text-sm font-medium mb-4">{question.question}</p>

                <div className="space-y-2 mb-4">
                    {/* 수정: question.choices → shuffledChoices */}
                    {shuffledChoices.map((choice, idx) => {
                        const isChecked = selected.includes(idx);
                        const isCorrectChoice = correctSet.has(idx);
                        return (
                            <button
                                key={idx}
                                onClick={() => toggle(idx)}
                                className="w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-2"
                                style={
                                    submitted
                                        ? isCorrectChoice && isChecked
                                            ? {
                                                  borderColor: "var(--accent)",
                                                  background: "var(--accent-bg)",
                                                  color: "var(--text)",
                                              }
                                            : isCorrectChoice && !isChecked
                                              ? { borderColor: "#dc2626", background: "#fee2e2", color: "#dc2626" }
                                              : isChecked
                                                ? { borderColor: "#dc2626", background: "#fee2e2", color: "#dc2626" }
                                                : { borderColor: "var(--border-c)", color: "var(--text-3)" }
                                        : isChecked
                                          ? {
                                                borderColor: "var(--accent3)",
                                                background: "var(--accent3-bg)",
                                                color: "var(--text)",
                                            }
                                          : {
                                                borderColor: "var(--border-c)",
                                                background: "var(--bg-3)",
                                                color: "var(--text-2)",
                                            }
                                }
                            >
                                <span
                                    className="w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center text-[10px]"
                                    style={{ borderColor: isChecked ? "currentColor" : "var(--border-strong)" }}
                                >
                                    {isChecked ? "✓" : submitted && isCorrectChoice ? "!" : ""}
                                </span>
                                {choice}
                            </button>
                        );
                    })}
                </div>

                {submitted && (
                    <div
                        className="p-3 rounded-lg mb-4 text-sm"
                        style={
                            isExactMatch
                                ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                : { background: "var(--accent2-bg)", color: "var(--accent2)" }
                        }
                    >
                        <p className="font-bold mb-1">
                            {isExactMatch ? "✅ 정확히 골랐어요!" : "💡 일부만 맞았어요, 해설을 확인해보세요"}
                        </p>
                        <p className="text-xs opacity-80 whitespace-pre-wrap">{question.explanation}</p>
                    </div>
                )}

                {!submitted ? (
                    <button
                        onClick={() => setSubmitted(true)}
                        disabled={selected.length === 0}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={
                            selected.length > 0
                                ? { background: "var(--accent3)", color: "#fff" }
                                : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                        }
                    >
                        선택 확인하기
                    </button>
                ) : (
                    <button
                        onClick={() => onComplete?.(selected)}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ background: "var(--accent3)", color: "#fff" }}
                    >
                        이해 확인하러 가기 →
                    </button>
                )}
            </div>
        </div>
    );
}
