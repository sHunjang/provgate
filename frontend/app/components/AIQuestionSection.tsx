"use client";

import { useState } from "react";

// 질문 타입 (동일한 구조 반복 사용)
// 실무에서는 공통 타입을 별도 파일(types.ts)로 분리하지만
// 현재는 각 파일에 직접 정의
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

    // 부모에게 완료를 알리기 위한 콜백 함수
    // answer: 사용자가 각 문항에서 선택한 답안 인덱스 배열 (학습 기록용)
    onComplete?: (answers: number[]) => void;
};

// ============================================================
// AIQuestionSection 컴포넌트
// 역할: AI에게 올바른 프롬프트 작성법을 연습하는 4지선다
// 보라색 테마로 다른 유형과 시각적으로 구분
// ============================================================

export default function AIQuestionSection({ problem, onComplete }: Props) {
    // AIReadingSection과 동일한 상태 구조
    // (다음 문항 이동, 정답 카운트, 완료 여부)
    const [currentIdx, setCurrentIdx] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [finished, setFinished] = useState(false);

    // 사용자가 각 문항에서 선택한 답안 인덱스를 순서대로 누적 (학습 기록용)
    const [answers, setAnswers] = useState<number[]>([]);

    const questions = problem.questions || [];
    const currentQuestion = questions[currentIdx];

    if (!currentQuestion) return null;

    const isCorrect = selectedAnswer === currentQuestion.answer;

    // 답안 제출 핸들러
    const handleSubmit = () => {
        if (selectedAnswer === null) return;
        setSubmitted(true);
        if (isCorrect) setCorrectCount((prev) => prev + 1);

        // 선택한 답안을 누적 배열에 추가 (학습 기록용)
        setAnswers((prev) => [...prev, selectedAnswer]);
    };

    // 다음 문항 이동 핸들러
    const handleNext = () => {
        if (currentIdx < questions.length - 1) {
            setCurrentIdx((prev) => prev + 1);
            setSelectedAnswer(null);
            setSubmitted(false);
        } else {
            setFinished(true);
        }
    };

    // 완료 화면
    if (finished) {
        return (
            <div className="mt-6 bg-gray-800 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">{correctCount === questions.length ? "🎯" : "📝"}</div>
                <p className="text-white font-bold text-lg mb-2">
                    {correctCount}/{questions.length} 정답
                </p>
                <p className="text-gray-400 text-sm">
                    {correctCount === questions.length
                        ? "AI에게 질문하는 법을 잘 이해했어요!"
                        : "좋은 프롬프트 작성법을 다시 복습해보세요."}
                </p>
                {/* 게이트로 넘어가는 버튼 (부모에게 완료 신호 전달) */}
                {/* 보라색 테마 유지 */}
                <button
                    onClick={() => onComplete?.(answers)}
                    className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all"
                >
                    이해 확인하러 가기 →
                </button>
            </div>
        );
    }

    return (
        <div className="mt-6">
            <div className="bg-gray-800 rounded-xl p-5">
                {/* 진행 상태 */}
                <div className="flex justify-between text-xs text-gray-500 mb-3">
                    <span>
                        문항 {currentIdx + 1}/{questions.length}
                    </span>
                    {/* 보라색 테마: AI 질문 연습 유형의 시각적 구분 */}
                    <span className="text-purple-400">AI 질문 연습 💬</span>
                </div>

                <p className="text-white text-sm font-medium mb-4">{currentQuestion.question}</p>

                {/* 보기 목록 (보라색 테마 적용) */}
                <div className="space-y-2 mb-4">
                    {currentQuestion.choices.map((choice, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelectedAnswer(idx)}
                            className={`w-full p-3 rounded-lg border text-left text-sm transition-all
                                ${
                                    submitted
                                        ? idx === currentQuestion.answer
                                            ? "border-green-500 bg-green-900/30 text-green-300"
                                            : idx === selectedAnswer
                                              ? "border-red-500 bg-red-900/30 text-red-300"
                                              : "border-gray-600 text-gray-500"
                                        : selectedAnswer === idx
                                          ? "border-purple-500 bg-purple-900/30 text-white"
                                          : // 보라색: ai_question 유형 테마
                                            "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                                }`}
                        >
                            {choice}
                        </button>
                    ))}
                </div>

                {/* 해설 */}
                {submitted && (
                    <div
                        className={`p-3 rounded-lg mb-4 text-sm ${
                            isCorrect ? "bg-green-900/30 text-green-300" : "bg-orange-900/30 text-orange-300"
                            // 오답이지만 "틀렸다"보다 "더 좋은 방법이 있다"는 뉘앙스로
                            // 빨간색 대신 주황색 사용
                        }`}
                    >
                        <p className="font-bold mb-1">
                            {isCorrect ? "✅ 좋은 프롬프트예요!" : "💡 더 좋은 방법이 있어요"}
                        </p>
                        {/* whitespace-pre-wrap: 해설에 줄바꿈이 있을 때 그대로 표시 */}
                        <p className="text-xs opacity-80 whitespace-pre-wrap">{currentQuestion.explanation}</p>
                    </div>
                )}

                {/* 제출/다음 버튼 */}
                {!submitted ? (
                    <button
                        onClick={handleSubmit}
                        disabled={selectedAnswer === null}
                        className={`w-full py-2 rounded-lg text-sm font-medium transition-all
                            ${
                                selectedAnswer !== null
                                    ? "bg-purple-600 text-white hover:bg-purple-700"
                                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        답안 제출
                    </button>
                ) : (
                    <button
                        onClick={handleNext}
                        className="w-full py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-all"
                    >
                        {currentIdx < questions.length - 1 ? "다음 문항 →" : "완료 🎉"}
                    </button>
                )}
            </div>
        </div>
    );
}
