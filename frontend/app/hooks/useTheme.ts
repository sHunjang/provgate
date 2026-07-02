"use client";

import { useState, useEffect } from "react";

export function useTheme() {
    // ============================================================
    // 핵심 수정: useState(true) → useState(() => { ... })
    // ============================================================
    // 기존엔 무조건 true(다크)로 시작한 뒤 별도 effect로 나중에 보정했는데,
    // 그 "일단 틀리게 시작 → 나중에 고침" 사이의 틈에서 경쟁 상태가 생겼음.
    // 함수를 넘기는 방식(lazy initializer)을 쓰면, 컴포넌트가 렌더링되는
    // 바로 그 순간에 동기적으로 localStorage를 읽어서 처음부터 정확한
    // 값으로 시작함 — "틀린 중간 단계" 자체가 사라져서 경쟁 상태가
    // 구조적으로 불가능해짐
    const [isDark, setIsDark] = useState<boolean>(() => {
        // SSR 방어: 서버에는 localStorage가 없음
        // (이 값은 layout.tsx의 기본 className="dark ..."와 일치해서
        //  서버/클라이언트 렌더링 결과가 어긋나는 하이드레이션 에러도 없음)
        if (typeof window === "undefined") return true;
        const saved = localStorage.getItem("theme");
        return saved ? saved === "dark" : true;
    });

    // 수정: "나중에 읽어와서 보정하는" effect는 완전히 삭제
    // (lazy initializer가 이미 마운트 시점에 정확한 값을 갖고 있으므로 불필요)

    // 테마 변경 시(토글 클릭 또는 초기 마운트) localStorage 동기화 + html 클래스 적용
    useEffect(() => {
        localStorage.setItem("theme", isDark ? "dark" : "light");
        if (isDark) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark(!isDark);

    return { isDark, toggleTheme };
}
