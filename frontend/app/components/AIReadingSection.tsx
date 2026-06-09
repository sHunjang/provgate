"use client";
// "use client" 선언: 이 컴포넌트는 브라우저(클라이언트)에서 실행됨
// useState 같은 React Hook은 클라이언트 컴포넌트에서만 사용 가능

import { useState } from "react";
// useState: 컴포넌트 안에서 상태(데이터)를 관리하는 React Hook
// 상태가 바뀌면 화면이 자동으로 다시 렌더링됨

// ============================================================
// 타입 정의 (TypeScript)
// 타입을 미리 정의하면 잘못된 데이터가 들어올 때 컴파일 에러로 잡아줌
// ============================================================

// 질문 하나의 데이터 구조
// DB의 questions JSONB 컬럼 구조와 동일하게 맞춤
type Question = {
    question: string; // 질문 내용
    choices: string[]; // 보기 배열 (4개)
    answer: number; // 정답 인덱스 (0~3)
    explanation: string; // 해설
};

// 이 컴포넌트가 부모로부터 받는 데이터 타입 (Props)
// Props = Properties, 부모 컴포넌트가 자식에게 전달하는 데이터
type Props = {
    problem: {
        ai_code: string | null; // AI가 짠 코드 (없으면 null)
        questions: Question[] | null; // 질문 목록 (없으면 null)
    };

    // 부모에게 완료를 알리는 콜백 함수 (선택적 prop라서 ?)
    // answers: 사용자가 각 문항에서 선택한 답만 인덱스 배열 (학습 기록용)
    onComplete?: (answers: number[]) => void;
};

// ============================================================
// AIReadingSection 컴포넌트
// 역할: AI 코드를 보여주고 이해도를 4지선다로 확인
// ============================================================

export default function AIReadingSection({ problem, onComplete }: Props) {
    // Props 구조분해: problem 객체를 받아서 사용

    // --- 상태(State) 정의 ---
    // useState(초기값): [현재값, 값변경함수] 반환
    // 상태가 바뀔 때마다 컴포넌트 리렌더링

    const [currentIdx, setCurrentIdx] = useState(0);
    // 현재 보여주는 문항 인덱스 (0부터 시작)
    // 예: 3문항이면 0, 1, 2

    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    // 사용자가 선택한 보기 인덱스
    // null = 아직 선택 안 함, 0~3 = 선택된 보기

    const [submitted, setSubmitted] = useState(false);
    // 답안 제출 여부
    // false = 제출 전, true = 제출 후 (해설 표시)

    const [correctCount, setCorrectCount] = useState(0);
    // 맞힌 문항 수 누적 카운터

    const [finished, setFinished] = useState(false);
    // 모든 문항 완료 여부

    // 사용자가 각 문항에서 선택한 답안 인덱스를 순서대로 누적
    // 예: [1, 0, 2] -> 1번 문항 1번 선택, 2번 문항 0번 선택...
    const [answers, setAnswers] = useState<number[]>([]);

    // --- 데이터 준비 ---
    const questions = problem.questions || [];
    // || []: questions가 null이면 빈 배열로 대체 (null 안전 처리)

    const currentQuestion = questions[currentIdx];
    // 현재 인덱스에 해당하는 문항 가져오기
    // O(1) 배열 인덱스 접근

    // 문항이 없으면 렌더링 안 함 (null 반환 = 빈 화면)
    if (!currentQuestion) return null;

    // 정답 여부 계산
    // 선택한 인덱스(selectedAnswer)와 정답 인덱스(answer)가 같으면 true
    const isCorrect = selectedAnswer === currentQuestion.answer;

    // --- 이벤트 핸들러 ---

    // 답안 제출 처리
    const handleSubmit = () => {
        if (selectedAnswer === null) return; // 선택 안 했으면 무시
        setSubmitted(true); // 제출 상태로 변경 → 해설 표시
        if (isCorrect) setCorrectCount((prev) => prev + 1);
        // prev: 이전 값 → 함수형 업데이트
        // 이전 값 기반으로 업데이트할 때 사용 (비동기 상태 업데이트 안전 처리)

        // 선택한 답안을 누적 배열에 추가 (학습 기록용)
        setAnswers((prev) => [...prev, selectedAnswer]);
        // [...prev, selectedAnswer]: 기존 배열을 복사하고 새 값을 뒤에 추가
        // React 상태는 불변(immutable)하게 다뤄야 하므로
        // push()로 직접 수정하지 않고 새 배열을 만듦
    };

    // 다음 문항으로 이동
    const handleNext = () => {
        if (currentIdx < questions.length - 1) {
            // 아직 문항이 남아있으면 다음으로 이동
            setCurrentIdx((prev) => prev + 1); // 인덱스 +1
            setSelectedAnswer(null); // 선택 초기화
            setSubmitted(false); // 제출 상태 초기화
        } else {
            // 마지막 문항이면 완료 처리
            setFinished(true);
        }
    };

    // --- 완료 화면 ---
    // 조건부 렌더링: finished가 true면 결과 화면 표시
    if (finished) {
        return (
            <div className="mt-6 bg-gray-800 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">
                    {/* 삼항 연산자: 조건 ? 참일때 : 거짓일때 */}
                    {correctCount === questions.length ? "🎉" : "📚"}
                </div>
                <p className="text-white font-bold text-lg mb-2">
                    {correctCount}/{questions.length} 정답
                </p>
                <p className="text-gray-400 text-sm">
                    {correctCount === questions.length
                        ? "완벽해요! 코드를 완전히 이해했어요."
                        : "다시 한번 코드를 읽어보세요."}
                </p>

                {/* 게이트로 넘어가는 버튼 (부모에게 완료 신호 전달) */}
                <button
                    onClick={() => onComplete?.(answers)}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
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
                <h3 className="text-sm font-bold text-gray-400 mb-3">🤖 AI가 작성한 코드</h3>
                <div className="bg-gray-800 rounded-lg p-4">
                    {/* pre 태그: 코드 형식(공백, 줄바꿈) 그대로 표시 */}
                    {/* whitespace-pre-wrap: 긴 줄은 줄바꿈 */}
                    <pre className="text-sm text-green-300 font-mono whitespace-pre-wrap">{problem.ai_code}</pre>
                </div>
            </div>

            {/* 질문 섹션 */}
            <div className="bg-gray-800 rounded-xl p-5">
                {/* 진행 상태 표시 */}
                <div className="flex justify-between text-xs text-gray-500 mb-3">
                    <span>
                        문항 {currentIdx + 1}/{questions.length}
                    </span>
                    {/* +1: 사용자에게는 0부터가 아닌 1부터 표시 */}
                    <span className="text-indigo-400">코드 읽기 🔍</span>
                </div>

                <p className="text-white text-sm font-medium mb-4">{currentQuestion.question}</p>

                {/* 보기 목록 */}
                {/* .map(): 배열의 각 요소를 JSX로 변환 */}
                {/* key: React가 각 요소를 구분하는 고유 식별자 (필수) */}
                <div className="space-y-2 mb-4">
                    {currentQuestion.choices.map((choice, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelectedAnswer(idx)}
                            // !submitted: 제출 전에만 선택 가능 (제출 후 변경 방지)
                            className={`w-full p-3 rounded-lg border text-left text-sm transition-all
                                ${
                                    submitted
                                        ? idx === currentQuestion.answer
                                            ? "border-green-500 bg-green-900/30 text-green-300"
                                            : // 정답 보기: 초록색
                                              idx === selectedAnswer
                                              ? "border-red-500 bg-red-900/30 text-red-300"
                                              : // 틀린 선택: 빨간색
                                                "border-gray-600 text-gray-500"
                                        : // 나머지: 회색
                                          selectedAnswer === idx
                                          ? "border-indigo-500 bg-indigo-900/30 text-white"
                                          : // 선택된 보기: 인디고색
                                            "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                                    // 미선택: 기본 회색
                                }`}
                        >
                            {choice}
                        </button>
                    ))}
                </div>

                {/* 해설 표시 (제출 후에만) */}
                {/* &&: 앞이 true일 때만 뒤를 렌더링 */}
                {submitted && (
                    <div
                        className={`p-3 rounded-lg mb-4 text-sm ${
                            isCorrect ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"
                        }`}
                    >
                        <p className="font-bold mb-1">{isCorrect ? "✅ 정답!" : "❌ 오답"}</p>
                        <p className="text-xs opacity-80">{currentQuestion.explanation}</p>
                    </div>
                )}

                {/* 제출/다음 버튼 (제출 전/후 다르게 표시) */}
                {!submitted ? (
                    // 제출 전: "답안 제출" 버튼
                    <button
                        onClick={handleSubmit}
                        disabled={selectedAnswer === null}
                        // disabled: 선택 안 했으면 버튼 비활성화
                        className={`w-full py-2 rounded-lg text-sm font-medium transition-all
                            ${
                                selectedAnswer !== null
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        답안 제출
                    </button>
                ) : (
                    // 제출 후: "다음 문항" 또는 "완료" 버튼
                    <button
                        onClick={handleNext}
                        className="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
                    >
                        {currentIdx < questions.length - 1 ? "다음 문항 →" : "완료 🎉"}
                    </button>
                )}
            </div>
        </div>
    );
}
