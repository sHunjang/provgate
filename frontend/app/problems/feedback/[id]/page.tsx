// ============================================================
// /problems/feedback/[id] (구 결과 경로) → /learn/[track]/[id]/result 리다이렉트
// ============================================================
import { redirect } from "next/navigation";

async function getProblemTrack(id: string): Promise<string | null> {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/problems/detail/${id}`, {
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.track as string;
    } catch {
        return null;
    }
}

export default async function OldFeedbackRedirect({
    params,
    searchParams,
}: {
    params: { id: string };
    // 원래 결과 페이지는 ?level=...&stats=...&code=... 쿼리에 의존하므로
    // 리다이렉트할 때 이 값들을 그대로 새 URL에 옮겨 붙여야
    // 결과 화면이 빈 통계로 뜨는 걸 방지할 수 있음
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const track = await getProblemTrack(params.id);
    const target = track ? `/learn/${track}/${params.id}/result` : "/learn";

    // URLSearchParams는 string만 받으므로, 배열 형태로 온 값(같은 키가
    // 여러 개인 경우)은 첫 번째 값만 사용 — 이 페이지 쿼리 구조상
    // 중복 키가 생길 일이 없어서 안전한 단순화
    const qs = new URLSearchParams(
        Object.entries(searchParams).reduce(
            (acc, [key, value]) => {
                if (typeof value === "string") acc[key] = value;
                return acc;
            },
            {} as Record<string, string>,
        ),
    ).toString();

    redirect(qs ? `${target}?${qs}` : target);
}
