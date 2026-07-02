// ============================================================
// /problems/[id] (구 문제 풀이 경로) → /learn/[track]/[id] 리다이렉트
// ============================================================
// "use client"가 없는 서버 컴포넌트임에 주의.
// redirect()는 클라이언트에서 useEffect로 처리하는 것보다
// 서버 컴포넌트에서 처리하는 게 더 빠름 — 브라우저에 아무것도
// 그리기 전에 서버가 곧바로 새 위치를 알려주기 때문에
// "잠깐 빈 화면이 보였다가 이동하는" 깜빡임이 없음.
//
// 문제는 리다이렉트할 정확한 경로(/learn/[track]/[id])를 만들려면
// 이 문제의 track 값을 알아야 하는데, 그 값이 이 URL엔 없음.
// 그래서 백엔드의 문제 상세 API를 먼저 호출해서 track을 얻어온 뒤
// 리다이렉트함.
import { redirect } from "next/navigation";

async function getProblemTrack(id: string): Promise<string | null> {
    try {
        // cache: "no-store" — 이 요청은 캐싱하지 않음
        // (리다이렉트 판단용 1회성 조회라 캐싱해봤자 이득이 없고,
        //  오히려 문제가 삭제/변경됐을 때 오래된 값으로 잘못 리다이렉트할 위험이 있음)
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

// Next.js 14: 서버 컴포넌트에서 동적 라우트 파라미터는
// props.params로 자동 전달됨 (별도 훅 불필요, useParams는 클라이언트 전용)
export default async function OldProblemRedirect({ params }: { params: { id: string } }) {
    const track = await getProblemTrack(params.id);

    // track을 찾았으면 정확한 새 경로로, 못 찾았으면(삭제된 문제 등)
    // 안전하게 /learn 메인으로 보냄
    if (track) {
        redirect(`/learn/${track}/${params.id}`);
    }
    redirect("/learn");
}
