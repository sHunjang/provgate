"use client";

// useState: 이메일, 패스워드, 에러, 로딩 상태 관리
import { useState } from "react";

// useRouter: 회원가입 완료 후 페이지 이동
import { useRouter } from "next/navigation";

// createClient: Supabase 클라이언트 생성 함수
import { createClient } from "@/app/lib/supabase";

export default function SignupPage() {
    const router = useRouter();
    const supabase = createClient();

    // 이메일 입력값 상태
    const [email, setEmail] = useState("");

    // 패스워드 입력값 상태
    const [password, setPassword] = useState("");

    // 에러 메세지 상태
    const [error, setError] = useState<string | null>(null);

    // 로딩 상태
    const [loading, setLoading] = useState(false);

    // 회원가입 완료 상태
    // true: 이메일 인증 안내 화면 표시
    // false: 회원가입 폼 표시
    const [isSignedUp, setIsSignedUp] = useState(false);

    // 회원가입 처리 함수
    const handleSignup = async () => {
        try {
            setLoading(true);
            setError(null);

            // Supabase Auth로 회원가입
            // Supabase가 자동으로 인증 메일 발송
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) throw error;

            // 회원가입 성공 시 이메일 인증 안내 화면으로 전환
            // router.push("/") 대신 isSignedUp을 true로 변경
            // 유저가 인증 메일 확인 후 로그인할 수 있도록 안내
            setIsSignedUp(true);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    // 회원가입 완료 시 이메일 인증 안내 화면
    // isSignedUp이 true일 때만 렌더링
    if (isSignedUp) {
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm text-center">
                        {/* 이메일 아이콘 */}
                        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">📧</span>
                        </div>

                        {/* 안내 텍스트 */}
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">이메일을 확인해주세요!</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
                            {/* 회원가입 시 입력한 이메일 표시 */}
                            <span className="text-indigo-500 font-medium">{email}</span> 로
                        </p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                            인증 메일을 발송했습니다.
                            <br />
                            메일함을 확인 후 인증 링크를 클릭하면
                            <br />
                            로그인이 가능합니다.
                        </p>

                        {/* 스팸 안내
                            인증 메일이 스팸함으로 분류될 수 있어서 안내 */}
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-6">
                            <p className="text-yellow-700 dark:text-yellow-400 text-xs">
                                📌 메일이 보이지 않으면 스팸함을 확인해주세요.
                            </p>
                        </div>

                        {/* 로그인 페이지로 이동 버튼
                            인증 완료 후 로그인하러 이동 */}
                        <button
                            onClick={() => router.push("/auth/login")}
                            className="w-full py-3 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
                        >
                            로그인 하러 가기
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-md">
                {/* 헤더 */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Provgate</h1>
                    <p className="text-gray-500 dark:text-gray-400">AI와 함께, 이해는 스스로</p>
                </div>

                {/* 회원가입 카드 */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">회원가입</h2>

                    {/* 이메일 입력 */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            이메일
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@email.com"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    {/* 패스워드 입력 */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            비밀번호
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="6자 이상 입력하세요"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    {/* 에러 메시지 */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* 회원가입 버튼 */}
                    <button
                        onClick={handleSignup}
                        disabled={loading || !email || !password}
                        className={`w-full py-3 rounded-xl font-semibold transition-all ${
                            loading || !email || !password
                                ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                    >
                        {loading ? "처리 중..." : "회원가입"}
                    </button>

                    {/* 로그인 링크 */}
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                        이미 계정이 있으신가요?{" "}
                        <button
                            onClick={() => router.push("/auth/login")}
                            className="text-indigo-600 hover:underline font-medium"
                        >
                            로그인
                        </button>
                    </p>
                </div>
            </div>
        </main>
    );
}
