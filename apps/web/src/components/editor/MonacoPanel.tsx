import {validateAnimationSource} from '@codevideo/animation-engine/validation';
import Editor, {loader, type BeforeMount} from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import {Braces, CheckCircle2, XCircle} from 'lucide-react';
import {useMemo} from 'react';

(self as unknown as {MonacoEnvironment: {getWorker: (_: string, label: string) => Worker}}).MonacoEnvironment =
  {
    getWorker(_moduleId: string, label: string) {
      if (label === 'typescript' || label === 'javascript') return new tsWorker();
      return new editorWorker();
    },
  };

loader.config({monaco});

const EXTRA_LIB = `
declare function makeScene2D(factory: (view: any) => Generator<void, void, void>): any;
declare module '@motion-canvas/2d' {
  export const Circle: any;
  export const Rect: any;
  export const Txt: any;
  export const Line: any;
  export const Img: any;
  export const Layout: any;
  export const Node: any;
}
declare module '@motion-canvas/core' {
  export function createRef<T = any>(): any;
  export function all(...tasks: any[]): any;
  export function chain(...tasks: any[]): any;
  export function waitFor(seconds: number): any;
  export function easeInOutCubic(value: number): number;
  export function easeOutCubic(value: number): number;
  export const Vector2: any;
}
declare module '@codevideo/animation' {
  export function fadeIn(node: any, seconds?: number, delay?: number): any;
  export function fadeOut(node: any, seconds?: number, delay?: number): any;
  export function slideIn(node: any, from: any, seconds?: number): any;
  export function cameraMove(view: any, target: any, seconds?: number, easing?: any): any;
  export function drawPath(path: any, seconds?: number): any;
  export function pulse(node: any, scale?: number, seconds?: number): any;
  export function typeText(node: any, text: string, seconds?: number): any;
}
`;

const beforeMount: BeforeMount = monacoApi => {
  monacoApi.languages.typescript.typescriptDefaults.addExtraLib(EXTRA_LIB, 'file:///codevideo.d.ts');
  monacoApi.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monacoApi.editor.defineTheme('codevideo-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      {token: 'comment', foreground: '5b6b8c', fontStyle: 'italic'},
      {token: 'keyword', foreground: '8b7dff'},
      {token: 'string', foreground: '7dd3fc'},
    ],
    colors: {
      'editor.background': '#0b1020',
      'editor.foreground': '#dbe4f5',
      'editorLineNumber.foreground': '#334155',
      'editorLineNumber.activeForeground': '#94a3b8',
      'editor.selectionBackground': '#6d5efc55',
      'editor.lineHighlightBackground': '#151c30',
    },
  });
};

export function MonacoPanel({
  value,
  onChange,
  sceneName,
}: {
  value: string;
  onChange: (value: string) => void;
  sceneName: string;
}) {
  const validation = useMemo(() => validateAnimationSource(value), [value]);
  return (
    <section className="flex h-[300px] shrink-0 flex-col border-r border-ink-800 bg-ink-950" data-testid="code-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-ink-800 px-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Braces className="h-3.5 w-3.5 text-accent-400" /> Code · {sceneName}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] ${validation.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {validation.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {validation.ok ? 'Valid animation source' : `${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'}`}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="typescript"
          theme="codevideo-dark"
          value={value}
          beforeMount={beforeMount}
          onChange={next => onChange(next ?? '')}
          options={{
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
            fontSize: 12.5,
            lineHeight: 20,
            minimap: {enabled: false},
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            automaticLayout: true,
            padding: {top: 12, bottom: 12},
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
    </section>
  );
}
