"use client";

import { Suspense } from "react";

// useState: 컴포넌트 안에서 상태(데이터)를 관리하는 React Hook
// 상태가 바뀌면 컴포넌트가 자동으로 다시 랜더링 됨
// useEffect: 컴포넌트 랜더링 후 실행되는 Hook
// 주로 API 호출, 구독, 타이머 등 부수효과(side effect) 처리에 사용
// useRef: 리렌더링 없이 값을 유지하는 Hook
// 중복 API 호출 방지용 플래그로 사용 (useState와 달리 값이 바뀌어도 리렌더링 안 일어남)
import { useState, useEffect, useRef } from "react";

// useRouter: 페이지 이동에 사용하는 Hook
// useSearchParams: URL 쿼리 파라미터를 읽어오는 Hook
// ex: /onboarding/quiz?level=beginner -> searchParams.get("level") = "beginner"
// 반드시 "next/navigation에서 import (App Router)
// "next/router"는 Pages Router용이라 App Router에서 사용 불가
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/app/hooks/useAuth";

// 퀴즈 문항 타입 정의
type Question = {
    id: number;
    question: string;
    options: string[];
    answer: number;
    concept: string;
    explanation: string;
};

function QuizContent() {
    // useSearchParams: URL 쿼리 파라미터를 읽어오는 Hook
    // /onboarding/quiz?level=beginner -> searchParams.get("level") = "beginner"
    const searchParams = useSearchParams();
    const level = searchParams.get("level") || "beginner";
    const router = useRouter();

    // 퀴즈 데이터 상세
    const [questions, setQuestions] = useState<Question[]>([]);

    // 현재 문항 인덱스
    const [currentIdx, setCurrentIdx] = useState(0);

    // 사용자 답안 저장 - 문항 수만큼의 배열 (-1은 미답변)
    const [answers, setAnswers] = useState<number[]>([]);

    // 로딩 상태
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    const { user } = useAuth();

    // 중복 호출 방지용 ref
    // 문제: useAuth()의 user가 처음엔 null → 몇 초 후 실제 유저 정보로 바뀜
    //       user가 의존성 배열에 있으면 이 변화가 useEffect를 재실행시켜
    //       퀴즈가 새로 생성되면서 문제가 갑자기 바뀌는 현상이 발생함
    // 해결: hasFetchedRef로 "이미 요청했음"을 기록해서 중복 실행을 막음
    // useRef를 쓰는 이유: useState와 달리 값이 바뀌어도 리렌더링이 일어나지 않음
    //                    → 플래그 역할만 하면 충분하므로 useRef가 적합
    const hasFetchedRef = useRef(false);

    // 컴포넌트가 마운트될 때 퀴즈 생성 API 호출
    // useEffect: 컴포넌트 렌더링 후 실행되는 Hook
    // 두 번째 인자 [level, user]: level이나 user가 바뀔 때마다 재실행
    useEffect(() => {
        // 이미 퀴즈를 가져왔으면 재실행 안 함
        // user가 null → {email} 으로 바뀔 때 useEffect가 재실행되어도
        // 이 체크에서 걸려서 퀴즈가 새로 생성되는 걸 방지
        if (hasFetchedRef.current) return;

        const fetchQuiz = async () => {
            try {
                setLoading(true);

                // 요청 시작 시점에 바로 플래그 세팅
                // fetch가 끝나기 전에 useEffect가 다시 실행되더라도
                // 이 시점 이후로는 hasFetchedRef.current 체크에서 즉시 걸러짐
                hasFetchedRef.current = true;

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/quiz/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ level, email: user?.email || "" }),
                });

                // 429 에러: Rate Limit 초과
                if (res.status === 429) {
                    const data = await res.json();
                    setError(`⚠️ ${data.detail.message} ${data.detail.reset}`);
                    return;
                }

                if (!res.ok) throw new Error("퀴즈 생성 실패했습니다.");

                const data = await res.json();
                console.log("API 응답: ", data);
                setQuestions(data.questions);

                // 답안 배열 초기화 - 문항 수만큼 -1로 채움
                setAnswers(Array.from({ length: data.questions.length }, () => -1));
            } catch (err) {
                console.log(err);
                // 실패했으면 ref를 초기화해서 재시도 가능하게 함
                // (성공한 경우엔 초기화 안 함 — 재호출 방지)
                hasFetchedRef.current = false;
                setError("퀴즈를 불러오는 중 오류가 발생했습니다. 다시 시도하세요.");
            } finally {
                // 성공/실패 관계없이 로딩 종료
                setLoading(false);
            }
        };

        fetchQuiz();
    }, [level, user]);

    // 답안 선택 핸들러
    const handleAnswer = (optionIdx: number) => {
        // 배열 불변성 유지 - 기존 배열 복사 후 수정
        const newAnswer = [...answers];

        newAnswer[currentIdx] = optionIdx;
        setAnswers(newAnswer);
    };

    // 다음 문항으로 이동
    const handleNext = () => {
        if (currentIdx < questions.length - 1) {
            setCurrentIdx(currentIdx + 1);
        }
    };

    // 이전 문항으로 이동
    const handlePrev = () => {
        if (currentIdx > 0) {
            setCurrentIdx(currentIdx - 1);
        }
    };

    // 퀴즈 제출
    const handleSubmit = () => {
        // 정답 리스트 제출
        const correctAnswers = questions.map((q) => q.answer);

        // result 페이지로 이동하면서 데이터 전달
        // JSON.stringify로 직렬화해서 쿼리 파라미터로 전달
        const params = new URLSearchParams({
            level,
            answers: JSON.stringify(answers),
            correctAnswers: JSON.stringify(correctAnswers),
            questions: JSON.stringify(questions), // 문제 데이터도 같이 전달
        });

        router.push(`/onboarding/result?${params.toString()}`);
    };

    // 로딩 화면
    if (loading) {
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="text-5xl mb-4">🤔</div>
                    <p className="text-lg text-gray-600 dark:text-gray-400">
                        AI가 {level} 맞춤 진단 문제를 생성하고 있어요 🤖
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                        수준에 맞는 문제를 분석 중이에요. 시간이 조금 걸릴 수 있어요..
                    </p>
                </div>
            </main>
        );
    }

    // 에러 화면
    if (error) {
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="text-5xl mb-4">😢</div>
                    <p className="text-lg text-gray-600 dark:text-gray-400">{error}</p>
                    <button
                        onClick={() => router.push("/")}
                        className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg"
                    >
                        처음으로 돌아가기
                    </button>
                </div>
            </main>
        );
    }

    // 현재 문항
    const currentQuestion = questions[currentIdx];

    // 현재 문항 답안 선택 여부
    const currentAnswer = answers[currentIdx];

    // 마지막 문항 여부
    const isLastQuestion = currentIdx === questions.length - 1;

    // 모든 문항 답변 여부
    const allAnswered = answers.every((a) => a !== -1);

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-2xl">
                {/* 진행 상태 바 */}
                <div className="mb-8">
                    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <span>
                            {currentIdx + 1} / {questions.length}
                        </span>
                        <span>{answers.filter((a) => a !== -1).length}개 답변 완료</span>
                    </div>
                    {/* 진행률 바 - 현재 인덱스 기준 */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-indigo-600 h-2 rounded-full transition-all"
                            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
                        />
                    </div>
                </div>

                {/* 문제 카드 */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm mb-6">
                    {/* 개념 태그 */}
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                        {currentQuestion.concept}
                    </span>

                    {/* 문제 */}
                    {/* whitespace-pre-wrap: 코드 줄바꿈 유지 */}
                    <p className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-6 whitespace-pre-wrap">
                        {currentQuestion.question
                            .replace(/```python/g, "")
                            .replace(/```/g, "")
                            .trim()}
                    </p>

                    {/* 보기 */}
                    <div className="space-y-3">
                        {currentQuestion.options.map((option, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleAnswer(idx)}
                                className={`w-full p-4 rounded-lg border-2 text-left transition-all
                                ${
                                    currentAnswer === idx
                                        ? "border-indigo-500 bg-indigo-50 text-indigo-900 font-medium"
                                        : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-gray-600"
                                }`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 네비게이션 버튼 */}
                <div className="flex gap-3">
                    {/* 이전 버튼 */}
                    <button
                        onClick={handlePrev}
                        disabled={currentIdx === 0}
                        className={`flex-1 py-3 rounded-xl font-medium transition-all
                ${
                    currentIdx === 0
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                    >
                        ← 이전
                    </button>

                    {/* 다음 또는 제출 버튼 */}
                    {isLastQuestion ? (
                        <button
                            onClick={handleSubmit}
                            disabled={!allAnswered}
                            className={`flex-2 flex-grow py-3 rounded-xl font-medium transition-all
                ${
                    allAnswered
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
                        >
                            제출하기 ✓
                        </button>
                    ) : (
                        <button
                            onClick={handleNext}
                            disabled={currentAnswer === -1}
                            className={`flex-grow py-3 rounded-xl font-medium transition-all
                ${
                    currentAnswer !== -1
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
                        >
                            다음 →
                        </button>
                    )}
                </div>
            </div>
        </main>
    );
}

export default function QuizPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
                    <p className="text-gray-600">로딩 중...</p>
                </main>
            }
        >
            <QuizContent />
        </Suspense>
    );
}
