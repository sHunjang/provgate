import type { Metadata } from "next";
import "./globals.css";

// GlobalHeader: AuthButton + ThemeToggle을 통합한 클라이언트 컴포넌트
// 문제 풀이 페이지(/problems/[id])에서는 자동으로 숨겨짐
// layout.tsx는 서버 컴포넌트라 usePathname 훅을 직접 쓸 수 없어서
// 클라이언트 컴포넌트인 GlobalHeader로 분리
import GlobalHeader from "@/app/components/GlobalHeader";

export const metadata: Metadata = {
    title: "ProvGate",
    description: "AI와 함께, 이해는 스스로",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        // 기본값으로 dark 클래스 추가
        // useTheme 훅이 localStorage에서 테마를 읽어서 변경하지만
        // 초기 렌더링 시 dark가 기본값이므로 미리 추가
        <html
            lang="ko"
            className="dark"
        >
            <body>
                {/* GlobalHeader: 오른쪽 상단 고정 버튼 (로그인/로그아웃 + 다크모드)
                    문제 풀이 페이지(/problems/[id])에서는 자체 헤더에 통합되므로 숨김
                    그 외 모든 페이지에서는 우측 상단에 고정 표시
                */}
                <GlobalHeader />
                {children}
            </body>
        </html>
    );
}
