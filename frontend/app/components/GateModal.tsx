"use client";

// useState: 모달 내부 상태 관리
import { useState } from "react";

import { createClient } from "../lib/supabase";

// 게이트 모달 props 타입 정의
type GateModalProps = {
    // 모달 표시 여부
    isOpen: boolean;

    // 원본 문제 ID
    problemId: string;

    language: string;

    // 게이트 통과 시 호출되는 콜백 (토큰 전달)
    onPass: (token: string) => void;

    // 모달 닫기 콜백
    onClose: () => void;
};

// 게이트 문제 타입
type GateQuestion = {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
    concept: string;
    multiSelect?: boolean;
};

export default function GateModal({ isOpen, problemId, language, onPass, onClose }: GateModalProps) {
    // 게이트 문제 데이터
    const [gateQuestion, setGateQuestion] = useState<GateQuestion | null>(null);

    // 사용자가 선택한 답안
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

    // 답안 제출 후 결과
    const [result, setResult] = useState<{
        passed: boolean;
        message: string;
        token: string | null;
    } | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(false);

    // 사용자가 '오답'을 낸 횟수 카운터 (0~3)
    // ⚠️ 주의: 이건 백엔드 gate.py의 AI 재생성 재시도(최대 3회, 정답 개수 검증 실패 시)와는
    // 완전히 다른 개념임. 여기 attempts는 "사용자가 문제를 틀린 횟수"이고,
    // 백엔드 쪽 재시도는 "AI가 만든 문제 자체가 깨졌을 때 서버 내부에서 다시 생성하는 횟수"임.
    // 우연히 둘 다 상한이 3이라 헷갈리기 쉬우니, 코드 수정 시 절대 혼동하지 말 것.
    const [attempts, setAttempts] = useState(0);

    // Rate Limit 사용 현황 (백엔드 usage 필드 저장)
    // remaining(남은 횟수)을 보고 사전 경고를 띄움
    const [usage, setUsage] = useState<{
        used: number;
        limit: number;
        remaining: number;
        reset: string;
    } | null>(null);

    // 한도 초과(429) 여부
    const [rateLimited, setRateLimited] = useState(false);

    // 다중 선택용
    const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);

    // 게이트 문제 생성 실패 시 사용자에게 보여줄 에러 메세지
    // null이면 에러 없음, 문자열이면 화면에 표시
    const [fetchError, setFetchError] = useState<string | null>(null);

    // 게이트 문제 생성 API 호출
    const fetchGateQuestion = async () => {
        setLoading(true);
        setSelectedAnswer(null);
        setResult(null);
        setFetchError(null); // 재시도 시 이전 에러 메시지 초기화

        try {
            // JWT 토큰 획득
            const supabase = createClient();
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                // 로그인 안 된 상태로 게이트에 진입한 극단적 케이스 방어
                setLoading(false);
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/gate/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    problem_id: problemId,
                    // email,
                    language: language,
                    // attempts가 0이면 이번 풀이의 첫 게이트 시도 → 백엔드가 gate_attempts를 1로 리셋
                    // attempts가 1 이상이면 재시도 → 누적
                    is_first: attempts === 0,
                }),
            });

            // 429: Rate Limit 한도 초과
            // 백엔드 check_rate_limit이 detail에 message/limit/used/reset을 담아 던짐
            if (res.status === 429) {
                setRateLimited(true);
                return;
            }

            // Rate Limit 한도 외 모든 실패(500, 네트워크 오류 등) - 원인 불문하고 동일하게 안내
            if (!res.ok) {
                setFetchError("문제를 불러오지 못했어요. 다시 시도해주세요.");
                return;
            }

            if (!res.ok) throw new Error("게이트 문제 생성 실패");

            const data = await res.json();
            setGateQuestion({ ...data, multiSelect: data.multi_select });
            setSelectedAnswers([]);

            // 사용 현황 저장(응답에 usage가 있을 때만)
            if (data.usage) {
                setUsage(data.usage);
            }
        } catch (err) {
            console.error(err);
            setFetchError("네트워크 오류가 발생했어요. 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    };

    // 답안 제출 핸들러
    const handleSubmit = async () => {
        // multiSelect일 때는 selectedAnswer(단수)가 아니라
        // selectedAnswers(복수)가 채워지므로, 조건을 분기해서 확인
        const hasSelection = gateQuestion?.multiSelect ? selectedAnswers.length > 0 : selectedAnswer !== null;

        if (!hasSelection || !gateQuestion) return;

        setLoading(true);

        try {
            // JWT 토큰 획득
            const supabase = createClient();
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                setLoading(false);
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/gate/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                // 신규: multiSelect면 user_answers(배열), 아니면 user_answer(단일)
                body: JSON.stringify(
                    gateQuestion.multiSelect
                        ? { problem_id: problemId, user_answers: selectedAnswers }
                        : { problem_id: problemId, user_answer: selectedAnswer },
                ),
            });

            if (!res.ok) throw new Error("답안 검증 실패");

            const data = await res.json();
            setResult(data);
            setAttempts(attempts + 1);

            // 통과하면 부모 컴포넌트에 토큰 전달
            if (data.passed && data.token) {
                onPass(data.token);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // 모달이 닫혀있으면 렌더링 안 함
    if (!isOpen) return null;

    return (
        // 모달 오버레이 - 배경 클릭해도 닫히지 않음 (의도적)
        // bg-black/70은 팔레트와 무관하게 고정값 유지 — 모달 뒤 배경을 어둡게
        // 눌러주는 역할이라, 라이트/다크 어느 쪽이든 "검은 반투명"이 자연스러움
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            {/* 수정: bg-gray-800 border-gray-600 → CSS 변수로 통일 */}
            <div className="bg-[var(--bg-2)] rounded-2xl w-full max-w-lg border border-[var(--border-c)] max-h-[90vh] overflow-y-auto">
                {/* 모달 헤더 */}
                <div className="p-6 border-b border-[var(--border-c)] flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold">🔒 이해 확인 게이트</h2>
                        <p className="text-sm text-[var(--text-2)] mt-1">
                            같은 개념의 다른 문제를 풀어야 제출할 수 있어요
                        </p>
                    </div>
                    {/* 닫기 버튼 - miny 피드백 반영 */}
                    {/* 게이트 도중 나가고 싶을 때 뒤로가기 외에 탈출 수단 제공 */}
                    <button
                        onClick={onClose}
                        className="text-[var(--text-3)] hover:text-[var(--text)] transition-all text-2xl leading-none ml-4 flex-shrink-0"
                        aria-label="닫기"
                    >
                        ✕
                    </button>
                </div>

                {/* 모달 바디 */}
                <div className="p-6">
                    {/* 한도 초과(429) 안내 - 다른 무엇보다 먼저 표시 */}
                    {rateLimited ? (
                        <div className="text-center py-8">
                            <div className="text-5xl mb-4">🚫</div>
                            {/* 위험/한도초과 안내는 관례상 빨강 유지 (팔레트 예외) */}
                            <p className="text-lg font-bold mb-2 text-red-500">오늘 게이트 사용 횟수를 모두 썼어요</p>
                            <p className="text-sm text-[var(--text-2)] mb-6">
                                게이트 문제 생성은 하루 10회까지 가능해요.
                                <br />
                                자정(00:00)에 초기화됩니다.
                            </p>
                            <button
                                onClick={onClose}
                                className="w-full py-3 rounded-xl font-semibold transition-all bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg)]"
                            >
                                돌아가기
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 남은 횟수 경고 배너 (remaining ≤ 4, 즉 6회 이상 사용 시) */}
                            {/* 수정: yellow → var(--accent2) (경고/주의 계열 팔레트 통일) */}
                            {usage && usage.remaining <= 4 && usage.remaining > 0 && (
                                <div
                                    className="mb-4 p-3 rounded-lg border"
                                    style={{ background: "var(--accent2-bg)", borderColor: "var(--accent2)" }}
                                >
                                    <p
                                        className="text-sm"
                                        style={{ color: "var(--accent2)" }}
                                    >
                                        ⚠️ 오늘 게이트 사용이 {usage.remaining}회 남았어요
                                        <span className="opacity-70">
                                            {" "}
                                            ({usage.used}/{usage.limit})
                                        </span>
                                    </p>
                                </div>
                            )}

                            {/* 초기 상태 - 문제 생성 전 */}
                            {!gateQuestion && !loading && !fetchError && (
                                <div className="text-center py-8">
                                    <div className="text-5xl mb-4">🧠</div>
                                    <p className="text-[var(--text-2)] mb-6 text-sm">
                                        테스트를 통과했어요!
                                        <br />
                                        이제 진짜 이해했는지 확인해볼까요?
                                    </p>
                                    <button
                                        onClick={fetchGateQuestion}
                                        className="px-8 py-3 rounded-xl font-semibold transition-all"
                                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                                    >
                                        게이트 문제 받기
                                    </button>
                                </div>
                            )}

                            {/* 신규: 문제 생성 실패 상태 — 원인을 숨기지 않고 재시도 버튼 제공 */}
                            {!gateQuestion && !loading && fetchError && (
                                <div className="text-center py-8">
                                    <div className="text-5xl mb-4">⚠️</div>
                                    <p className="text-sm mb-6 text-red-500">{fetchError}</p>
                                    <button
                                        onClick={fetchGateQuestion}
                                        className="px-8 py-3 rounded-xl font-semibold transition-all"
                                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                                    >
                                        다시 시도하기
                                    </button>
                                </div>
                            )}

                            {/* 로딩 상태 */}
                            {loading && (
                                <div className="text-center py-8">
                                    <p className="text-[var(--text-2)] text-sm">
                                        {gateQuestion ? "답안 확인 중..." : "문제 생성 중..."}
                                    </p>
                                </div>
                            )}

                            {/* 문제 표시 */}
                            {gateQuestion && !loading && !result && (
                                <div>
                                    {/* 개념 태그 - 수정: indigo → var(--accent3) (네이비, 정보성 배지 색) */}
                                    <span
                                        className="text-xs px-3 py-1 rounded-full"
                                        style={{ background: "var(--accent3-bg)", color: "var(--accent3)" }}
                                    >
                                        {gateQuestion.concept}
                                    </span>

                                    {/* 문제 */}
                                    <p className="mt-4 mb-6 whitespace-pre-wrap leading-relaxed text-sm">
                                        {gateQuestion.question
                                            .replace(/```python/g, "")
                                            .replace(/```/g, "")
                                            .trim()}
                                    </p>

                                    {/* 보기 */}
                                    <div className="space-y-3 mb-6">
                                        {gateQuestion.options.map((option, idx) => {
                                            const isChecked = gateQuestion.multiSelect
                                                ? selectedAnswers.includes(idx)
                                                : selectedAnswer === idx;
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => {
                                                        // 신규: multiSelect면 배열 토글, 아니면 단일 선택
                                                        if (gateQuestion.multiSelect) {
                                                            setSelectedAnswers((prev) =>
                                                                prev.includes(idx)
                                                                    ? prev.filter((i) => i !== idx)
                                                                    : [...prev, idx],
                                                            );
                                                        } else {
                                                            setSelectedAnswer(idx);
                                                        }
                                                    }}
                                                    className="w-full p-3 rounded-lg border-2 text-left text-sm transition-all"
                                                    style={
                                                        isChecked
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
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* 제출 버튼 */}
                                    <button
                                        onClick={handleSubmit}
                                        disabled={
                                            gateQuestion.multiSelect
                                                ? selectedAnswers.length === 0
                                                : selectedAnswer === null
                                        }
                                        className="w-full py-3 rounded-xl font-semibold transition-all"
                                        style={
                                            // 수정: selectedAnswer !== null 단독 조건 → disabled와 동일한
                                            // 로직으로 통일. multiSelect일 때는 selectedAnswer가 항상 null이라
                                            // 이 조건이 항상 false가 되어, 실제로는 클릭 가능한데도(disabled=false)
                                            // 계속 비활성화된 회색 스타일로 보이는 문제가 있었음
                                            (
                                                gateQuestion.multiSelect
                                                    ? selectedAnswers.length > 0
                                                    : selectedAnswer !== null
                                            )
                                                ? { background: "var(--btn-bg)", color: "var(--btn-text)" }
                                                : {
                                                      background: "var(--bg-3)",
                                                      color: "var(--text-3)",
                                                      cursor: "not-allowed",
                                                  }
                                        }
                                    >
                                        답안 제출
                                    </button>
                                </div>
                            )}

                            {/* 결과 표시 */}
                            {result && (
                                <div className="text-center py-4">
                                    <div className="text-5xl mb-4">{result.passed ? "🎉" : "😢"}</div>
                                    {/* 수정: green-400/red-400 → var(--accent)/빨강(예외 유지) */}
                                    <p
                                        className="text-lg font-bold mb-4"
                                        style={{ color: result.passed ? "var(--accent)" : "#dc2626" }}
                                    >
                                        {result.message}
                                    </p>

                                    {/* 정답 해설 */}
                                    {gateQuestion && (
                                        <div className="bg-[var(--bg-3)] rounded-lg p-4 mb-4 text-left">
                                            <p className="text-xs text-[var(--text-3)] mb-1">해설</p>
                                            <p className="text-sm text-[var(--text-2)]">{gateQuestion.explanation}</p>
                                        </div>
                                    )}

                                    {result.passed ? (
                                        // 통과 버튼: 성공 상태를 강조하기 위해 accent(그린)를 진하게 사용
                                        <button
                                            onClick={onClose}
                                            className="w-full py-3 rounded-xl font-semibold transition-all"
                                            style={{ background: "var(--accent)", color: "#fff" }}
                                        >
                                            제출하러 가기 →
                                        </button>
                                    ) : attempts < 3 ? (
                                        <button
                                            onClick={fetchGateQuestion}
                                            className="w-full py-3 rounded-xl font-semibold transition-all"
                                            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                                        >
                                            다시 시도하기 ({attempts}/3)
                                        </button>
                                    ) : (
                                        <div>
                                            <p className="text-sm mb-4 text-red-500">
                                                3회 모두 실패했습니다. 문제를 다시 풀어보세요.
                                            </p>
                                            <button
                                                onClick={onClose}
                                                className="w-full py-3 rounded-xl font-semibold transition-all bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg)]"
                                            >
                                                돌아가기
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
