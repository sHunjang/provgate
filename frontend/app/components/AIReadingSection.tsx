"use client";
// "use client" 선언: 이 컴포넌트는 브라우저(클라이언트)에서 실행됨
// useState 같은 React Hook은 클라이언트 컴포넌트에서만 사용 가능

import { useState } from "react";
// useState: 컴포넌트 안에서 상태(데이터)를 관리하는 React Hook
// 상태가 바뀌면 화면이 자동으로 다시 렌더링됨

// ============================================================
// 타입 정의 (TypeScript)
// ============================================================
type Question = {
    question: string; // 질문 내용
    choices: string[]; // 보기 배열 (4개)
    answer?: number; // 정답 인덱스 (0~3)
    explanation: string; // 해설
};

type Props = {
    problem: {
        ai_code: string | null; // AI가 짠 코드 (없으면 null)
        questions: Question[] | null; // 질문 목록 (없으면 null)
    };
    // 부모에게 완료를 알리는 콜백 함수 (선택적 prop라서 ?)
    onComplete?: (answers: number[]) => void;
};

// ============================================================
// AIReadingSection 컴포넌트
// 역할: AI 코드를 보여주고 이해도를 4지선다로 확인
// ============================================================
export default function AIReadingSection({ problem, onComplete }: Props) {
    const [currentIdx, setCurrentIdx] = useState(0);
    // 현재 보여주는 문항 인덱스 (0부터 시작)

    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    // 사용자가 선택한 보기 인덱스 (null = 아직 선택 안 함)

    const [submitted, setSubmitted] = useState(false);
    // 답안 제출 여부 (false = 제출 전, true = 제출 후 해설 표시)

    const [correctCount, setCorrectCount] = useState(0);
    // 맞힌 문항 수 누적 카운터

    const [finished, setFinished] = useState(false);
    // 모든 문항 완료 여부

    const [answers, setAnswers] = useState<number[]>([]);
    // 사용자가 각 문항에서 선택한 답안 인덱스를 순서대로 누적 (학습 기록용)

    const questions = problem.questions || [];
    // || []: questions가 null이면 빈 배열로 대체 (null 안전 처리)

    const currentQuestion = questions[currentIdx];
    // 문항이 없으면 렌더링 안 함 (null 반환 = 빈 화면)
    if (!currentQuestion) return null;

    const isCorrect = selectedAnswer === currentQuestion.answer;

    // 답안 제출 처리
    const handleSubmit = () => {
        if (selectedAnswer === null) return; // 선택 안 했으면 무시
        setSubmitted(true); // 제출 상태로 변경 → 해설 표시
        if (isCorrect) setCorrectCount((prev) => prev + 1);
        // prev: 이전 값 → 함수형 업데이트 (비동기 상태 업데이트 안전 처리)

        setAnswers((prev) => [...prev, selectedAnswer]);
        // [...prev, selectedAnswer]: 기존 배열을 복사하고 새 값을 뒤에 추가
        // React 상태는 불변(immutable)하게 다뤄야 하므로 push() 대신 새 배열 생성
    };

    // 다음 문항으로 이동
    const handleNext = () => {
        if (currentIdx < questions.length - 1) {
            setCurrentIdx((prev) => prev + 1);
            setSelectedAnswer(null);
            setSubmitted(false);
        } else {
            setFinished(true);
        }
    };

    // --- 완료 화면 ---
    if (finished) {
        return (
            // 수정: bg-gray-800 → bg-[var(--bg-2)]
            <div className="mt-6 bg-[var(--bg-2)] rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">{correctCount === questions.length ? "🎉" : "📚"}</div>
                <p className="font-bold text-lg mb-2">
                    {correctCount}/{questions.length} 정답
                </p>
                {/* 수정: text-gray-400 → text-[var(--text-2)] */}
                <p className="text-[var(--text-2)] text-sm">
                    {correctCount === questions.length
                        ? "완벽해요! 코드를 완전히 이해했어요."
                        : "다시 한번 코드를 읽어보세요."}
                </p>

                {/* 수정: bg-indigo-600 → var(--btn-bg) (사이트 공통 주요 버튼 색) */}
                <button
                    onClick={() => onComplete?.(answers)}
                    className="w-full py-3 rounded-xl font-semibold transition-all mt-4"
                    style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                >
                    이해 확인하러 가기 →
                </button>
            </div>
        );
    }

    // --- 메인 화면 렌더링 ---
    return (
        <div className="mt-6">
            {/* AI 코드 표시 섹션 */}
            <div className="mb-6">
                <h3 className="text-sm font-bold text-[var(--text-2)] mb-3">🤖 AI가 작성한 코드</h3>
                {/* 수정: bg-gray-800 → bg-[var(--bg-2)] */}
                <div className="bg-[var(--bg-2)] rounded-lg p-4">
                    {/* pre 태그: 코드 형식(공백, 줄바꿈) 그대로 표시 */}
                    {/* 수정: text-green-300 → var(--accent) (코드/정답 계열 통일 색) */}
                    <pre
                        className="text-sm font-mono whitespace-pre-wrap"
                        style={{ color: "var(--accent)" }}
                    >
                        {problem.ai_code}
                    </pre>
                </div>
            </div>

            {/* 질문 섹션 */}
            <div className="bg-[var(--bg-2)] rounded-xl p-5">
                <div className="flex justify-between text-xs text-[var(--text-3)] mb-3">
                    <span>
                        문항 {currentIdx + 1}/{questions.length}
                    </span>
                    {/* 수정: text-indigo-400 → var(--accent3) (문제 유형 배지 색과 통일) */}
                    <span style={{ color: "var(--accent3)" }}>코드 읽기 🔍</span>
                </div>

                <p className="text-sm font-medium mb-4">{currentQuestion.question}</p>

                {/* 보기 목록 */}
                <div className="space-y-2 mb-4">
                    {currentQuestion.choices.map((choice, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelectedAnswer(idx)}
                            // !submitted: 제출 전에만 선택 가능
                            className="w-full p-3 rounded-lg border text-left text-sm transition-all"
                            // ============================================================
                            // 수정: 4가지 상태(정답/오답/선택됨/기본)를 각각 인디고·빨강·초록
                            // 하드코딩 대신 팔레트 변수로 매핑
                            //   정답 표시    → var(--accent) (그린)
                            //   틀린 선택    → red (관례상 위험/오답은 빨강 유지)
                            //   현재 선택 중 → var(--accent) (제출 전 강조도 그린으로 통일)
                            //   기본 상태    → bg-3/border-c (중립 배경)
                            // ============================================================
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
                                            borderColor: "var(--accent)",
                                            background: "var(--accent-bg)",
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

                {/* 해설 표시 (제출 후에만) */}
                {submitted && (
                    <div
                        className="p-3 rounded-lg mb-4 text-sm"
                        style={
                            isCorrect
                                ? { background: "var(--accent-bg)", color: "var(--accent)" }
                                : { background: "#fee2e2", color: "#dc2626" }
                        }
                    >
                        <p className="font-bold mb-1">{isCorrect ? "✅ 정답!" : "❌ 오답"}</p>
                        <p className="text-xs opacity-80">{currentQuestion.explanation}</p>
                    </div>
                )}

                {/* 제출/다음 버튼 */}
                {!submitted ? (
                    <button
                        onClick={handleSubmit}
                        disabled={selectedAnswer === null}
                        // disabled: 선택 안 했으면 버튼 비활성화
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={
                            selectedAnswer !== null
                                ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                        }
                    >
                        답안 제출
                    </button>
                ) : (
                    <button
                        onClick={handleNext}
                        className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                    >
                        {currentIdx < questions.length - 1 ? "다음 문항 →" : "완료 🎉"}
                    </button>
                )}
            </div>
        </div>
    );
}
