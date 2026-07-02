"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import { createClient } from "@/app/lib/supabase";
import ThemeToggle from "./ThemeToggle";

// ============================================================
// 타입 정의
// ============================================================
// 각 페이지가 필요로 하는 텍스트 링크 하나를 표현
// 예: { label: "통계", href: "/stats" }
export type SiteNavLink = {
    label: string;
    href: string;
};

type SiteNavProps = {
    // 데스크탑 nav에서 로고 옆에 나열될 클릭 가능한 링크들
    // 모바일 드롭다운에도 동일하게 재사용됨
    links?: SiteNavLink[];

    // 클릭 불가능한 고정 라벨 (예: /learn 페이지의 "학습")
    // "지금 이 섹션에 있다"는 걸 알려주는 용도 — 링크가 아니라서 버튼으로 안 만듦
    activeLabel?: string;

    // 기존 rightExtra는 "아무 JSX나 넣어도 되는" 자유로운 슬롯이었는데,
    // 그래서 데스크탑용 버튼 JSX를 통째로 넘기면 모바일에서도 그 버튼
    // 스타일 그대로 나와버리는 문제가 있었음 (다른 텍스트 링크들과 안 어울림).
    // primaryAction은 "라벨 + 이동 경로"만 받아서, SiteNav 내부에서
    // 데스크탑엔 강조 버튼으로, 모바일엔 다른 링크들과 똑같은 텍스트로
    // 각각 알맞게 렌더링함 — 데이터만 넘기고 스타일 결정은 컴포넌트에 위임
    primaryAction?: SiteNavLink;
};

export default function SiteNav({ links = [], activeLabel, primaryAction }: SiteNavProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useAuth();

    // 모바일 드롭다운 메뉴 열림/닫힘 — 이 컴포넌트 안에서만 관리
    // (예전엔 6개 파일이 각자 이 state를 따로 선언하고 있었음)
    const [menuOpen, setMenuOpen] = useState(false);

    // 데스크탑 유저 배지를 클릭하면 열리는 작은 드롭다운
    // (Github, Notion 등 상용 사이트에서 흔한 "아바타/이메일 클릭 -> 로그아웃 메뉴" 패턴)
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    // 로그아웃 후 이동 경로: 홈("/")
    // 로그인 폼으로 바로 보내는 대신 홈으로 보내는 이유:
    //   방금 로그아웃한 사람에게 즉시 "다시 로그인하라"고 요구하면
    //   사용자 경험상 공격적으로 느껴짐. 상용 사이트(GitHub, Notion, X 등)
    //   대부분 로그아웃 → 홈/랜딩 페이지로 보내는 패턴을 따름
    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setMenuOpen(false);
        setUserMenuOpen(false);
        router.push("/");
    };

    // 모바일 메뉴에서 "홈" 항목을 보여줄지 여부
    // 이미 홈 페이지에 있으면 "홈으로 가기" 버튼이 의미가 없으므로 숨김
    const showHomeLink = pathname !== "/";

    return (
        <nav className="h-14 border-b border-[var(--border-c)] bg-[var(--bg-2)] flex items-center justify-between px-6 relative">
            <button
                onClick={() => router.push("/")}
                className="font-bold text-sm tracking-tight"
            >
                Prov<span style={{ color: "var(--accent)" }}>Gate</span>
            </button>

            {/* ============================================
                데스크탑 전용 그룹
                ============================================ */}
            <div className="hidden md:flex items-center gap-5">
                {activeLabel && <span className="text-xs font-medium">{activeLabel}</span>}

                {links.map((l) => (
                    <button
                        key={l.href}
                        onClick={() => router.push(l.href)}
                        className="text-xs text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
                    >
                        {l.label}
                    </button>
                ))}

                {/* primaryAction: 데스크탑에서는 강조 버튼 그대로 유지 */}
                {primaryAction && (
                    <button
                        onClick={() => router.push(primaryAction.href)}
                        className="text-xs font-medium rounded px-4 py-2 transition-opacity hover:opacity-90"
                        style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                    >
                        {primaryAction.label}
                    </button>
                )}

                {/* 신규: 유저 배지를 버튼으로 만들어 클릭 가능하게, 드롭다운 토글 */}
                {user ? (
                    <div className="relative">
                        <button
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            className="text-xs border border-[var(--border-strong)] bg-[var(--bg-3)] rounded px-3 py-1.5 flex items-center gap-1"
                        >
                            {user.email?.split("@")[0]}
                            <i
                                className={`ti ti-chevron-down transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                                style={{ fontSize: "11px" }}
                                aria-hidden="true"
                            />
                        </button>

                        {/* 드롭다운 — 유저 배지 바로 아래에 절대 위치로 붙임 */}
                        {userMenuOpen && (
                            <>
                                {/* 바깥 클릭 시 드롭다운을 닫기 위한 투명 오버레이
                                    전체 화면을 덮되 z-index를 드롭다운보다 낮게 둬서
                                    드롭다운 자체는 클릭 가능하게 유지 */}
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setUserMenuOpen(false)}
                                />
                                <div className="absolute top-full right-0 mt-1.5 bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-md shadow-sm z-50 min-w-[120px] py-1">
                                    <button
                                        onClick={handleLogout}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-3)]"
                                        style={{ color: "var(--accent2)" }}
                                    >
                                        로그아웃
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => router.push("/auth/login")}
                        className="text-xs border border-[var(--border-strong)] bg-[var(--bg-3)] rounded px-3 py-1.5"
                    >
                        로그인
                    </button>
                )}

                <ThemeToggle />
            </div>

            {/* ============================================
                모바일 전용 그룹
                ============================================ */}
            <div className="md:hidden flex items-center gap-2">
                <ThemeToggle />
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-1.5 text-[var(--text-2)]"
                    aria-label="메뉴 열기"
                >
                    <i
                        className={`ti ${menuOpen ? "ti-x" : "ti-menu-2"}`}
                        style={{ fontSize: "18px" }}
                        aria-hidden="true"
                    />
                </button>
            </div>

            {/* 모바일 드롭다운 시트 */}
            {menuOpen && (
                <div className="md:hidden absolute top-14 left-0 right-0 bg-[var(--bg-2)] border-b border-[var(--border-c)] flex flex-col p-4 gap-3 z-50">
                    {showHomeLink && (
                        <button
                            onClick={() => {
                                router.push("/");
                                setMenuOpen(false);
                            }}
                            className="text-sm text-left text-[var(--text-2)] py-1.5"
                        >
                            홈
                        </button>
                    )}

                    {links.map((l) => (
                        <button
                            key={l.href}
                            onClick={() => {
                                router.push(l.href);
                                setMenuOpen(false);
                            }}
                            className="text-sm text-left text-[var(--text-2)] py-1.5"
                        >
                            {l.label}
                        </button>
                    ))}

                    {/* 수정: primaryAction도 모바일에서는 다른 링크와 동일한
                        일반 텍스트 스타일로 렌더링 (버튼 강조 없이 통일감 유지) */}
                    {primaryAction && (
                        <button
                            onClick={() => {
                                router.push(primaryAction.href);
                                setMenuOpen(false);
                            }}
                            className="text-sm text-left text-[var(--text-2)] py-1.5"
                        >
                            {primaryAction.label}
                        </button>
                    )}

                    {user ? (
                        <>
                            <span className="text-sm text-[var(--text-2)] py-1.5">{user.email?.split("@")[0]}</span>
                            <button
                                onClick={handleLogout}
                                className="text-sm text-left py-1.5"
                                style={{ color: "var(--accent2)" }}
                            >
                                로그아웃
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => {
                                router.push("/auth/login");
                                setMenuOpen(false);
                            }}
                            className="text-sm text-left text-[var(--text-2)] py-1.5"
                        >
                            로그인
                        </button>
                    )}
                </div>
            )}
        </nav>
    );
}
