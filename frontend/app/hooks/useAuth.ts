"use client";

// useStates: 유저 상태 관리
// useEffect: 컴포넌트 마운트 시 인증 상태 관리
import { useState, useEffect } from "react";

// User: Supabase 유저 타입
import { User } from "@supabase/supabase-js";

// createClient: Supabase 클라이언트 생성 함수
import { createClient } from "@/app/lib/supabase";

export function useAuth() {
    // 현재 로그인한 유저 상태 (null이면 비로그인)
    const [user, setUser] = useState<User | null>(null);

    // 로딩 상태 (인증 확인 중)
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();

        // 현재 세션에서 유저 정보 가져오기
        const getUser = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            setUser(user);
            setLoading(false);
        };

        getUser();

        // 인증 상태 변경 감지 (로그인/로그아웃 시 자동 업데이트)
        // onAuthStateChange: 로그인, 로그아웃, 토큰 갱신 등 이벤트 감지
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // 컴포넌트 언마운트 시 구도 해제 (메모리 누수 방지)
        return () => subscription.unsubscribe();
    }, []);

    // 로그아웃 함수
    const signOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
    };

    return { user, loading, signOut };
}