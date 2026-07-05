// ============================================================
// 레벨(난이도) 관련 공통 상수
// ============================================================
// 이전엔 이 매핑(levelLabel, levelColor 등)이 /learn, /stats, 에디터,
// /onboarding 등 최소 5개 파일에 각자 복붙되어 있었음. SiteNav를 뽑아낼 때와
// 같은 이유로 한 곳으로 모음 — 나중에 레벨 이름이나 색을 또 바꿔야 할 때
// 파일 하나만 고치면 전체 사이트에 반영되도록 하기 위함.
//
// 주의: 이건 "화면에 보여주는 라벨/색"만 담당함.
// 백엔드 DB/API의 실제 값("beginner"/"intermediate"/"advanced")은
// 그대로 유지함 — 화면 표시만 바꾸는 거라 백엔드 수정은 필요 없음.

export type Level = "beginner" | "intermediate" | "advanced";

type LevelMetaEntry = {
    label: string;
    shortLabel: string;
    bg: string;
    fg: string;
    line: string;
};

export const LEVEL_META: Record<Level, LevelMetaEntry> = {
    beginner: {
        label: "기초 이해",
        shortLabel: "기초",
        bg: "var(--level-1-bg)",
        fg: "var(--level-1-fg)",
        line: "var(--level-1-line)",
    },
    intermediate: {
        label: "응용 이해",
        shortLabel: "응용",
        bg: "var(--level-2-bg)",
        fg: "var(--level-2-fg)",
        line: "var(--level-2-line)",
    },
    advanced: {
        label: "심화 이해",
        shortLabel: "심화",
        bg: "var(--level-3-bg)",
        fg: "var(--level-3-fg)",
        line: "var(--level-3-line)",
    },
};

// 순서가 중요한 곳(레벨 선택 카드, 필터 등)에서 배열로도 순회할 수 있도록
export const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"];
