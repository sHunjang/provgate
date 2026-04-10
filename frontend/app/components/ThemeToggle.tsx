"use client";

// useTheme: 커스텀 훅
// 현재 테마 상태(isDark)와 토글 함수(toggleTheme)를 제공
import { useTheme } from "../hooks/useTheme";

export default function ThemeToggle() {
    // isDark: 현재 다크모드 여부 확인 (true = dark, false = light)
    // toggleTheme: 테마 전환 함수
    const { isDark, toggleTheme } = useTheme();

    return (
        // 버튼 클릭 시 toggleTheme 호출 → 테마 전환
        // isDark 값에 따라 버튼 스타일이 동적으로 변경됨
        <button
            onClick={toggleTheme}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full 
        text-xs font-medium transition-all border
        ${
            isDark
                ? // 다크 모드일 때 버튼 스타일
                "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700"
                : // 라이트 모드일 때 버튼 스타일
                "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
        >
        {/* isDark에 따라 아이콘과 텍스트 변경
        다크 모드: 🌙 다크
        라이트 모드: ☀️ 라이트 */}
            <span>{isDark ? "🌙" : "☀️"}</span>
            <span>{isDark ? "다크" : "라이트"}</span>
        </button>
    );
}
