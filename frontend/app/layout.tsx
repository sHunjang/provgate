import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/app/components/ThemeToggle";
import AuthButton from "@/app/components/AuthButton";

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
                {/* 오른쪽 상단 고정 테마 토글 버튼 
                    AuthButton: 로그인/로그아웃 버튼
                    ThemeToggle: 다크/라이트 모드 전환
                */}
                <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
                    <AuthButton />
                    <ThemeToggle />
                </div>
                {children}
            </body>
        </html>
    );
}
