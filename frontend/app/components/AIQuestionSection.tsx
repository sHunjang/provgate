"use client";

import { useState } from "react";

type Question = {
    question: string;
    choices: string[];
    answer: number;
    explanation: string;
};

type Props = {
    problem: {
        questions: Question[] | null;
    };
    onComplete?: (answers: number[]) => void;
};

// ============================================================
// AIQuestionSection 컴포넌트
// 역할: AI에게 올바른 프롬프트 작성법을 연습하는 4지선다
// 기존 보라색 테마 → var(--accent3)(네이비)로 통일
// ============================================================
export default function AIQuestionSection({ problem, onComplete }: Props) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [finished, setFinished] = useState(false);
    const [answers, setAnswers] = useState<number[]>([]);

    const questions = problem.questions || [];
    const currentQuestion = questions[currentIdx];
    if (!currentQuestion) return null;

    const isCorrect = selectedAnswer === currentQuestion.answer;

    const handleSubmit = () => {
        if (selectedAnswer === null) return;
        setSubmitted(true);
        if (isCorrect) setCorrectCount((prev) => prev + 1);
        setAnswers((prev) => [...prev, selectedAnswer]);
    };

    const handleNext = () => {
        if (currentIdx < questions.length - 1) {
            setCurrentIdx((prev) => prev + 1);
            setSelectedAnswer(null);
            setSubmitted(false);
        } else {
            setFinished(true);
        }
    };

    if (finished) {
        return (
            <div className="mt-6 bg-[var(--bg-2)] rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">{correctCount === questions.length ? "🎯" : "📝"}</div>
                <p className="font-bold text-lg mb-2">
                    {correctCount}/{questions.length} 정답
                </p>
                <p className="text-[var(--text-2)] text-sm">
                    {correctCount === questions.length
                        ? "AI에게 질문하는 법을 잘 이해했어요!"
                        : "좋은 프롬프트 작성법을 다시 복습해보세요."}
                </p>
                <button
                    onClick={() => onComplete?.(answers)}
                    className="w-full py-3 rounded-xl font-semibold transition-all mt-4"
                    style={{ background: "var(--accent3)", color: "#fff" }}
                >
                    이해 확인하러 가기 →
                </button>
            </div>
        );
    }

    return (
        <div className="mt-6">
            <div className="bg-[var(--bg-2)] rounded-xl p-5">
                <div className="flex justify-between text-xs text-[var(--text-3)] mb-3">
                    <span>
                        문항 {currentIdx + 1}/{questions.length}
                    </span>
                    <span style={{ color: "var(--accent3)" }}>AI 질문 연습 💬</span>
                </div>

                <p className="text-sm font-medium mb-4">{currentQuestion.question}</p>

                <div className="space-y-2 mb-4">
                    {currentQuestion.choices.map((choice, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelectedAnswer(idx)}
                            className="w-full p-3 rounded-lg border text-left text-sm transition-all"
                            style={
                                submitted
                                    ? idx === currentQuestion.answer
                                        ? {
                                              borderColor: "var(--accent)",
                                              background: "var(--accent-bg)",
                                              color: "var(--text)",
                                          }
                                        : idx === selectedAnswer
                                          ? { borderColor: "#dc2626", background: "#fee2e2", color: "#dc2626" }
                                          : { borderColor: "var(--border-c)", color: "var(--text-3)" }
                                    : selectedAnswer === idx
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
                            {choice}
                        </button>
                    ))}
                </div>

                {/* 해설: 오답이지만 "틀렸다"보다 "더 좋은 방법이 있다"는 뉘앙스라
                    빨강 대신 accent2(골드) 사용 — 원래 주황색이었던 의도를 살림 */}
                {submitted && (
                    <div
                        className="p-3 rounded-lg mb-4 text-sm"
                        style={
                            isCorrect
                                ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                : { background: "var(--accent2-bg)", color: "var(--accent2)" }
                        }
                    >
                        <p className="font-bold mb-1">
                            {isCorrect ? "✅ 좋은 프롬프트예요!" : "💡 더 좋은 방법이 있어요"}
                        </p>
                        <p className="text-xs opacity-80 whitespace-pre-wrap">{currentQuestion.explanation}</p>
                    </div>
                )}

                {!submitted ? (
                    <button
                        onClick={handleSubmit}
                        disabled={selectedAnswer === null}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={
                            selectedAnswer !== null
                                ? { background: "var(--accent3)", color: "#fff" }
                                : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                        }
                    >
                        답안 제출
                    </button>
                ) : (
                    <button
                        onClick={handleNext}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ background: "var(--accent3)", color: "#fff" }}
                    >
                        {currentIdx < questions.length - 1 ? "다음 문항 →" : "완료 🎉"}
                    </button>
                )}
            </div>
        </div>
    );
}
