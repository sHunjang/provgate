"use client";

import { useState, useEffect } from "react";

// useTheme: 커스텀 훅
// 현재 테마 상태(isDark)와 토글 함수(toggleTheme)를 제공
import { useTheme } from "../hooks/useTheme";

export default function ThemeToggle() {
    const { isDark, toggleTheme } = useTheme();

    // ============================================================
    // 신규: mounted 플래그 — "마운트 후에만 진짜 값 보여주기" 패턴
    // ============================================================
    // false일 때는 서버가 그린 것과 100% 동일한 내용(항상 다크 기준)을
    // 그대로 유지 → 하이드레이션 시점엔 서버=클라이언트라 에러가 안 남
    // true로 바뀌는 순간(useEffect는 항상 클라이언트에서만 실행되므로
    // "마운트 완료 = 브라우저에서 실제로 그려짐"을 의미)에만
    // 리렌더링되면서 진짜 isDark 값으로 자연스럽게 전환됨
    // (suppressHydrationWarning처럼 "텍스트가 얼어붙는" 부작용이 없음)
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // 마운트 전(=서버 렌더링 시점과 동일한 첫 클라이언트 렌더링)에는
    // layout.tsx의 기본값(항상 다크)과 일치하는 내용을 그대로 보여줌
    const displayIsDark = mounted ? isDark : true;

    return (
        <button
            onClick={toggleTheme}
            // ============================================================
            // 수정: bg-gray-800/bg-white 같은 고정 Tailwind 색상 클래스 제거
            // ============================================================
            // 기존엔 isDark 값에 따라 완전히 다른 Tailwind 클래스 묶음을
            // 삼항 연산자로 통째로 갈아끼우는 방식이었음.
            // 문제는 그 색(gray-800, gray-300 등)이 오늘 새로 정의한
            // var(--bg-3), var(--text-2) 같은 CSS 변수 팔레트와 미묘하게
            // 달라서, 새로 리디자인한 페이지들의 다른 버튼(로그인 버튼 등)과
            // 색感이 어긋나 보였음.
            //
            // 해결: CSS 변수를 쓰면 애초에 삼항 분기 자체가 필요 없어짐.
            // var(--bg-3)는 globals.css에서 이미
            //   :root(라이트) { --bg-3: #edecea }
            //   .dark(다크)   { --bg-3: #2e2d29 }
            // 로 정의돼 있어서, html 태그의 .dark 클래스 유무에 따라
            // 브라우저가 알아서 값을 바꿔줌. 즉 JS로 조건 분기할 필요 없이
            // "지금 페이지가 라이트냐 다크냐"를 CSS 레이어에 위임하는 것.
            // 이게 다른 nav 버튼들(로그인 버튼 등)과 정확히 같은 색상 체계.
            className="flex items-center gap-1 px-3 py-1.5 rounded-full
                text-xs font-medium transition-all border
                bg-[var(--bg-3)] border-[var(--border-strong)] text-[var(--text-2)]
                hover:bg-[var(--bg)]"
        >
            <span>{displayIsDark ? "🌙" : "☀️"}</span>
            <span>{displayIsDark ? "다크" : "라이트"}</span>
        </button>
    );
}
