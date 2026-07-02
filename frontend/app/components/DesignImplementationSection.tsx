"use client";
// "use client" 선언: 브라우저(클라이언트)에서 실행되는 컴포넌트
// useState 같은 React Hook은 클라이언트 컴포넌트에서만 쓸 수 있음

import { useState } from "react";

// ============================================================
// 타입 정의
// ============================================================
type Props = {
    problem: {
        id: string;
        requirements?: string | null; // 느슨한 요구사항 (학습자에게 보여줄 설명)
        thinking_hints?: string[] | null; // 생각해볼 질문 목록 (정답 아님, 방향만 제시)
    };

    // 학습자가 작성한 코드 (page.tsx의 code state를 그대로 전달받음)
    // 이 컴포넌트는 코드를 직접 관리하지 않고, 부모가 가진 값을 "읽기"만 함
    code: string;

    // 코드 실행 결과 (page.tsx의 testResult를 그대로 전달받음)
    executionResult: { success: boolean; message: string } | null;

    // 사용자 이메일 (API 호출 시 필요)
    email: string;

    // 설계(my_conditions)가 제출됐을 때 부모에게 알리는 콜백
    onConditionsSubmit: () => void;

    // AI 피드백을 다 보고 게이트로 넘어가고 싶을 때 부모에게 알리는 콜백
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
// 시각 테마: 기존 청록색(teal) → var(--accent3)(네이비)로 통일
//   coding/ai_reading = accent(그린), ai_debugging = accent2(골드),
//   ai_question/design_implementation = accent3(네이비) — 팔레트가 3색뿐이라
//   질문형/설계형 두 유형이 같은 톤을 공유하되, 아이콘/문구로 구분함
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
        // → 부모는 이 신호로 오른쪽 코드 에디터를 활성화 상태로 전환
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
                <h3 className="text-sm font-bold text-[var(--text-2)] mb-3">📋 요구사항</h3>
                {/* whitespace-pre-wrap: YAML의 줄바꿈(|)을 그대로 화면에 표시 */}
                <p className="text-[var(--text-2)] text-sm whitespace-pre-wrap mb-4">{problem.requirements}</p>

                {/* 생각해볼 질문: 정답이 아니라 방향만 제시하는 가이드 */}
                {/* 수정: teal → var(--accent3) (네이비) */}
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
                                // key: React가 리스트의 각 항목을 구분하는 고유 식별자 (필수)
                                <li key={idx}>· {hint}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* 1단계: 설계 작성 (제출 전까지만 textarea 표시) */}
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
                // 2단계: 설계 제출 완료 후 — 작성한 설계를 다시 보여줌 (참고용)
                <div className="bg-[var(--bg-2)] rounded-xl p-5">
                    <p className="text-xs text-[var(--text-3)] mb-2">내가 제출한 설계</p>
                    <pre className="text-sm font-mono whitespace-pre-wrap text-[var(--text-2)]">{myConditions}</pre>
                </div>
            )}

            {/* 3단계: 코드 실행 결과가 있으면 + AI 피드백 아직 없으면 → 피드백 받기 버튼 표시 */}
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
                    {/* 에러 메시지 (Rate Limit 초과 등) — 관례상 빨강 유지 */}
                    {feedbackError && <p className="text-xs text-red-500 mt-2">{feedbackError}</p>}
                </div>
            )}

            {/* 4단계: AI 피드백 표시 */}
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
                    {/* split("\n"): 줄바꿈 기준으로 나눠서 각 줄을 별도 <p>로 렌더링 */}
                    <div
                        className="text-sm space-y-2 whitespace-pre-wrap"
                        style={{ color: "var(--text)" }}
                    >
                        {feedback.split("\n").map((line, idx) => (line.trim() ? <p key={idx}>{line}</p> : null))}
                    </div>

                    {/* 이해 확인하러 가기 버튼 (다른 유형의 onComplete와 동일한 역할) */}
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
