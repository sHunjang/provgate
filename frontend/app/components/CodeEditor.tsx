"use client";

// CodeMirror 핵심 컴포넌트
// ReactCodeMirror: CodeMirror를 React에서 쓸 수 있게 감싼 래퍼 컴포넌트
import ReactCodeMirror from "@uiw/react-codemirror";

// Python 문법 하이라이팅 확장
import { python } from "@codemirror/lang-python";

// CodeMirror 테마 - VSCode 다크 테마
// 참고: 이 테마 자체는 그대로 유지함. 코드 에디터 내부(글자색, 문법 강조 등)는
// VSCode 스타일이 개발자에게 가장 익숙하고 가독성이 검증된 배색이라,
// 사이트 전체 라이트/다크 전환과 별개로 "항상 다크 코드 테마"를 쓰는 게
// 일반적인 관례임 (GitHub, CodeSandbox 등 대부분의 코드 에디터가 이 방식)
import { vscodeDark } from "@uiw/codemirror-theme-vscode";

type CodeEditorProps = {
    // 현재 코드 값
    value: string;

    // 코드가 바뀔 때 호출되는 콜백 함수
    onChange: (value: string) => void;

    // 에디터 높이 (default: 400px)
    height?: string;

    // 읽기 전용 여부 (default: false)
    readOnly?: boolean;
};

export default function CodeEditor({ value, onChange, height = "400px", readOnly = false }: CodeEditorProps) {
    return (
        // 수정: border-gray-700 → border-[var(--border-strong)]
        // 에디터 내부는 다크 테마 고정이지만, 바깥 테두리는 페이지의
        // 라이트/다크 상태에 맞춰 자연스럽게 어울리도록 팔레트 변수 사용
        <div className="rounded-xl overflow-hidden border border-[var(--border-strong)]">
            <ReactCodeMirror
                value={value}
                onChange={onChange}
                height={height}
                theme={vscodeDark}
                extensions={[python()]}
                editable={!readOnly}
                basicSetup={{
                    lineNumbers: true,
                    highlightActiveLine: true,
                    indentOnInput: true,
                    bracketMatching: true,
                    foldGutter: true,
                    tabSize: 4,
                }}
            />
        </div>
    );
}
