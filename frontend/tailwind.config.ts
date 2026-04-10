import type { Config } from "tailwindcss";

const config: Config = {
    // darkMode: 'class' → html 태그에 'dark' 클래스가 있으면 다크모드 적용
    // useTheme 훅에서 document.documentElement.classList.add("dark") 로 제어
    darkMode: "class",
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};

export default config;
