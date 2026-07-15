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

import { createClient } from "@/app/lib/supabase";

// 신규: 사이트 공통 네비게이션 (로고 + 링크 + 로그인/유저메뉴 + 테마토글)
// 오늘 오후에 6개 페이지 중복 코드를 통합해서 만든 컴포넌트를 그대로 재사용
import SiteNav from "@/app/components/SiteNav";

// 퀴즈 문항 타입 정의
type Question = {
    id: number;
    question: string;
    options: string[];
    answer: number;
    concept: string;
    explanation: string;
};

// ============================================================
// 신규: 문제 텍스트에서 마크다운 코드블록 마커를 벗겨내는 함수
// ============================================================
// 왜 별도 함수로 뺐나:
//   기존엔 JSX 안에서 .replace(/```python/g, "").replace(/```/g, "") 처럼
//   두 번만 치환했다. 그런데 AI가 코드블록을 항상 ```python 형태로만 주는 게
//   아니라서(```py, ```Python, 또는 ``` 다음 줄에 "python"만 따로 오는 등)
//   그 두 패턴에 안 걸리는 경우 "python" 이라는 글자가 화면에 그대로 남았다.
//   (온보딩 2/5 화면 맨 위에 "python"이 덩그러니 찍힌 그 현상)
//
//   근본 해결은 코드블록을 <pre><code>로 하이라이팅 렌더링하는 것이지만,
//   그건 데모에 필수가 아니라 다음으로 미룬다. 지금은 "언어 표기 잔여물"만
//   확실히 제거해서 첫인상이 깨지지 않게 하는 선까지만 처리한다.
function stripCodeFence(text: string): string {
    if (!text) return "";
    return (
        text
            // ```python / ```py / ```Python 등 여는 펜스 + 언어표기를 통째로 제거
            // (```로 시작하고 뒤에 영문 언어명이 0개 이상 붙는 형태)
            .replace(/```[a-zA-Z]*/g, "")
            // 위에서 펜스는 지웠지만, 펜스 없이 "python" 단어만 한 줄로 남는
            // 케이스가 있어서, 줄 전체가 언어명 하나뿐인 줄을 지운다.
            // (^\s*  줄 시작 공백,  (python|py) 언어명,  \s*$  줄 끝 공백)
            .replace(/^\s*(python|py)\s*$/gim, "")
            .trim()
    );
}

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

                // 로그인한 경우에만 토큰을 가져옴 (게스트는 토큰 없이 진행)
                const supabase = createClient();
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const token = session?.access_token;

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/quiz/generate`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ level }),
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
    // 수정: bg-gray-50 dark:bg-gray-900 → var(--bg) / SiteNav 추가
    // (이 페이지엔 원래 헤더 자체가 없었는데, 다른 페이지들과의 일관성을 위해
    //  로딩/에러/본문 화면 전부에 SiteNav를 붙임)
    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--bg)]">
                <SiteNav />
                <div className="flex flex-col items-center justify-center py-24">
                    <div className="text-center">
                        {/* ============================================================
                        신규: 회전 스피너
                        ============================================================
                        border-4: 두꺼운 원형 테두리
                        border-t-transparent: 위쪽 테두리만 투명하게 뚫어서
                          "원의 일부가 비어있는" 모양을 만듦 → 회전시키면
                          그 빈 부분이 계속 도는 것처럼 보여서 "로딩 중" 느낌을 줌
                        animate-spin: Tailwind 내장 애니메이션, 1초에 한 바퀴 회전
                        rounded-full: 완전한 원형으로 만듦
                        w-10 h-10: 크기 지정 (텍스트보다 살짝 작게, 부담스럽지 않은 크기)
                    */}
                        <div
                            className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-5"
                            style={{
                                borderColor: "var(--accent-bg)",
                                borderTopColor: "var(--accent)",
                            }}
                        />
                        <p className="text-base text-[var(--text-2)]">
                            AI가 {level} 맞춤 진단 문제를 생성하고 있어요 🤖
                        </p>
                        <p className="text-sm text-[var(--text-3)] mt-2">
                            수준에 맞는 문제를 분석 중이에요. 시간이 조금 걸릴 수 있어요..
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    // 에러 화면
    // 수정: 배경/텍스트 CSS 변수화, 버튼 indigo → var(--btn-bg)
    if (error) {
        return (
            <main className="min-h-screen bg-[var(--bg)]">
                <SiteNav />
                <div className="flex flex-col items-center justify-center py-24">
                    <div className="text-center">
                        <div className="text-5xl mb-4">😢</div>
                        <p className="text-base text-[var(--text-2)]">{error}</p>
                        <button
                            onClick={() => router.push("/")}
                            className="mt-4 px-6 py-2 rounded-lg text-sm"
                            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                        >
                            처음으로 돌아가기
                        </button>
                    </div>
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
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            {/* 신규: SiteNav — 이 페이지는 특정 링크가 필요 없어서 props 없이 기본형만 사용 */}
            <SiteNav />

            <div className="flex flex-col items-center px-6 py-10">
                <div className="w-full max-w-2xl">
                    {/* 진행 상태 바 */}
                    {/* 수정: text-gray-500 → var(--text-2), bg-gray-200 → var(--border-c),
                        진행률 바 색 indigo-600 → var(--accent) */}
                    <div className="mb-8">
                        <div className="flex justify-between text-sm text-[var(--text-2)] mb-2">
                            <span>
                                {currentIdx + 1} / {questions.length}
                            </span>
                            <span>{answers.filter((a) => a !== -1).length}개 답변 완료</span>
                        </div>
                        <div className="w-full bg-[var(--border-c)] rounded-full h-2">
                            <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                    width: `${((currentIdx + 1) / questions.length) * 100}%`,
                                    background: "var(--accent)",
                                }}
                            />
                        </div>
                    </div>

                    {/* 문제 카드 */}
                    {/* 수정: bg-white dark:bg-gray-800 → var(--bg-2) */}
                    <div className="bg-[var(--bg-2)] rounded-xl p-8 mb-6 border border-[var(--border-c)]">
                        {/* 개념 태그 */}
                        {/* 수정: text-indigo-600 bg-indigo-50 → var(--accent3)/var(--accent3-bg)
                            (GateModal의 concept 태그와 동일한 색 체계로 통일 — 게이트도
                             같은 성격의 "개념 확인" 태그라서 같은 색을 씀) */}
                        <span
                            className="text-xs font-medium px-3 py-1 rounded-full"
                            style={{ background: "var(--accent3-bg)", color: "var(--accent3)" }}
                        >
                            {currentQuestion.concept}
                        </span>

                        {/* 문제 */}
                        {/* whitespace-pre-wrap: 코드 줄바꿈 유지 */}
                        {/* 수정: 인라인 .replace(...) 2개 → stripCodeFence() 헬퍼로 교체
                            ('python' 잔여물이 화면에 노출되던 문제 해결) */}
                        <p className="text-base font-medium mt-4 mb-6 whitespace-pre-wrap">
                            {stripCodeFence(currentQuestion.question)}
                        </p>

                        {/* 보기 */}
                        {/* 수정: indigo 선택/호버 색 → var(--accent) 계열로 통일 */}
                        <div className="space-y-3">
                            {currentQuestion.options.map((option, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleAnswer(idx)}
                                    className="w-full p-4 rounded-lg border-2 text-left transition-all text-sm"
                                    style={
                                        currentAnswer === idx
                                            ? {
                                                  borderColor: "var(--accent)",
                                                  background: "var(--accent-bg)",
                                                  color: "var(--text)",
                                                  fontWeight: 500,
                                              }
                                            : {
                                                  borderColor: "var(--border-c)",
                                                  background: "var(--bg-2)",
                                                  color: "var(--text-2)",
                                              }
                                    }
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 네비게이션 버튼 */}
                    {/* 수정: 비활성 상태 gray → var(--bg-3)/var(--text-3),
                        활성 상태 indigo → var(--btn-bg) */}
                    <div className="flex gap-3">
                        {/* 이전 버튼 */}
                        <button
                            onClick={handlePrev}
                            disabled={currentIdx === 0}
                            className="flex-1 py-3 rounded-xl font-medium transition-all text-sm border"
                            style={
                                currentIdx === 0
                                    ? {
                                          background: "var(--bg-3)",
                                          color: "var(--text-3)",
                                          borderColor: "var(--border-c)",
                                          cursor: "not-allowed",
                                      }
                                    : {
                                          background: "var(--bg-2)",
                                          color: "var(--text-2)",
                                          borderColor: "var(--border-strong)",
                                      }
                            }
                        >
                            ← 이전
                        </button>

                        {/* 다음 또는 제출 버튼 */}
                        {isLastQuestion ? (
                            <button
                                onClick={handleSubmit}
                                disabled={!allAnswered}
                                className="flex-grow py-3 rounded-xl font-medium transition-all text-sm"
                                style={
                                    allAnswered
                                        ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                        : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                                }
                            >
                                제출하기 ✓
                            </button>
                        ) : (
                            <button
                                onClick={handleNext}
                                disabled={currentAnswer === -1}
                                className="flex-grow py-3 rounded-xl font-medium transition-all text-sm"
                                style={
                                    currentAnswer !== -1
                                        ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                        : { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                                }
                            >
                                다음 →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function QuizPage() {
    return (
        <Suspense
            fallback={
                // 수정: bg-gray-50 dark:bg-gray-900 → var(--bg), text-gray-600 → var(--text-2)
                <main className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-8">
                    <p className="text-[var(--text-2)] text-sm">로딩 중...</p>
                </main>
            }
        >
            <QuizContent />
        </Suspense>
    );
}
