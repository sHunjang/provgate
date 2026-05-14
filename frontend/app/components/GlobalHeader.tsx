"use client";

import { usePathname } from "next/navigation";
import AuthButton from "@/app/components/AuthButton";
import ThemeToggle from "@/app/components/ThemeToggle";

export default function GlobalHeader() {
    const pathname = usePathname();

    // 문제 풀이 페이지(/problems/[id])에서는 숨김
    // 해당 페이지는 자체 헤더에 통합됨
    const isProblemPage = pathname?.startsWith("/problems/") && pathname !== "/problems";

    if (isProblemPage) return null;

    return (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
            <AuthButton />
            <ThemeToggle />
        </div>
    );
}
