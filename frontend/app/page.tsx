"use client";

// ============================================================
// import 구문 설명
// ============================================================
// Suspense: 컴포넌트가 아직 준비 안 됐을 때 "로딩 중" 화면을 보여주는
//   React 내장 컴포넌트. useSearchParams()가 값을 확정하기 전까지
//   fallback UI를 보여주는 안전장치로 사용함.
import { Suspense } from "react";

// useRouter: 페이지 이동(라우팅)을 코드로 실행할 때 사용
// useSearchParams: 현재 URL의 ?key=value 쿼리 파라미터를 읽는 훅
import { useRouter, useSearchParams } from "next/navigation";

// 커스텀 훅: 로그인한 사용자 정보를 어디서든 꺼내 쓸 수 있게 만든 자체 훅
import { useAuth } from "./hooks/useAuth";

// Supabase 클라이언트 생성 함수 - DB/인증 서버와 통신하는 창구
import { createClient } from "./lib/supabase";

// import ThemeToggle from "./components/ThemeToggle";

import SiteNav, { SiteNavLink } from "./components/SiteNav";

// ============================================================
// HomeContent — 실제 로직이 들어있는 컴포넌트
// ============================================================
// Next.js 14 규칙: useSearchParams()를 쓰는 컴포넌트는
// 반드시 <Suspense> 경계 안에 있어야 함 (하단 Home() 참고)
function HomeContent() {
    const router = useRouter();
    const { user } = useAuth();
    const searchParams = useSearchParams();

    // /problems(구 경로)에서 진단 안 한 사용자를 리디렉션할 때 붙는 쿼리
    // .get()은 값이 없으면 null 반환 → 조건부 렌더링에 활용
    const needOnboarding = searchParams.get("needOnboarding");

    const homeLinks: SiteNavLink[] = [
        { label: "문제", href: "/learn" },
        { label: "통계", href: "/stats" },
    ];

    // ------------------------------------------------------------
    // 이벤트 핸들러
    // ------------------------------------------------------------

    // "진단 시작하기" 버튼 클릭 시 실행
    const handleDiagnoseStart = () => {
        // 비로그인이면 로그인 페이지로 먼저 보냄
        // (진단 결과를 DB에 저장하려면 user_id가 필요하기 때문)
        if (!user) {
            router.push("/auth/login");
            return;
        }
        router.push("/onboarding/quiz");
    };

    // "게스트로 체험하기" 버튼 클릭 시 실행
    // async/await: 서버 응답을 "기다려야" 하는 비동기 작업 처리 문법
    const handleGuestLogin = async () => {
        const supabase = createClient();

        // 여러 사람이 공유하는 게스트 계정으로 자동 로그인
        // 회원가입 절차 없이 전체 기능을 체험할 수 있게 해서
        // 온보딩 마찰(가입 장벽으로 인한 이탈)을 줄이는 전략
        const { error } = await supabase.auth.signInWithPassword({
            email: "guest@provgate.com",
            // NEXT_PUBLIC_ 접두사가 붙어야 브라우저에서 접근 가능한 환경변수
            password: process.env.NEXT_PUBLIC_GUEST_PASSWORD!,
        });

        if (error) {
            alert("게스트 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
            return;
        }

        router.push("/learn");
    };

    // "로그아웃" 버튼 클릭 시 실행 — Supabase 세션 종료 후 홈으로 이동
    // const handleLogout = async () => {
    //     const supabase = createClient();
    //     await supabase.auth.signOut();
    //     setMenuOpen(false);
    //     router.push("/");
    // };

    // ============================================================
    // 학습 트랙 데이터
    // ============================================================
    // slug: /learn 페이지의 activeTrack 값과 반드시 일치해야 라우팅이 정상 동작함
    //   (예전 버그: onClick에 slug 대신 "/problems"를 하드코딩해서
    //    3개 카드 전부 같은 페이지로 이동하던 문제 → slug 기반으로 수정)
    // dot: 트랙 상징색 (아이콘, 우측 점)
    // bg : dot의 옅은 배경 버전 — globals.css에 이미 정의된 -bg 변수를 그대로 재사용
    //   (색상 하드코딩 대신 기존 팔레트 재사용 → 다크모드 전환 시 자동 대응)
    const tracks = [
        {
            slug: "foundation",
            icon: "ti-code",
            name: "Python 기초",
            desc: "변수, 조건문, 함수부터 알고리즘까지",
            count: "15문제",
            dot: "var(--accent)",
            bg: "var(--accent-bg)",
        },
        {
            slug: "project",
            icon: "ti-layout-grid",
            name: "실무 설계",
            desc: "로그인, 장바구니, 댓글 시스템 설계",
            count: "6문제",
            dot: "var(--accent2)",
            bg: "var(--accent2-bg)",
        },
        {
            slug: "prompt",
            icon: "ti-message-chatbot",
            name: "AI 활용",
            desc: "AI 코드 읽기, 디버깅, 프롬프트 설계",
            count: "9문제",
            dot: "var(--accent3)",
            bg: "var(--accent3-bg)",
        },
    ];

    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <SiteNav links={homeLinks} />

            {/* 온보딩 안내 배너 — needOnboarding 쿼리가 있을 때만 표시
                (이건 원래 폭 제한 없이 배너 형태로 화면 전체를 쓰는 게 맞아서 그대로 둠) */}
            {needOnboarding && (
                <div className="px-6 py-3 bg-[var(--accent2-bg)] border-b border-[var(--border-c)] text-center">
                    <p
                        className="text-xs"
                        style={{ color: "var(--accent2)" }}
                    >
                        📋 문제 풀기 전에 먼저 진단하기를 완료해주세요
                    </p>
                </div>
            )}

            {/* ============================================================
                S1. 히어로
                수정: 배경 없는 섹션이라 바깥 <section>엔 border-b만,
                     안쪽 <div>에 max-w-3xl mx-auto px-6 py-* 이동
                ============================================================ */}
            <section className="border-b border-[var(--border-c)]">
                <div className="max-w-3xl mx-auto px-6 py-14 md:px-8 md:py-20">
                    <p className="text-[10px] tracking-widest uppercase text-[var(--text-3)] mb-4">AI 시대 코딩 학습</p>
                    <h1 className="text-2xl md:text-4xl font-bold tracking-tight leading-tight mb-4">
                        AI와 함께,
                        <br />
                        <span style={{ color: "var(--accent)" }}>이해는 스스로</span>
                    </h1>
                    <p className="text-sm text-[var(--text-2)] leading-relaxed mb-7">
                        복붙이 아니라 진짜로 이해하는 힘.
                        <br />
                        설계하고, 검증하고, 성장합니다.
                    </p>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleDiagnoseStart}
                            className="text-sm font-medium rounded px-6 py-3 transition-opacity hover:opacity-90"
                            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
                        >
                            진단 시작하기
                        </button>
                        <button
                            onClick={handleGuestLogin}
                            className="text-sm text-[var(--text-3)] underline underline-offset-4 hover:text-[var(--text-2)]"
                        >
                            게스트로 체험
                        </button>
                    </div>
                </div>
            </section>

            {/* ============================================================
                S2. 실태 (통계)
                수정: bg-[var(--bg-3)]를 바깥 <section>으로 옮겨서
                     배경색이 화면 전체 폭으로 자연스럽게 펼쳐지게 함
                ============================================================ */}
            <section className="border-b border-[var(--border-c)] bg-[var(--bg-3)]">
                <div className="max-w-3xl mx-auto px-6 py-10 md:px-8">
                    <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-3">실태</p>
                    <h2 className="text-base font-bold tracking-tight mb-5">개발자들은 AI를 어떻게 느끼고 있을까요?</h2>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                            { num: "80", label: "개발자가 AI 도구를 이미 사용 중" },
                            { num: "46", label: "코드 중 AI가 생성하는 비율" },
                            { num: "66", label: "AI 코드 디버깅에 더 많은 시간 소요" },
                        ].map((s) => (
                            <div
                                key={s.label}
                                className="bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md p-3"
                            >
                                <div className="text-xl font-bold tracking-tight mb-1">
                                    {s.num}
                                    <span className="text-xs font-medium">%</span>
                                </div>
                                <div className="text-[10px] text-[var(--text-2)] leading-snug">{s.label}</div>
                            </div>
                        ))}
                    </div>
                    {[
                        { label: "AI 코드를 완전히 이해하고 싶다", pct: 61 },
                        { label: "AI 답변을 신뢰할 수 없을 때 사람에게 묻는다", pct: 75 },
                    ].map((bar) => (
                        <div
                            key={bar.label}
                            className="mb-2"
                        >
                            <div className="flex justify-between mb-1">
                                <span className="text-[11px] text-[var(--text-2)]">{bar.label}</span>
                                <span className="text-[11px] font-bold">{bar.pct}%</span>
                            </div>
                            <div className="h-[3px] rounded-full bg-[var(--border-c)]">
                                <div
                                    className="h-[3px] rounded-full"
                                    style={{ width: `${bar.pct}%`, background: "var(--accent)" }}
                                />
                            </div>
                        </div>
                    ))}
                    <p className="text-[9px] text-[var(--text-3)] mt-3">
                        출처: Stack Overflow Developer Survey 2025 (응답자 90,000명+) · GitHub Copilot Research 2025
                    </p>
                </div>
            </section>

            {/* S3. 작동 방식 */}
            <section className="border-b border-[var(--border-c)]">
                <div className="max-w-3xl mx-auto px-6 py-10 md:px-8">
                    <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1">작동 방식</p>
                    <h2 className="text-base font-bold tracking-tight mb-5">3단계로 진짜 이해를 검증합니다</h2>
                    <div className="flex flex-col">
                        {[
                            {
                                num: "01",
                                title: "직접 설계하기",
                                desc: "코드 짜기 전에 조건과 순서를 글로 먼저 써요. AI 없이 내 머릿속을 정리하는 첫 단계.",
                                tag: "설계 훈련",
                                bg: "var(--accent-bg)",
                                fg: "var(--accent)",
                            },
                            {
                                num: "02",
                                title: "AI 힌트로 점검",
                                desc: "막히면 AI가 방향만 알려줘요. 답을 주는 게 아니라 생각의 빈틈을 짚어줍니다.",
                                tag: "AI 힌트",
                                bg: "var(--accent2-bg)",
                                fg: "var(--accent2)",
                            },
                            {
                                num: "03",
                                title: "이해 확인 게이트",
                                desc: "같은 개념의 다른 문제로 진짜 이해했는지 검증. 통과해야만 제출 완료.",
                                tag: "이해 검증",
                                bg: "var(--accent3-bg)",
                                fg: "var(--accent3)",
                            },
                        ].map((step, i, arr) => (
                            <div
                                key={step.num}
                                className={`flex gap-4 py-3 ${i !== arr.length - 1 ? "border-b border-[var(--border-c)]" : ""}`}
                            >
                                <div
                                    className="text-xs font-bold min-w-[24px]"
                                    style={{ color: "var(--accent)" }}
                                >
                                    {step.num}
                                </div>
                                <div>
                                    <div className="text-sm font-bold mb-1">{step.title}</div>
                                    <div className="text-xs text-[var(--text-2)] leading-relaxed">{step.desc}</div>
                                    <span
                                        className="inline-block text-[9px] rounded px-2 py-0.5 mt-1.5"
                                        style={{ background: step.bg, color: step.fg }}
                                    >
                                        {step.tag}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ============================================================
                S4. 학습 트랙 섹션
                ============================================================ */}
            <section className="border-b border-[var(--border-c)] bg-[var(--bg-3)]">
                <div className="max-w-3xl mx-auto px-6 py-10 md:px-8">
                    <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1">학습 트랙</p>
                    <h2 className="text-base font-bold tracking-tight mb-4">내 목적에 맞는 트랙을 골라요</h2>
                    <div className="flex flex-col gap-2">
                        {tracks.map((t) => (
                            <button
                                key={t.slug}
                                onClick={() => router.push(`/learn?track=${t.slug}`)}
                                className="group bg-[var(--bg-2)] border border-[var(--border-c)] rounded-md px-4 py-3.5
                                    flex items-center justify-between text-left
                                    hover:border-[var(--border-strong)] hover:shadow-sm transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: t.bg }}
                                    >
                                        <i
                                            className={`ti ${t.icon}`}
                                            style={{ color: t.dot, fontSize: "16px" }}
                                            aria-hidden="true"
                                        />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold mb-0.5">{t.name}</div>
                                        <div className="text-[10px] text-[var(--text-2)]">{t.desc}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--text-3)]">{t.count}</span>
                                    <i
                                        className="ti ti-chevron-right text-[var(--text-3)] transition-transform group-hover:translate-x-0.5"
                                        style={{ fontSize: "14px" }}
                                        aria-hidden="true"
                                    />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* S5. 사회적 증명 */}
            <section className="border-b border-[var(--border-c)]">
                <div className="max-w-3xl mx-auto px-6 py-10 md:px-8">
                    <p className="text-[9px] tracking-widest uppercase text-[var(--text-3)] mb-1">베타 피드백</p>
                    <h2 className="text-base font-bold tracking-tight mb-4">써본 분들의 이야기</h2>
                    <div className="flex flex-col gap-2">
                        {[
                            {
                                text: "막상 설계를 글로 적어보니 어떻게 구현해야 할지 정리되더라고요. ChatGPT랑 달리 내 생각을 먼저 쓰게 하는 게 좋았어요.",
                                who: "학생 · 베타",
                            },
                            {
                                text: "내 의도를 명확하게 전달하면서 코드 작성 전 생각을 정리할 수 있는 점이 ChatGPT랑 다르게 느껴졌어요.",
                                who: "주니어 개발자 · 베타",
                            },
                        ].map((r) => (
                            <div
                                key={r.who}
                                className="bg-[var(--bg-3)] rounded-md px-4 py-3"
                            >
                                <p className="text-xs text-[var(--text-2)] leading-relaxed mb-2">{r.text}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
                                    <div
                                        className="w-1 h-1 rounded-full"
                                        style={{ background: "var(--accent)" }}
                                    />
                                    {r.who}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ============================================================
                S6. 마지막 CTA
                수정: 배경(style={{ background: "var(--btn-bg)" }})은 바깥 <section>에,
                     텍스트 정렬용 max-w-md/text-center는 안쪽 <div>로 이동
                ============================================================ */}
            <section style={{ background: "var(--btn-bg)" }}>
                <div className="max-w-3xl mx-auto px-6 py-16 text-center">
                    <h2
                        className="text-xl font-bold tracking-tight mb-2 max-w-md mx-auto leading-snug"
                        style={{ color: "var(--btn-text)" }}
                    >
                        AI 의존에서 벗어나
                        <br />
                        진짜 실력을 키울 준비가 됐나요?
                    </h2>
                    <p
                        className="text-xs mb-5"
                        style={{ color: "var(--btn-text)", opacity: 0.5 }}
                    >
                        AI가 제공하는 문제를 통해 나에게 맞는 수준을 알 수 있어요.
                    </p>
                    <button
                        onClick={handleDiagnoseStart}
                        className="inline-block text-xs font-medium rounded px-6 py-3"
                        style={{ background: "var(--btn-text)", color: "var(--btn-bg)" }}
                    >
                        지금 진단 시작하기 →
                    </button>
                </div>
            </section>
        </main>
    );
}

// ============================================================
// Home — 실제로 export되는 페이지 컴포넌트
// ============================================================
// useSearchParams()를 쓰는 컴포넌트는 Suspense로 감싸야 하는
// Next.js 14 규칙 때문에 HomeContent를 바로 export하지 않음
export default function Home() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
                    <p className="text-[var(--text-2)]">로딩 중...</p>
                </main>
            }
        >
            <HomeContent />
        </Suspense>
    );
}
