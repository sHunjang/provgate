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
            <head>
                {/* ============================================================
                    신규: Tabler Icons 웹폰트
                    ============================================================
                    코드 곳곳에서 <i className="ti ti-xxx"> 형태로 아이콘을 썼는데,
                    이 클래스들이 실제로 뭔가를 그리려면 Tabler Icons의 CSS/폰트
                    파일을 브라우저가 불러올 수 있어야 함.
                    이 링크가 없으면 클래스는 존재하지만 매핑될 폰트가 없어서
                    "빈 사각형(혹은 완전히 투명한 텍스트)"로 렌더링됨 —
                    텍스트가 옆에 같이 있으면 버튼 틀은 보이지만(예: /learn 햄버거),
                    아이콘 혼자면 버튼 자체가 안 보이는 것처럼 느껴짐(예: 홈 햄버거) */}
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css"
                />
            </head>
            <body>
                <GlobalHeader />
                {children}
            </body>
        </html>
    );
}
