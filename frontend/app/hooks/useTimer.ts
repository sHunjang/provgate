"use client";

// useState → 타이머 값 저장
// useEffect → 타이머 실행
// setInterval → 매 초마다 실행
import { useState, useEffect, useRef } from "react";

export function useTimer() {
    // 경과 시간 (초 단위)
    // 매 초마다 1씩 증가
    const [elapsed, setElapsed] = useState(0);

    // 타이머 표시 여부 토글
    const [isVisible, setIsVisible] = useState(true);

    // 타이머 시작 시각 기록
    // useRef 사용 이유: 값이 바뀌어도 리렌더링 안 됨
    // startTime은 화면에 표시할 필요가 없으니 ref로 관리
    const startTimeRef = useRef<number>(Date.now());

    useEffect(() => {
        // 매 초마다 경과 시간 업데이트
        const interval = setInterval(() => {
            // Date.now() - 시작시각 = 경과 밀리초
            // 1000으로 나눠서 초 단위로 변환
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        // 클린업 함수: 컴포넌트 언마운트 시 interval 제거
        // 메모리 누수(Memory Leak) 방지
        return () => clearInterval(interval);
    }, []);

    // 초 -> MM:SS 형식으로 변환
    // 예: 90초 -> "01:30"
    const formatTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;

        // padStart(2, "0"): 한 자리 숫자 앞에 0 붙이지
        // 예: 5 -> "05"
        return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    return {
        // 화면에 표시할 MM:SS 형식 시간
        formattedTime: formatTime(elapsed),

        // 제출 시 사용할 초 단위 시간 (DB 저장용)
        elapsed,

        // 타이머 표시 여부
        isVisible,

        // 타이머 보기/숨기기 토글
        toggleVisibility: () => setIsVisible((prev) => !prev),
    };
}
