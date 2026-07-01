import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

import GlobalHeader from "@/app/components/GlobalHeader";

// Noto Sans KR: next/font로 불러오면 빌드 시점에 폰트를 로컬에 저장하고
// 자동으로 최적화(서브셋, preload)해줘서 구글 폰트 CDN 요청 없이 빠르게 로드돼
// variable로 지정하면 CSS 변수로 사용 가능 (globals.css에서 font-family로 연결)
const notoSansKR = Noto_Sans_KR({
    subsets: ["latin"], // 한글은 서브셋 지정이 없어서 latin만 지정 (한글 자체는 자동 포함)
    weight: ["300", "400", "500", "700", "900"], // 필요한 굵기만 로드 (용량 최적화)
    variable: "--font-noto-sans-kr",
    display: "swap", // 폰트 로드 전에는 시스템 폰트로 우선 표시 → 깜빡임(FOUT) 최소화
});

export const metadata: Metadata = {
    title: "ProvGate",
    description: "AI와 함께, 이해는 스스로",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html
            lang="ko"
            className={`dark ${notoSansKR.variable}`}
        >
            <body>
                <GlobalHeader />
                {children}
            </body>
        </html>
    );
}
