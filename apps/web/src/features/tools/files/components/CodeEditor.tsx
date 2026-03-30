import type { Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  LanguageSupport
} from "@codemirror/language";
import { useEffect, useMemo, useState } from "react";
import { getLanguageModeKey } from "../editorLanguage";

interface CodeEditorProps {
  filePath?: string;
  value: string;
  disabled?: boolean;
  placeholderText: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}

type CodeMirrorComponentType = typeof import("@uiw/react-codemirror").default;

async function loadLanguageExtension(filePath?: string): Promise<Extension | null> {
  if (!filePath) {
    return null;
  }

  const mode = getLanguageModeKey(filePath);
  if (mode === "javascript") {
    const { javascriptLanguage } = await import("@codemirror/lang-javascript");
    return new LanguageSupport(javascriptLanguage);
  }

  if (mode === "json") {
    const { jsonLanguage } = await import("@codemirror/lang-json");
    return new LanguageSupport(jsonLanguage);
  }

  if (mode === "markdown") {
    const { markdownLanguage } = await import("@codemirror/lang-markdown");
    return new LanguageSupport(markdownLanguage);
  }

  if (mode === "html") {
    const { htmlLanguage } = await import("@codemirror/lang-html");
    return new LanguageSupport(htmlLanguage);
  }

  if (mode === "css") {
    const { cssLanguage } = await import("@codemirror/lang-css");
    return new LanguageSupport(cssLanguage);
  }

  if (mode === "xml") {
    const { xmlLanguage } = await import("@codemirror/lang-xml");
    return new LanguageSupport(xmlLanguage);
  }

  if (mode === "python") {
    const { pythonLanguage } = await import("@codemirror/lang-python");
    return new LanguageSupport(pythonLanguage);
  }

  return null;
}

const editorSurfaceTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "360px",
    backgroundColor: "transparent",
    color: "inherit"
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "\"SFMono-Regular\", \"Consolas\", monospace",
    lineHeight: "1.6"
  },
  ".cm-content, .cm-gutter": {
    minHeight: "360px",
    paddingTop: "12px",
    paddingBottom: "12px"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(82, 124, 255, 0.08)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent"
  },
  ".cm-focused": {
    outline: "none"
  }
});

export function CodeEditor({
  filePath,
  value,
  disabled = false,
  placeholderText,
  onChange,
  onSave
}: CodeEditorProps): JSX.Element {
  const [codeMirrorComponent, setCodeMirrorComponent] = useState<CodeMirrorComponentType | null>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import("@uiw/react-codemirror").then((module) => {
      if (!cancelled) {
        setCodeMirrorComponent(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLanguageExtension(null);

    void loadLanguageExtension(filePath).then((extension) => {
      if (!cancelled) {
        setLanguageExtension(extension);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const extensions = useMemo(() => {
    const nextExtensions: Extension[] = [
      editorSurfaceTheme,
      EditorView.lineWrapping,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      placeholder(placeholderText)
    ];
    if (languageExtension) {
      nextExtensions.push(languageExtension);
    }

    nextExtensions.push(
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            if (disabled || !onSave) {
              return false;
            }

            onSave();
            return true;
          }
        }
      ])
    );

    return nextExtensions;
  }, [disabled, languageExtension, onSave, placeholderText]);

  const CodeMirrorComponent = codeMirrorComponent;

  return (
    <div className="code-editor">
      {CodeMirrorComponent ? (
        <CodeMirrorComponent
          aria-label={filePath ? `代码编辑器：${filePath}` : "代码编辑器"}
          basicSetup={{
            foldGutter: false,
            dropCursor: false,
            highlightActiveLine: !disabled,
            highlightActiveLineGutter: !disabled
          }}
          editable={!disabled}
          extensions={extensions}
          height="100%"
          onChange={onChange}
          value={value}
        />
      ) : (
        <div className="code-editor-loading">编辑器模块加载中...</div>
      )}
    </div>
  );
}
