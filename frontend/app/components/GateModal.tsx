"use client";

// useState: 모달 내부 상태 관리
import { useState } from "react";

// 게이트 모달 props 타입 정의
type GateModalProps = {
    // 모달 표시 여부
    isOpen: boolean;

    // 원본 문제 ID
    problemId: string;

    // 사용자 이메일
    email: string;

    language: string;

    // 게이트 통과 시 호출되는 콜백 (토큰 전달)
    onPass: (token: string) => void;

    // 모달 닫기 콜백
    onClose: () => void;
};

// 게이트 문자 타입
type GateQuestion = {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
    concept: string;
};

export default function GateModal({ isOpen, problemId, email, language, onPass, onClose }: GateModalProps) {
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

    // 시도 횟수
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

    // 게이트 문제 생성 API 호출
    const fetchGateQuestion = async () => {
        setLoading(true);
        setSelectedAnswer(null);
        setResult(null);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/gate/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    problem_id: problemId,
                    email,
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

            if (!res.ok) throw new Error("게이트 문제 생성 실패");

            const data = await res.json();
            setGateQuestion(data);

            // 사용 현황 저장(응답에 usage가 있을 때만)
            if (data.usage) {
                setUsage(data.usage);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // 답안 제출 핸들러
    const handleSubmit = async () => {
        if (selectedAnswer === null || !gateQuestion) return;

        setLoading(true);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/gate/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    problem_id: problemId,
                    email,
                    gate_question: gateQuestion.question,
                    gate_options: gateQuestion.options,
                    user_answer: selectedAnswer,
                    correct_answer: gateQuestion.answer,
                }),
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl w-full max-w-lg border border-gray-600 max-h-[90vh] overflow-y-auto">
                {/* 모달 헤더 */}
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">🔒 이해 확인 게이트</h2>
                    <p className="text-sm text-gray-400 mt-1">같은 개념의 다른 문제를 풀어야 제출할 수 있어요</p>
                </div>

                {/* 모달 바디 */}
                <div className="p-6">
                    {/* 한도 초과(429) 안내 - 다른 무엇보다 먼저 표시 */}
                    {rateLimited ? (
                        <div className="text-center py-8">
                            <div className="text-5xl mb-4">🚫</div>
                            <p className="text-lg font-bold text-red-400 mb-2">오늘 게이트 사용 횟수를 모두 썼어요</p>
                            <p className="text-sm text-gray-400 mb-6">
                                게이트 문제 생성은 하루 10회까지 가능해요.
                                <br />
                                자정(00:00)에 초기화됩니다.
                            </p>
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-gray-600 text-white rounded-xl font-semibold hover:bg-gray-700 transition-all"
                            >
                                돌아가기
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 남은 횟수 경고 배너 (remaining ≤ 4, 즉 6회 이상 사용 시) */}
                            {usage && usage.remaining <= 4 && usage.remaining > 0 && (
                                <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                                    <p className="text-sm text-yellow-300">
                                        ⚠️ 오늘 게이트 사용이 {usage.remaining}회 남았어요
                                        <span className="text-yellow-500/70">
                                            {" "}
                                            ({usage.used}/{usage.limit})
                                        </span>
                                    </p>
                                </div>
                            )}

                            {/* 초기 상태 - 문제 생성 전 */}
                            {!gateQuestion && !loading && (
                                <div className="text-center py-8">
                                    <div className="text-5xl mb-4">🧠</div>
                                    <p className="text-gray-300 mb-6">
                                        테스트를 통과했어요!
                                        <br />
                                        이제 진짜 이해했는지 확인해볼까요?
                                    </p>
                                    <button
                                        onClick={fetchGateQuestion}
                                        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
                                    >
                                        게이트 문제 받기
                                    </button>
                                </div>
                            )}

                            {/* 로딩 상태 */}
                            {loading && (
                                <div className="text-center py-8">
                                    <p className="text-gray-400">
                                        {gateQuestion ? "답안 확인 중..." : "문제 생성 중..."}
                                    </p>
                                </div>
                            )}

                            {/* 문제 표시 */}
                            {gateQuestion && !loading && !result && (
                                <div>
                                    {/* 개념 태그 */}
                                    <span className="text-xs text-indigo-400 bg-indigo-900/50 px-3 py-1 rounded-full">
                                        {gateQuestion.concept}
                                    </span>

                                    {/* 문제 */}
                                    <p className="text-white mt-4 mb-6 whitespace-pre-wrap leading-relaxed">
                                        {gateQuestion.question
                                            .replace(/```python/g, "")
                                            .replace(/```/g, "")
                                            .trim()}
                                    </p>

                                    {/* 보기 */}
                                    <div className="space-y-3 mb-6">
                                        {gateQuestion.options.map((option, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedAnswer(idx)}
                                                className={`w-full p-3 rounded-lg border-2 text-left text-sm transition-all
                                                ${
                                                    selectedAnswer === idx
                                                        ? "border-indigo-500 bg-indigo-900/50 text-white"
                                                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                                                }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>

                                    {/* 제출 버튼 */}
                                    <button
                                        onClick={handleSubmit}
                                        disabled={selectedAnswer === null}
                                        className={`w-full py-3 rounded-xl font-semibold transition-all
                                        ${
                                            selectedAnswer !== null
                                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                                : "bg-gray-700 text-gray-500 cursor-not-allowed"
                                        }`}
                                    >
                                        답안 제출
                                    </button>
                                </div>
                            )}

                            {/* 결과 표시 */}
                            {result && (
                                <div className="text-center py-4">
                                    <div className="text-5xl mb-4">{result.passed ? "🎉" : "😢"}</div>
                                    <p
                                        className={`text-lg font-bold mb-4 ${
                                            result.passed ? "text-green-400" : "text-red-400"
                                        }`}
                                    >
                                        {result.message}
                                    </p>

                                    {/* 정답 해설 */}
                                    {gateQuestion && (
                                        <div className="bg-gray-700 rounded-lg p-4 mb-4 text-left">
                                            <p className="text-xs text-gray-400 mb-1">해설</p>
                                            <p className="text-sm text-gray-300">{gateQuestion.explanation}</p>
                                        </div>
                                    )}

                                    {result.passed ? (
                                        <button
                                            onClick={onClose}
                                            className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all"
                                        >
                                            제출하러 가기 →
                                        </button>
                                    ) : attempts < 3 ? (
                                        <button
                                            onClick={fetchGateQuestion}
                                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
                                        >
                                            다시 시도하기 ({attempts}/3)
                                        </button>
                                    ) : (
                                        <div>
                                            <p className="text-red-400 text-sm mb-4">
                                                3회 모두 실패했습니다. 문제를 다시 풀어보세요.
                                            </p>
                                            <button
                                                onClick={onClose}
                                                className="w-full py-3 bg-gray-600 text-white rounded-xl font-semibold hover:bg-gray-700 transition-all"
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
