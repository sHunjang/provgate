"use client";

import { useState } from "react";

type Question = {
    question: string;
    choices: string[];
    answer?: number;
    explanation: string;
};

type Props = {
    problem: {
        ai_code: string | null;
        questions: Question[] | null;
    };
    aiCode: string; // 버그 있는 AI 코드 (부모에서 null 처리 후 전달)
};

// ============================================================
// AIDebuggingSection 컴포넌트
// 역할: 버그 있는 AI 코드를 보여주고 버그 원인을 맞추게 함
// 사용자는 오른쪽 에디터에서 직접 버그도 수정
// ============================================================
export default function AIDebuggingSection({ problem, aiCode }: Props) {
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState(false);

    // 첫 번째 질문만 사용 (ai_debugging은 질문 1개)
    const question = problem.questions?.[0];
    if (!question) return null;

    const isCorrect = selectedAnswer === question.answer;

    return (
        <div className="mt-6">
            {/* 버그 있는 AI 코드 표시 */}
            {/* 이 박스는 "위험한 코드"라는 의미를 담고 있어서, 팔레트 색 대신
                일반적으로 위험/경고를 뜻하는 빨강을 그대로 유지함
                (팔레트 통일보다 "직관적 의미 전달"이 더 중요한 예외 케이스) */}
            <div className="mb-6">
                <h3 className="text-sm font-bold text-[var(--text-2)] mb-3">🐛 버그가 있는 AI 코드</h3>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-4">
                    <pre className="text-sm text-red-600 dark:text-red-300 font-mono whitespace-pre-wrap">{aiCode}</pre>
                </div>
                <p className="text-xs text-[var(--text-3)] mt-2">
                    💡 위 코드의 버그를 찾고, 오른쪽 에디터에서 수정해보세요.
                </p>
            </div>

            {/* 이해 확인 질문 */}
            <div className="bg-[var(--bg-2)] rounded-xl p-5">
                {/* 수정: text-yellow-400 → var(--accent2) (경고/주의 계열 통일 색) */}
                <p
                    className="text-xs mb-2"
                    style={{ color: "var(--accent2)" }}
                >
                    🤔 먼저 버그를 파악해보세요
                </p>
                <p className="text-sm font-medium mb-4">{question.question}</p>

                <div className="space-y-2 mb-4">
                    {question.choices.map((choice, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelectedAnswer(idx)}
                            className="w-full p-3 rounded-lg border text-left text-sm transition-all"
                            style={
                                submitted
                                    ? idx === question.answer
                                        ? {
                                              borderColor: "var(--accent)",
                                              background: "var(--accent-bg)",
                                              color: "var(--text)",
                                          }
                                        : idx === selectedAnswer
                                          ? { borderColor: "#dc2626", background: "#fee2e2", color: "#dc2626" }
                                          : { borderColor: "var(--border-c)", color: "var(--text-3)" }
                                    : // 수정: indigo → accent2 (디버깅 유형의 대표색을 골드/브라운 계열로 통일)
                                      selectedAnswer === idx
                                      ? {
                                            borderColor: "var(--accent2)",
                                            background: "var(--accent2-bg)",
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

                {submitted && (
                    <div
                        className="p-3 rounded-lg text-sm"
                        style={
                            isCorrect
                                ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                : { background: "#fee2e2", color: "#dc2626" }
                        }
                    >
                        <p className="font-bold mb-1">{isCorrect ? "✅ 정확해요!" : "❌ 다시 생각해보세요"}</p>
                        <p className="text-xs opacity-80">{question.explanation}</p>
                    </div>
                )}

                {!submitted && (
                    <button
                        onClick={() => setSubmitted(true)}
                        disabled={selectedAnswer === null}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all mt-4"
                        style={
                            selectedAnswer !== null
                                ? { background: "var(--accent2)", color: "#fff" }
                                : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                        }
                    >
                        답안 제출
                    </button>
                )}
            </div>
        </div>
    );
}
