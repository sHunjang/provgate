"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase";
// import ThemeToggle from "@/app/components/ThemeToggle";
import SiteNav from "@/app/components/SiteNav";

export default function SignupPage() {
    const router = useRouter();
    const supabase = createClient();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // ============================================================
    // 회원가입 완료 여부를 나타내는 상태
    // ============================================================
    // false: 회원가입 입력 폼을 보여줌
    // true : "이메일을 확인해주세요" 안내 화면으로 전환
    // 별도 페이지 이동(router.push) 대신 같은 페이지 안에서
    // 상태값만 바꿔서 화면을 전환하는 이유:
    //   회원가입 직후엔 아직 로그인된 게 아니라서(이메일 인증 전)
    //   보호된 페이지로 보내면 오히려 막힐 수 있음.
    //   그냥 이 페이지 안에서 "다음에 뭘 해야 하는지"를 바로 안내하는 게 흐름이 매끄러움
    const [isSignedUp, setIsSignedUp] = useState(false);

    const handleSignup = async () => {
        try {
            setLoading(true);
            setError(null);

            // Supabase Auth 회원가입 API
            // 성공하면 Supabase가 자동으로 인증 메일을 해당 이메일로 발송함
            // (SMTP 설정은 Supabase 프로젝트 대시보드에서 이미 구성돼 있어야 동작)
            const { error } = await supabase.auth.signUp({ email, password });

            if (error) throw error;

            // 회원가입 성공 -> 인증 안내 화면으로 전환
            setIsSignedUp(true);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // 공통 NAV를 함수로 뽑아낸 이유
    // ============================================================
    // 이 컴포넌트는 아래에서 "폼 화면"과 "안내 화면" 두 가지 JSX를
    // 조건부로 return 하는데, 두 화면 모두 똑같은 nav가 필요함.
    // 코드를 두 번 복붙하는 대신 작은 함수로 빼서 재사용
    // (컴포넌트 안에 컴포넌트를 정의하는 패턴 — 파일을 분리할 정도로
    //  크지 않은, 이 파일 안에서만 쓰이는 조각일 때 흔히 사용)
    // const Nav = () => (
    //     <nav className="h-14 border-b border-[var(--border-c)] bg-[var(--bg-2)] flex items-center justify-between px-6">
    //         <button
    //             onClick={() => router.push("/")}
    //             className="font-bold text-sm tracking-tight"
    //         >
    //             Prov<span style={{ color: "var(--accent)" }}>Gate</span>
    //         </button>
    //         <ThemeToggle />
    //     </nav>
    // );

    // ------------------------------------------------------------
    // 회원가입 완료 → 이메일 인증 안내 화면
    // 이 if문 때문에 컴포넌트 함수 전체가 여기서 return되고 종료됨
    // (아래에 있는 두 번째 return은 isSignedUp이 false일 때만 실행됨)
    // ------------------------------------------------------------
    if (isSignedUp) {
        return (
            <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
                <SiteNav />
                <div className="flex flex-col items-center justify-center px-6 py-16">
                    <div className="w-full max-w-sm">
                        <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-7 text-center">
                            {/* 원형 아이콘 배경 - accent-bg를 재사용해서
                                새로 색을 정의하지 않고 기존 팔레트 안에서 통일감 유지 */}
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: "var(--accent-bg)" }}
                            >
                                {/* Tabler 아이콘 라이브러리의 메일 아이콘
                                    이모지(📧) 대신 아이콘 폰트를 쓰면 OS/브라우저마다
                                    다르게 렌더링되는 이모지 특유의 비일관성을 피할 수 있음 */}
                                <i
                                    className="ti ti-mail"
                                    style={{ color: "var(--accent)", fontSize: "22px" }}
                                    aria-hidden="true"
                                />
                            </div>

                            <h2 className="text-base font-bold tracking-tight mb-2">이메일을 확인해주세요!</h2>
                            <p className="text-xs text-[var(--text-2)] mb-1.5">
                                {/* 방금 회원가입 폼에서 입력했던 email 상태값을 그대로 보여줌
                                    -> "내가 어떤 주소로 가입했는지" 다시 확인시켜주는 용도 */}
                                <span
                                    className="font-medium"
                                    style={{ color: "var(--accent)" }}
                                >
                                    {email}
                                </span>{" "}
                                로
                            </p>
                            <p className="text-xs text-[var(--text-2)] leading-relaxed mb-5">
                                인증 메일을 발송했습니다.
                                <br />
                                메일함을 확인 후 인증 링크를 클릭하면
                                <br />
                                로그인이 가능합니다.
                            </p>

                            {/* 스팸함 안내 - accent2(브라운/골드 계열)를 "주의" 용도로 재사용 */}
                            <div
                                className="rounded-md p-2.5 mb-5"
                                style={{ background: "var(--accent2-bg)" }}
                            >
                                <p
                                    className="text-[11px]"
                                    style={{ color: "var(--accent2)" }}
                                >
                                    메일이 보이지 않으면 스팸함을 확인해주세요.
                                </p>
                            </div>

                            <button
                                onClick={() => router.push("/auth/login")}
                                className="w-full py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
                                style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                            >
                                로그인 하러 가기
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    // ------------------------------------------------------------
    // 기본 화면: 회원가입 입력 폼
    // (isSignedUp이 false일 때, 즉 아직 제출 전이거나 컴포넌트가
    //  처음 마운트됐을 때 이 아래 코드가 실행됨)
    // ------------------------------------------------------------
    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <SiteNav />
            <div className="flex flex-col items-center justify-center px-6 py-16">
                <div className="w-full max-w-sm">
                    <div className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-7">
                        <h2 className="text-base font-bold tracking-tight mb-6">회원가입</h2>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">이메일</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="example@email.com"
                                className="w-full px-3.5 py-2.5 rounded-md border border-[var(--border-strong)]
                                    bg-[var(--bg)] text-[var(--text)] text-sm
                                    placeholder:text-[var(--text-3)]
                                    focus:outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </div>

                        <div className="mb-5">
                            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">비밀번호</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="6자 이상 입력하세요"
                                className="w-full px-3.5 py-2.5 rounded-md border border-[var(--border-strong)]
                                    bg-[var(--bg)] text-[var(--text)] text-sm
                                    placeholder:text-[var(--text-3)]
                                    focus:outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </div>

                        {error && (
                            <div
                                className="mb-4 p-2.5 rounded-md text-xs"
                                style={{ background: "var(--accent2-bg)", color: "var(--accent2)" }}
                            >
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleSignup}
                            disabled={loading || !email || !password}
                            className="w-full py-2.5 rounded-md text-sm font-medium transition-opacity"
                            style={
                                loading || !email || !password
                                    ? { background: "var(--bg-3)", color: "var(--text-3)", cursor: "not-allowed" }
                                    : { background: "var(--btn-bg)", color: "var(--btn-text)" }
                            }
                        >
                            {loading ? "처리 중..." : "회원가입"}
                        </button>

                        <p className="text-center text-xs text-[var(--text-3)] mt-4">
                            이미 계정이 있으신가요?{" "}
                            <button
                                onClick={() => router.push("/auth/login")}
                                className="font-medium underline underline-offset-2"
                                style={{ color: "var(--accent)" }}
                            >
                                로그인
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
