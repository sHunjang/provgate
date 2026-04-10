import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/app/components/ThemeToggle";

export const metadata: Metadata = {
    title: "ThinkCode",
    description: "AI 힌트를 써도 이해를 강제하는 코딩 학습 플랫폼",
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
                {/* 오른쪽 상단 고정 테마 토글 버튼 */}
                <div className="fixed top-4 right-4 z-50">
                    <ThemeToggle />
                </div>
                {children}
            </body>
        </html>
    );
}
