// Supabase 클라이언트 생성 함수
// createBrowserClient: 브라우저(클라이언트 컴포넌트)에서 사용하는 Supabase 클라이언트
import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

// 싱글톤 패턴: 클라이언트 인스턴스를 모듈 스코프 변수에 저장
// CS 개념 - 싱글톤(Singleton):
//   "이 객체는 앱 전체에서 딱 하나만 존재해야 한다"는 걸 보장하는 디자인 패턴
//   모듈 스코프 변수는 이 파일이 처음 import될 때 한 번 선언되고,
//   이후 같은 모듈을 import하는 모든 곳에서 같은 메모리 주소를 공유함
//   (Next.js는 같은 모듈을 여러 번 import해도 내부적으로 캐싱해서 재실행 안 함)
let client: SupabaseClient | undefined;

// 환경변수에서 Supabase URL과 anon 키를 가져와서 클라이언트 생성
// NEXT_PUBLIC_ 접두사: 브라우저에서 접근 가능한 환경변수
export function createClient() {
    // 이미 만들어진 클라이언트가 있으면 그걸 재사용
    // 없을 때만(앱 켜진 후 최초 1회만) 새로 생성
    if (!client) {
        client = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
    }

    return client;
}