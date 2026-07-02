"use client";

import { usePathname, useRouter } from "next/navigation";
import AuthButton from "@/app/components/AuthButton";
import ThemeToggle from "@/app/components/ThemeToggle";
import { useAuth } from "@/app/hooks/useAuth";

export default function GlobalHeader() {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();

    // 문제 풀이 데이터(/problems/[id])는 자체 헤더가 있어서 숨김
    const hasOwnNav =
        pathname === "/" ||
        pathname?.startsWith("/learn") ||
        pathname?.startsWith("/auth") ||
        pathname === "/stats" || 
        pathname?.startsWith("/onboarding");

    // ============================================================
    // 수정: 자체 네비게이션을 가진 페이지들을 모두 여기서 숨김 처리
    // ============================================================
    // 기존에는 /problems/[id](문제 풀이 에디터)만 체크했는데,
    // 오늘 리디자인한 홈(/)과 /learn도 각자 자체 nav에
    // 로그인 버튼 + 테마 토글을 직접 통합했기 때문에 (아래 page.tsx 참고)
    // GlobalHeader까지 같이 뜨면 우측 상단에 버튼이 두 겹으로 겹침.
    //
    // pathname === "/"          → 홈은 정확히 "/"일 때만 (다른 페이지가 "/"로 시작하진 않으니 안전)
    // pathname?.startsWith("/learn") → /learn, /learn?track=... 전부 포함
    //   (쿼리스트링은 pathname에 안 잡히지만, 혹시 몰라 향후 /learn/[track] 같은
    //    하위 경로가 생겨도 자동으로 커버되도록 startsWith 사용)
    const isProblemSolvePage = pathname?.startsWith("/problems/") && pathname !== "/problems";

    if (isProblemSolvePage || hasOwnNav) return null;

    return (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
            {user && (
                <button
                    onClick={() => router.push("/stats")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                        text-xs font-medium transition-all border
                        bg-gray-800 border-gray-600 text-gray-300
                        hover:bg-gray-700"
                >
                    <span>👤</span>
                    <span className="text-indigo-400">내 활동 확인</span>
                </button>
            )}
            <AuthButton />
            <ThemeToggle />
        </div>
    );
}
