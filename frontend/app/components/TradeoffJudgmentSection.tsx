"use client";

import { useState } from "react";

type Question = {
    question: string;
    choices: string[];
    answer?: number; // 다른 컴포넌트들과 타입 모양을 맞추기 위해 추가
    answers?: number[]; // 필수 → 선택적으로 변경
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
// ============================================================
export default function TradeoffJudgmentSection({ problem, onComplete }: Props) {
    const [selected, setSelected] = useState<number[]>([]);
    const [submitted, setSubmitted] = useState(false);

    const question = problem.questions?.[0];
    if (!question) return null;

    // answers가 undefined일 수 있으므로 빈 배열로 기본값 처리
    // (이 컴포넌트는 tradeoff_judgment 전용이라 실제로는 항상 채워져
    //  있어야 정상이지만, 타입 시스템 차원에서 안전하게 처리)
    const correctAnswers = question.answers ?? [];

    const toggle = (idx: number) => {
        if (submitted) return;
        setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
    };

    // 수정: question.answers → correctAnswers
    const correctSet = new Set(correctAnswers);
    const selectedSet = new Set(selected);
    const isExactMatch = correctSet.size === selectedSet.size && Array.from(correctSet).every((v) => selectedSet.has(v));

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
                    {question.choices.map((choice, idx) => {
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
                                            ? // 정답이면서 선택함 → 초록(정답 맞춤)
                                              {
                                                  borderColor: "var(--accent)",
                                                  background: "var(--accent-bg)",
                                                  color: "var(--text)",
                                              }
                                            : isCorrectChoice && !isChecked
                                              ? // 신규: 정답인데 선택 안 함 → 빨간색으로 "놓쳤다" 표시
                                                { borderColor: "#dc2626", background: "#fee2e2", color: "#dc2626" }
                                              : isChecked
                                                ? // 정답 아닌데 선택함 → 빨간색(오답 선택)
                                                  { borderColor: "#dc2626", background: "#fee2e2", color: "#dc2626" }
                                                : // 정답도 아니고 선택도 안 함 → 회색(중립)
                                                  { borderColor: "var(--border-c)", color: "var(--text-3)" }
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
