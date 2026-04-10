"use client";

// useState: 현재 테마 상태 관리
// useEffect: 초기 테마 로드 및 변경 시 저장
import { useState, useEffect } from "react";

export function useTheme() {
    // default == Dark
    const [isDark, setIsDark] = useState(true);

    // 컴포넌트 마운트 시 저장된 테마 불러오기
    useEffect(() => {
        const saved = localStorage.getItem("theme");

        if (saved) {
            setIsDark(saved === "dark");
        }
    }, []);

    // 테마 변경 시 localStorage에 저장 -> html 클래스 변경
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
