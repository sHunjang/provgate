"use client";

// useState: Pyodide 로딩 상태 관리
// useEffect: 컴포넌트 마운트 시 Pyodide 로드
// useRef: Pyodide 인스턴스 컴포넌트 리렌더링과 무관하게 유지
//         useState와 달리 값이 바뀌어도 리렌더링 안 됨.
import { useState, useEffect, useRef } from "react";

// Pyodide 타입 정의 - TypeScript용
// 실제 Pyodide는 CDN에서 로드되므로 타입만 가져옴
type PyodideType = {
    runPythonAsync: (code: string) => Promise<unknown>;

    globals: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
    };
};

// Pyodide가 Python 객체(dict, list 등)를 JS로 넘길 때 쓰는 래퍼 타입
// CS 개념 - 프록시 패턴(Proxy Pattern):
//   PyProxy는 "진짜 JS 객체"가 아니라, Python 메모리에 있는 객체를
//   JS에서 다루기 위한 대리인(proxy) 객체.
//   그래서 JSON.stringify()처럼 "이 객체의 진짜 데이터가 뭐야?"라고 묻는 함수들이
//   PyProxy 내부를 못 들여다보고 빈 객체 {}로 잘못 인식해버림.
//   toJs(): 이 대리인 객체를 진짜 JS 네이티브 객체(Object, Array 등)로
//          "번역"해주는 Pyodide의 공식 메서드
type PyProxyLike = {
    toJs: (options: { dict_converter: typeof Object.fromEntries }) => unknown;
};

// 전역 window 타입 확장
// Pyodide는 CDN 스크립트로 window.loadPyodide를 주입함
declare global {
    interface Window {
        loadPyodide: (config: { indexURL: string }) => Promise<PyodideType>;
    }
}

// 값이 PyProxy(toJs 메서드를 가진 객체)인지 판별하는 타입 가드 함수
// CS 개념 - 타입 가드(Type Guard):
//   런타임에 값의 실제 타입을 확인해서, TypeScript 컴파일러에게
//   "이 블록 안에서는 이 값을 PyProxyLike로 취급해도 안전하다"고 알려주는 함수
function isPyProxy(value: unknown): value is PyProxyLike {
    return (
        typeof value === "object" &&
        value !== null &&
        "toJs" in value &&
        typeof (value as { toJs: unknown }).toJs === "function"
    );
}

export function usePyodide() {
    // Pyodide 인스턴스 - ref로 관리해서 리렌터링 방지
    const pyodideRef = useRef<PyodideType | null>(null);

    // 로딩 상태 관리
    const [loading, setLoading] = useState(true);

    // 에러 상태
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadPyodide = async () => {
            try {
                // Pyodide 스크립트가 이미 로드됐는지 확인
                // 중복 로드 방지 (Strict Mode에서 2번 실행할 수 있음)
                if (pyodideRef.current) return;

                // CDN에서 Pyodide 스크립트 동작 코드
                // 스크립트 태그를 동적으로 생성해서 head에 추가
                if (!document.getElementById("pyodide-script")) {
                    const script = document.createElement("script");

                    script.id = "pyodide-script";
                    script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";

                    document.head.appendChild(script);

                    // 스크립트 로드 완료까지 대기
                    await new Promise<void>((resolve, reject) => {
                        script.onload = () => resolve();
                        script.onerror = () => reject(new Error("Pyodide 스크립트 로드 실패"));
                    });
                }

                // Pyodide 초기화
                // indexURL: Pyodide 패키지들의 CDN 주소
                const pyodide = await window.loadPyodide({
                    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
                });

                pyodideRef.current = pyodide;
                setLoading(false);
            } catch {
                setError("Python 환경을 불러오는 중 오류가 발생했습니다.");
                setLoading(false);
            }
        };

        loadPyodide();
    }, []);

    // Python 코드 실행 함수
    // Test Case를 코드와 함께 실행되고 결과 반환
    const runCode = async (code: string, testCases: { input: string; output: string }[]) => {
        if (!pyodideRef.current) {
            return { success: false, message: "Python 환경이 준비되지 않았습니다." };
        }

        // 각 테스트 케이스 실행 결과
        const results = [];

        for (const testCase of testCases) {
            try {
                // test_cases의 input을 JSON 배열로 파싱
                // 예: "[1, 2]" -> [1, 2] / '["hello", 3]' -> ["hello", 3]
                let parsedInput: unknown[];
                try {
                    parsedInput = JSON.parse(testCase.input);
                } catch {
                    // JSON 파싱 실패 시 문자열 하나짜리 배열로 처리
                    parsedInput = [testCase.input];
                }

                // 기대 출력값도 JSON 파싱 시도
                // 예: "3" -> 3 / '"hello"' -> "hello" / "[1,2]" -> [1,2]
                let parsedExpected: unknown;
                try {
                    parsedExpected = JSON.parse(testCase.output);
                } catch {
                    parsedExpected = testCase.output.trim();
                }

                // solution() 함수 정의 + 호출 + 결과 저장
                // _args로 인자 전달, _result에 반환값 저장
                const wrappedCode = `
import json

# 테스트 인자 - JSON으로 직렬화해서 Python으로 전달
_args = json.loads(${JSON.stringify(JSON.stringify(parsedInput))})

# 사용자가 작성한 solution() 함수 정의
${code}

# solution() 호출 후 결과 저장
_result = solution(*_args)
`;

                await pyodideRef.current.runPythonAsync(wrappedCode);
                const rawOutput = pyodideRef.current.globals.get("_result");

                // Python 결과값을 JS로 변환
                // 숫자/문자열/None 등 기본 타입은 Pyodide가 이미 자동으로
                //   JS 기본 타입(number/string/null)으로 변환해줘서 그대로 써도 안전함
                // 하지만 dict나 list는 PyProxy(대리인 객체)로 넘어오기 때문에
                //   isPyProxy로 감지해서 toJs()로 명시적으로 변환해야 함
                //   (안 그러면 JSON.stringify가 내부를 못 읽고 {} 로 잘못 찍음)
                // dict_converter: Object.fromEntries
                //   → Python dict를 JS의 Map이 아니라 일반 Object로 변환하도록 지정
                //     (Map으로 변환되면 JSON.stringify(map)도 {} 가 나와서 똑같은 문제가 생김)
                const output = isPyProxy(rawOutput)
                    ? rawOutput.toJs({ dict_converter: Object.fromEntries })
                    : rawOutput;

                // JS로 변환된 결과를 JSON 문자열로 직렬화해서 비교
                // 예: Python list [1,2] -> JS Array -> "[1,2]"
                // 예: Python dict {"a":1} -> JS Object -> '{"a":1}'
                const outputStr = JSON.stringify(output);
                const expectedStr = JSON.stringify(parsedExpected);

                const passed = outputStr === expectedStr;

                results.push({
                    passed,
                    output: outputStr,
                    expected: expectedStr,
                    message: passed ? "통과" : `실패: 기대 ${expectedStr}, 실제 ${outputStr}`,
                });
            } catch (err) {
                const errorMessage =
                    String(err)
                        .replace("PythonError: Traceback (most recent call last):", "")
                        .trim()
                        .split("\n")
                        .pop() || String(err);

                results.push({
                    passed: false,
                    output: `❌ ${errorMessage}`,
                    expected: testCase.output,
                    message: `에러: ${err}`,
                });
            }
        }

        const allPassed = results.every((r) => r.passed);
        return {
            success: allPassed,
            results,
            message: allPassed
                ? "모든 테스트 통과! 🎉"
                : `${results.filter((r) => r.passed).length}/${results.length} 통과`,
        };
    };

    return {
        // Pyodide 로딩 중 여부
        loading,

        // 에러 메세지
        error,

        // 코드 실행 함수
        runCode,
    };
}
