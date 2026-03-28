import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThinkCode",
  description: "AI 힌트를 써도 이해를 강제하는 코딩 학습 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}