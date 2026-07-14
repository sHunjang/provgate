"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase";

type Props = {
    problem: {
        id: string;
        requirements?: string | null;
        thinking_hints?: string[] | null;
    };
    code: string;
    executionResult: { success: boolean; message: string } | null;
    onConditionsSubmit: () => void;
    onComplete: () => void;
};

export default function DesignImplementationSection({
    problem,
    code,
    executionResult,
    onConditionsSubmit,
    onComplete,
}: Props) {
    const [myConditions, setMyConditions] = useState("");
    const [conditionsSubmitted, setConditionsSubmitted] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);

    const handleConditionsSubmit = () => {
        if (myConditions.trim() === "") return;
        setConditionsSubmitted(true);
        onConditionsSubmit();
    };

    const handleGetFeedback = async () => {
        if (!executionResult) return;

        setFeedbackLoading(true);
        setFeedbackError(null);

        try {
            const supabase = createClient();
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                setFeedbackError("로그인이 만료됐어요. 다시 로그인 후 시도해주세요.");
                setFeedbackLoading(false);
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/design/feedback`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    problem_id: problem.id,
                    my_conditions: myConditions,
                    code: code,
                    execution_result: JSON.stringify(executionResult),
                }),
            });

            if (res.status === 429) {
                const data = await res.json();
                setFeedbackError(`⚠️ ${data.detail.message} ${data.detail.reset}`);
                return;
            }

            if (!res.ok) throw new Error("피드백 생성 실패");

            const data = await res.json();
            setFeedback(data.feedback);
        } catch (err) {
            console.error(err);
            setFeedbackError("피드백을 받아오지 못했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setFeedbackLoading(false);
        }
    };

    return (
        <div className="mt-6">
            <div className="mb-6">
                <h3 className="text-sm font-bold text-[var(--text-2)] mb-3">📋 요구사항</h3>
                <p className="text-[var(--text-2)] text-sm whitespace-pre-wrap mb-4">{problem.requirements}</p>

                {problem.thinking_hints && problem.thinking_hints.length > 0 && (
                    <div
                        className="rounded-lg p-4 border"
                        style={{ background: "var(--accent3-bg)", borderColor: "var(--accent3)" }}
                    >
                        <p
                            className="text-xs mb-2 font-bold"
                            style={{ color: "var(--accent3)" }}
                        >
                            💭 생각해볼 질문
                        </p>
                        <ul
                            className="text-sm space-y-1"
                            style={{ color: "var(--text)" }}
                        >
                            {problem.thinking_hints.map((hint, idx) => (
                                <li key={idx}>· {hint}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {!conditionsSubmitted ? (
                <div className="bg-[var(--bg-2)] rounded-xl p-5">
                    <p
                        className="text-xs mb-2 font-bold"
                        style={{ color: "var(--accent3)" }}
                    >
                        ✏️ 당신의 설계를 적어보세요
                    </p>
                    <p className="text-xs text-[var(--text-3)] mb-3">
                        정답은 없습니다 — 당신이 생각한 조건과 순서가 곧 설계입니다.
                    </p>
                    <textarea
                        value={myConditions}
                        onChange={(e) => setMyConditions(e.target.value)}
                        placeholder={
                            "예) 1. 이메일 형식이 올바른지 검사한다\n2. 이미 가입된 이메일인지 확인한다\n3. ..."
                        }
                        className="w-full min-h-[140px] p-3 rounded-lg border resize-y text-sm font-mono
                            bg-[var(--bg-3)] border-[var(--border-c)] text-[var(--text)]
                            focus:outline-none"
                        style={{ borderColor: "var(--border-c)" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent3)")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-c)")}
                    />
                    <button
                        onClick={handleConditionsSubmit}
                        disabled={myConditions.trim() === ""}
                        className="w-full mt-3 py-2 rounded-lg text-sm font-medium transition-all"
                        style={
                            myConditions.trim() !== ""
                                ? { background: "var(--accent3)", color: "#fff" }
                                : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                        }
                    >
                        설계 제출하고 코드 작성하기 →
                    </button>
                </div>
            ) : (
                <div className="bg-[var(--bg-2)] rounded-xl p-5">
                    <p className="text-xs text-[var(--text-3)] mb-2">내가 제출한 설계</p>
                    <pre className="text-sm font-mono whitespace-pre-wrap text-[var(--text-2)]">{myConditions}</pre>
                </div>
            )}

            {conditionsSubmitted && executionResult && !feedback && (
                <div className="mt-4">
                    <button
                        onClick={handleGetFeedback}
                        disabled={feedbackLoading}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={
                            feedbackLoading
                                ? { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                                : { background: "var(--accent3)", color: "#fff" }
                        }
                    >
                        {feedbackLoading ? "AI가 분석하는 중..." : "🤖 AI 피드백 받기"}
                    </button>
                    {feedbackError && <p className="text-xs text-red-500 mt-2">{feedbackError}</p>}
                </div>
            )}

            {feedback && (
                <div
                    className="mt-4 rounded-lg p-4 border"
                    style={{ background: "var(--accent3-bg)", borderColor: "var(--accent3)" }}
                >
                    <p
                        className="text-xs mb-2 font-bold"
                        style={{ color: "var(--accent3)" }}
                    >
                        🤖 AI의 피드백
                    </p>
                    <div
                        className="text-sm space-y-2 whitespace-pre-wrap"
                        style={{ color: "var(--text)" }}
                    >
                        {feedback.split("\n").map((line, idx) => (line.trim() ? <p key={idx}>{line}</p> : null))}
                    </div>

                    <button
                        onClick={onComplete}
                        className="w-full mt-4 py-3 rounded-xl font-semibold transition-all"
                        style={{ background: "var(--accent3)", color: "#fff" }}
                    >
                        이해 확인하러 가기 →
                    </button>
                </div>
            )}
        </div>
    );
}
