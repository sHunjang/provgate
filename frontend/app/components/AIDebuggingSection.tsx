"use client";

import { useState } from "react";

// 질문 타입 정의 (AIReadingSection과 동일한 구조)
type Question = {
    question: string;
    choices: string[];
    answer: number;
    explanation: string;
};

// Props 타입 정의
// aiCode를 별도로 받는 이유:
// problem.ai_code는 string | null이지만
// 이 컴포넌트에서는 항상 문자열이 보장되어야 해서 별도 처리
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
    // 선택한 보기 인덱스 (null = 미선택)
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

    // 제출 여부 (false = 제출 전, true = 제출 후 해설 표시)
    const [submitted, setSubmitted] = useState(false);

    // 첫 번째 질문만 사용 (ai_debugging은 질문 1개)
    // ?.[0]: 배열이 null/undefined여도 에러 없이 undefined 반환 (옵셔널 체이닝)
    const question = problem.questions?.[0];

    // 질문이 없으면 렌더링 안 함
    if (!question) return null;

    // 정답 여부
    const isCorrect = selectedAnswer === question.answer;

    return (
        <div className="mt-6">
            {/* 버그 있는 AI 코드 표시 */}
            {/* 빨간색 테마로 "위험한 코드"임을 시각적으로 표현 */}
            <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-400 mb-3">🐛 버그가 있는 AI 코드</h3>
                <div className="bg-red-950/30 border border-red-800 rounded-lg p-4">
                    {/* /30: Tailwind 투명도 (30% 불투명) */}
                    <pre className="text-sm text-red-300 font-mono whitespace-pre-wrap">{aiCode}</pre>
                </div>
                <p className="text-xs text-gray-500 mt-2">💡 위 코드의 버그를 찾고, 오른쪽 에디터에서 수정해보세요.</p>
            </div>

            {/* 이해 확인 질문 */}
            <div className="bg-gray-800 rounded-xl p-5">
                <p className="text-xs text-yellow-400 mb-2">🤔 먼저 버그를 파악해보세요</p>
                <p className="text-white text-sm font-medium mb-4">{question.question}</p>

                {/* 보기 목록 */}
                <div className="space-y-2 mb-4">
                    {question.choices.map((choice, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelectedAnswer(idx)}
                            // 제출 전에만 선택 가능
                            className={`w-full p-3 rounded-lg border text-left text-sm transition-all
                                ${
                                    submitted
                                        ? idx === question.answer
                                            ? "border-green-500 bg-green-900/30 text-green-300"
                                            : idx === selectedAnswer
                                              ? "border-red-500 bg-red-900/30 text-red-300"
                                              : "border-gray-600 text-gray-500"
                                        : selectedAnswer === idx
                                          ? "border-indigo-500 bg-indigo-900/30 text-white"
                                          : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                                }`}
                        >
                            {choice}
                        </button>
                    ))}
                </div>

                {/* 해설 (제출 후에만 표시) */}
                {submitted && (
                    <div
                        className={`p-3 rounded-lg text-sm ${
                            isCorrect ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"
                        }`}
                    >
                        <p className="font-bold mb-1">{isCorrect ? "✅ 정확해요!" : "❌ 다시 생각해보세요"}</p>
                        <p className="text-xs opacity-80">{question.explanation}</p>
                    </div>
                )}

                {/* 제출 버튼 (제출 후 사라짐) */}
                {!submitted && (
                    <button
                        onClick={() => setSubmitted(true)}
                        // 인라인 화살표 함수: 간단한 상태 변경은 핸들러 함수 없이 바로 처리
                        disabled={selectedAnswer === null}
                        className={`w-full py-2 rounded-lg text-sm font-medium transition-all mt-4
                            ${
                                selectedAnswer !== null
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        답안 제출
                    </button>
                )}
            </div>
        </div>
    );
}
