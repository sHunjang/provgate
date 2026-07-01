"use client";

// useState: 이메일, 비밀번호, 에러, 로딩 4가지 상태를 각각 독립적으로 관리
// (하나의 객체로 묶지 않고 나누는 이유: 각 값이 바뀔 때마다
//  필요한 부분만 리렌더링되도록 세분화하는 게 React의 일반적인 패턴)
import { useState } from "react";

// useRouter: 로그인 성공 후 "/"(홈)로 페이지 이동시키기 위해 사용
import { useRouter } from "next/navigation";

// createClient: Supabase(백엔드 인증 서비스) 클라이언트를 생성하는 함수
// Supabase Auth를 쓰면 비밀번호 해싱, 세션 토큰 관리 등을
// 직접 구현하지 않아도 됨 (보안에 민감한 로직을 검증된 서비스에 위임)
import { createClient } from "@/app/lib/supabase";

// 오늘 리디자인에서 만든 다크/라이트 토글 컴포넌트 재사용
import ThemeToggle from "@/app/components/ThemeToggle";

export default function LoginPage() {
    const router = useRouter();

    // supabase 인스턴스는 컴포넌트가 리렌더링될 때마다 새로 만들 필요 없이
    // 한 번만 생성해서 재사용 (매 렌더마다 createClient()가 다시 불리긴 하지만
    // Supabase 클라이언트 자체는 내부적으로 가벼운 래퍼라 문제없음)
    const supabase = createClient();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // string | null: 에러가 없으면 null, 있으면 에러 메시지 문자열
    // TypeScript의 유니온 타입으로 "에러 없음"과 "에러 있음" 두 상태를 명확히 구분
    const [error, setError] = useState<string | null>(null);

    // 로그인 요청이 진행 중인지 여부 -> 버튼 비활성화 및 "처리 중..." 텍스트에 사용
    const [loading, setLoading] = useState(false);

    // ------------------------------------------------------------
    // 로그인 처리 함수
    // ------------------------------------------------------------
    // async/await + try/catch/finally 패턴:
    //   try: 실제 로그인 요청 (실패할 수 있는 비동기 작업)
    //   catch: 실패 시 에러 메시지를 화면에 표시
    //   finally: 성공하든 실패하든 "로딩 중" 상태는 반드시 꺼야 함
    //     (finally가 없으면 에러 발생 시 버튼이 영원히 "처리 중..."에 멈춰있음)
    const handleLogin = async () => {
        try {
            setLoading(true);
            setError(null); // 재시도 시 이전 에러 메시지 초기화

            // Supabase Auth의 이메일+비밀번호 로그인 API 호출
            // 성공하면 내부적으로 세션(JWT 토큰)이 브라우저에 저장되고,
            // 이후 useAuth() 훅이 이 세션을 읽어서 로그인 상태를 판단함
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            // Supabase는 실패해도 예외(throw)를 던지지 않고
            // { error } 객체로 결과를 돌려주는 방식이라,
            // 직접 확인해서 throw 해줘야 아래 catch 블록이 실행됨
            if (error) throw error;

            router.push("/");
        } catch (err: unknown) {
            // catch의 err는 TypeScript에서 기본적으로 unknown 타입
            // (어떤 종류의 값이 던져질지 알 수 없기 때문에 안전하게 unknown으로 처리)
            // instanceof Error로 좁혀야(type narrowing) .message에 안전하게 접근 가능
            if (err instanceof Error) {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            {/* NAV — 홈(/), /learn과 동일한 패턴으로 통일 
                (로고 클릭 시 홈 이동 + 우측 테마 토글) */}
            <nav className="h-14 border-b border-[var(--border-c)] bg-[var(--bg-2)] flex items-center justify-between px-6">
                <button
                    onClick={() => router.push("/")}
                    className="font-bold text-sm tracking-tight"
                >
                    Prov<span style={{ color: "var(--accent)" }}>Gate</span>
                </button>
                <ThemeToggle />
            </nav>

            <div className="flex flex-col items-center justify-center px-6 py-16">
                {/* max-w-sm: 폼처럼 좁은 콘텐츠는 화면 전체 너비로 늘리지 않고
                    적당한 최대 너비로 제한해야 가독성이 좋음 (한 줄에 너무 긴 입력창은 시선 이동 부담) */}
                <div className="w-full max-w-sm">
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-7">
                        <h2 className="text-base font-bold tracking-tight mb-6">로그인</h2>

                        {/* 이메일 입력 */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">이메일</label>
                            <input
                                type="email"
                                value={email}
                                // e.target.value: 사용자가 입력창에 타이핑할 때마다
                                // 발생하는 이벤트에서 현재 입력값을 꺼내는 표준 방식
                                // 이렇게 state와 input의 value를 묶는 걸 "controlled input"이라 부름
                                // (React가 입력값의 유일한 출처(source of truth)가 됨)
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="example@email.com"
                                className="w-full px-3.5 py-2.5 rounded-md border border-[var(--border-strong)]
                                    bg-[var(--bg)] text-[var(--text)] text-sm
                                    placeholder:text-[var(--text-3)]
                                    focus:outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </div>

                        {/* 비밀번호 입력 - type="password"는 브라우저가 자동으로 입력값을 ●●●로 마스킹 처리 */}
                        <div className="mb-5">
                            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">비밀번호</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="비밀번호를 입력하세요"
                                className="w-full px-3.5 py-2.5 rounded-md border border-[var(--border-strong)]
                                    bg-[var(--bg)] text-[var(--text)] text-sm
                                    placeholder:text-[var(--text-3)]
                                    focus:outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </div>

                        {/* 에러 메시지 - error가 null이 아닐 때만 렌더링(&& 단축 평가) */}
                        {error && (
                            <div
                                className="mb-4 p-2.5 rounded-md text-xs"
                                style={{ background: "var(--accent2-bg)", color: "var(--accent2)" }}
                            >
                                {error}
                            </div>
                        )}

                        {/* 로그인 버튼
                            disabled 조건: 로딩 중이거나, 이메일/비밀번호 중 하나라도 비어있으면 비활성화
                            빈 문자열("")은 JavaScript에서 falsy 값이라 !email로 "비어있음"을 판단 가능 */}
                        <button
                            onClick={handleLogin}
                            disabled={loading || !email || !password}
                            className="w-full py-2.5 rounded-md text-sm font-medium transition-opacity"
                            // 삼항 연산자로 두 가지 스타일 상태를 나눔
                            // (비활성화 상태: 회색조 / 활성화 상태: 브랜드 버튼 색)
                            style={
                                loading || !email || !password
                                    ? { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                                    : { background: "var(--btn-bg)", color: "var(--btn-text)" }
                            }
                        >
                            {loading ? "처리 중..." : "로그인"}
                        </button>

                        <p className="text-center text-xs text-[var(--text-3)] mt-4">
                            계정이 없으신가요?{" "}
                            <button
                                onClick={() => router.push("/auth/signup")}
                                className="font-medium underline underline-offset-2"
                                style={{ color: "var(--accent)" }}
                            >
                                회원가입
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
