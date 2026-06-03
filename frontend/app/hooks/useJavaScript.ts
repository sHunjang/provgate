// JavaScript 코드 실행 훅
// Web Worker + Function 생성자 방식으로 안전하게 실행
// eval() 대신 사용 → XSS 공격 방지, 메인 스레드 보호
import { useState, useEffect, useRef } from "react";

// 테스트 케이스 타입 (usePyodide와 동일)
type TestCase = {
    input: string;
    output: string;
};

// 실행 결과 타입
type RunResult = {
    success: boolean;
    message: string;
    results?: {
        passed: boolean;
        output: string;
        expected: string;
        message: string;
    }[];
};

export function useJavaScript() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Worker 인스턴스를 ref로 관리 (재사용)
    const workerRef = useRef<Worker | null>(null);

    // 컴포넌트 언마운트 시 Worker 정리 (메모리 누수 방지)
    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    const runCode = async (code: string, testCases: TestCase[]): Promise<RunResult> => {
        setLoading(true);
        setError(null);

        try {
            const results = [];
            let allPassed = true;

            for (const tc of testCases) {
                // 테스트케이스 입력값 파싱
                // "[1, 2]" → [1, 2] 형태로 변환
                const inputs = JSON.parse(tc.input);
                const expected = tc.output.trim();

                // Worker를 사용해 안전하게 JS 코드 실행
                const result = await runInWorker(code, inputs);

                const output = String(result).trim();
                const passed = output === expected;

                if (!passed) allPassed = false;

                results.push({
                    passed,
                    output,
                    expected,
                    message: passed ? "통과" : "실패",
                });
            }

            return {
                success: allPassed,
                message: allPassed
                    ? `🎉 모든 테스트를 통과했습니다! (${testCases.length}/${testCases.length})`
                    : `❌ 일부 테스트가 실패했습니다.`,
                results,
            };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "실행 오류";
            setError(errorMsg);
            return {
                success: false,
                message: `❌ 오류: ${errorMsg}`,
            };
        } finally {
            setLoading(false);
        }
    };

    // Web Worker로 코드 실행
    // Worker 내부에서 Function 생성자로 안전하게 실행
    // 타임아웃 3초 설정 → 무한루프 차단
    const runInWorker = (code: string, inputs: unknown[]): Promise<unknown> => {
        return new Promise((resolve, reject) => {
            // Worker 코드를 Blob으로 생성
            // 별도 파일 없이 인라인으로 Worker 생성
            const workerCode = `
                self.onmessage = function(e) {
                    const { code, inputs } = e.data;
                    try {
                        // Function 생성자로 사용자 코드 실행
                        // eval() 대신 사용 → 전역 스코프 오염 방지
                        const fn = new Function('return (' + code + ')')();
                        
                        // solution 함수 존재 여부 확인
                        if (typeof fn !== 'function') {
                            throw new Error('solution 함수를 찾을 수 없습니다.');
                        }
                        
                        // 입력값으로 함수 실행
                        const result = fn(...inputs);
                        self.postMessage({ success: true, result });
                    } catch (err) {
                        self.postMessage({ success: false, error: err.message });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: "application/javascript" });
            const workerUrl = URL.createObjectURL(blob);
            const worker = new Worker(workerUrl);

            // 타임아웃 3초 설정 → 무한루프 차단
            const timeout = setTimeout(() => {
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                reject(new Error("시간 초과: 코드 실행이 3초를 초과했습니다."));
            }, 3000);

            // Worker 응답 처리
            worker.onmessage = (e) => {
                clearTimeout(timeout);
                worker.terminate();
                URL.revokeObjectURL(workerUrl);

                if (e.data.success) {
                    resolve(e.data.result);
                } else {
                    reject(new Error(e.data.error));
                }
            };

            // Worker 에러 처리
            worker.onerror = (e) => {
                clearTimeout(timeout);
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                reject(new Error(e.message));
            };

            // Worker에 코드와 입력값 전달
            worker.postMessage({ code, inputs });
        });
    };

    return { loading, error, runCode };
}
