"use client";
// "use client" 선언: 브라우저(클라이언트)에서 실행되는 컴포넌트
// useState 같은 React Hook은 클라이언트 컴포넌트에서만 쓸 수 있음

import { useState } from "react";

// ============================================================
// 타입 정의
// ============================================================

// 이 컴포넌트가 부모(page.tsx)로부터 받는 데이터 타입
type Props = {
    problem: {
        id: string;
        // ?: page.tsx의 Problem 타입과 동일하게 "선택적 필드"로 맞춤
        // (필수 필드 + undefined 허용이 아니라, 속성 자체가 없어도 되는 것으로)
        requirements?: string | null; // 느슨한 요구사항 (학습자에게 보여줄 설명)
        thinking_hints?: string[] | null; // 생각해볼 질문 목록 (정답 아님, 방향만 제시)
    };

    // 학습자가 작성한 코드 (page.tsx의 code state를 그대로 전달받음)
    // 이 컴포넌트는 코드를 직접 관리하지 않고, 부모가 가진 값을 "읽기"만 함
    // 이유: 오른쪽 코드 에디터(CodeEditor)는 page.tsx에 있고,
    //      이 컴포넌트는 왼쪽에 있어서 같은 코드 값을 공유해야 함
    code: string;

    // 코드 실행 결과 (page.tsx의 testResult를 그대로 전달받음)
    // null = 아직 실행 안 함
    executionResult: { success: boolean; message: string } | null;

    // 사용자 이메일 (API 호출 시 필요)
    email: string;

    // 설계(my_conditions)가 제출됐을 때 부모에게 알리는 콜백
    // 부모는 이걸로 "이제 코드 에디터를 활성화해도 된다"를 판단함
    onConditionsSubmit: () => void;

    // AI 피드백을 다 보고 게이트로 넘어가고 싶을 때 부모에게 알리는 콜백
    // AIReadingSection의 onComplete와 같은 역할
    onComplete: () => void;
};

// ============================================================
// DesignImplementationSection 컴포넌트
// 역할: "AI 없이 직접 설계하기" 문제 유형 전용 섹션
//
// 다른 유형(AIReading 등)과 다른 점:
//   - 정답이 정해진 4지선다가 아니라, 학습자가 "직접" 조건을 적어야 함
//   - 그래서 진행 단계가 더 많음: 설계 작성 → 코드 작성(부모 영역) → AI 피드백
//
// 시각 테마: 청록색(teal) — 다른 유형들과 구분되는 색
//   coding/ai_reading = indigo, ai_debugging = red, ai_question = purple
// ============================================================

export default function DesignImplementationSection({
    problem,
    code,
    executionResult,
    email,
    onConditionsSubmit,
    onComplete,
}: Props) {
    // --- 상태(State) 정의 ---

    // 학습자가 직접 적은 설계 (글)
    // 예: "1. 이메일 형식 검사  2. 중복 체크  3. 비밀번호 확인"
    const [myConditions, setMyConditions] = useState("");

    // 설계를 제출했는지 여부
    // false = 아직 작성 중 (textarea 보임)
    // true = 제출 완료 (이제 오른쪽에서 코드 작성 가능)
    const [conditionsSubmitted, setConditionsSubmitted] = useState(false);

    // AI 피드백 텍스트 (아직 요청 안 했으면 null)
    const [feedback, setFeedback] = useState<string | null>(null);

    // AI 피드백 요청 중 로딩 상태
    const [feedbackLoading, setFeedbackLoading] = useState(false);

    // 429 (Rate Limit 초과) 등 에러 메시지
    const [feedbackError, setFeedbackError] = useState<string | null>(null);

    // --- 이벤트 핸들러 ---

    // "설계 제출하고 코드 작성하기" 버튼 클릭
    const handleConditionsSubmit = () => {
        // 빈 칸으로는 제출 못 하게 막음
        // trim(): 앞뒤 공백만 있는 경우(스페이스만 입력 등)도 빈 값으로 처리
        if (myConditions.trim() === "") return;

        setConditionsSubmitted(true);

        // 부모(page.tsx)에게 "설계 제출 완료"를 알림
        // → 부모는 이 신호로 오른콽 코드 에디터를 활성화 상태로 전환
        onConditionsSubmit();
    };

    // "AI 피드백 받기" 버튼 클릭
    const handleGetFeedback = async () => {
        // 코드를 아직 실행 안 했으면(테스트 통과 결과가 없으면) 피드백 요청 의미 없음
        if (!executionResult) return;

        setFeedbackLoading(true);
        setFeedbackError(null);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/design/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    problem_id: problem.id,
                    my_conditions: myConditions,
                    code: code,
                    // execution_result는 백엔드에서 JSON 문자열로 받기로 했으므로
                    // JS 객체를 문자열로 직렬화해서 보냄 (JSON.stringify)
                    execution_result: JSON.stringify(executionResult),
                    email: email,
                }),
            });

            // 429 에러: 오늘 사용 횟수(하루 10회) 초과
            // hint.py 호출 패턴과 동일하게 처리
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

    // --- 메인 화면 렌더링 ---
    return (
        <div className="mt-6">
            {/* 요구사항 + 생각해볼 질문 (항상 표시) */}
            <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-400 mb-3">📋 요구사항</h3>
                {/* whitespace-pre-wrap: YAML의 줄바꿈(|)을 그대로 화면에 표시 */}
                <p className="text-gray-300 text-sm whitespace-pre-wrap mb-4">{problem.requirements}</p>

                {/* 생각해볼 질문: 정답이 아니라 방향만 제시하는 가이드 */}
                {/* thinking_hints가 없을 수도 있으니 null 체크 + 배열 길이 체크 */}
                {problem.thinking_hints && problem.thinking_hints.length > 0 && (
                    <div className="bg-teal-950/30 border border-teal-800 rounded-lg p-4">
                        <p className="text-xs text-teal-400 mb-2 font-bold">💭 생각해볼 질문</p>
                        <ul className="text-sm text-teal-200 space-y-1">
                            {problem.thinking_hints.map((hint, idx) => (
                                // key: React가 리스트의 각 항목을 구분하는 고유 식별자 (필수)
                                <li key={idx}>· {hint}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* 1단계: 설계 작성 (제출 전까지만 textarea 표시) */}
            {!conditionsSubmitted ? (
                <div className="bg-gray-800 rounded-xl p-5">
                    <p className="text-xs text-teal-400 mb-2 font-bold">✏️ 당신의 설계를 적어보세요</p>
                    <p className="text-xs text-gray-500 mb-3">
                        정답은 없습니다 — 당신이 생각한 조건과 순서가 곧 설계입니다.
                    </p>
                    <textarea
                        value={myConditions}
                        onChange={(e) => setMyConditions(e.target.value)}
                        placeholder={
                            "예) 1. 이메일 형식이 올바른지 검사한다\n2. 이미 가입된 이메일인지 확인한다\n3. ..."
                        }
                        className="w-full min-h-[140px] p-3 rounded-lg bg-gray-900 border border-gray-700
                            text-sm text-gray-200 font-mono resize-y
                            focus:outline-none focus:border-teal-600"
                    />
                    <button
                        onClick={handleConditionsSubmit}
                        disabled={myConditions.trim() === ""}
                        className={`w-full mt-3 py-2 rounded-lg text-sm font-medium transition-all
                            ${
                                myConditions.trim() !== ""
                                    ? "bg-teal-600 text-white hover:bg-teal-700"
                                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        설계 제출하고 코드 작성하기 →
                    </button>
                </div>
            ) : (
                // 2단계: 설계 제출 완료 후 — 작성한 설계를 다시 보여줌 (참고용)
                <div className="bg-gray-800 rounded-xl p-5">
                    <p className="text-xs text-gray-500 mb-2">내가 제출한 설계</p>
                    <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">{myConditions}</pre>
                </div>
            )}

            {/* 3단계: 코드 실행 결과가 있으면 + AI 피드백 아직 없으면 → 피드백 받기 버튼 표시 */}
            {conditionsSubmitted && executionResult && !feedback && (
                <div className="mt-4">
                    <button
                        onClick={handleGetFeedback}
                        disabled={feedbackLoading}
                        className={`w-full py-2 rounded-lg text-sm font-medium transition-all
                            ${
                                feedbackLoading
                                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                    : "bg-teal-600 text-white hover:bg-teal-700"
                            }`}
                    >
                        {feedbackLoading ? "AI가 분석하는 중..." : "🤖 AI 피드백 받기"}
                    </button>
                    {/* 에러 메시지 (Rate Limit 초과 등) */}
                    {feedbackError && <p className="text-xs text-red-400 mt-2">{feedbackError}</p>}
                </div>
            )}

            {/* 4단계: AI 피드백 표시 */}
            {feedback && (
                <div className="mt-4 bg-teal-950/30 border border-teal-800 rounded-lg p-4">
                    <p className="text-xs text-teal-400 mb-2 font-bold">🤖 AI의 피드백</p>
                    {/* split("\n"): 줄바꿈 기준으로 나눠서 각 줄을 별도 <p>로 렌더링 */}
                    {/* hint.py, AIReadingSection 등과 동일하게 plain text를 줄 단위로 표시 */}
                    <div className="text-sm text-teal-200 space-y-2 whitespace-pre-wrap">
                        {feedback.split("\n").map((line, idx) => (line.trim() ? <p key={idx}>{line}</p> : null))}
                    </div>

                    {/* 이해 확인하러 가기 버튼 (다른 유형의 onComplete와 동일한 역할) */}
                    <button
                        onClick={onComplete}
                        className="w-full mt-4 py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition-all"
                    >
                        이해 확인하러 가기 →
                    </button>
                </div>
            )}
        </div>
    );
}
