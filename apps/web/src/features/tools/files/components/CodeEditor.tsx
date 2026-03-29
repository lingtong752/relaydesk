import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { pythonLanguage } from "@codemirror/lang-python";
import { xmlLanguage } from "@codemirror/lang-xml";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  LanguageSupport
} from "@codemirror/language";
import { useMemo } from "react";
import { getLanguageModeKey } from "../editorLanguage";

interface CodeEditorProps {
  filePath?: string;
  value: string;
  disabled?: boolean;
  placeholderText: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}

function createLanguageExtension(filePath?: string): Extension | null {
  if (!filePath) {
    return null;
  }

  const mode = getLanguageModeKey(filePath);
  if (mode === "javascript") {
    return new LanguageSupport(javascriptLanguage);
  }

  if (mode === "json") {
    return new LanguageSupport(jsonLanguage);
  }

  if (mode === "markdown") {
    return new LanguageSupport(markdownLanguage);
  }

  if (mode === "html") {
    return new LanguageSupport(htmlLanguage);
  }

  if (mode === "css") {
    return new LanguageSupport(cssLanguage);
  }

  if (mode === "xml") {
    return new LanguageSupport(xmlLanguage);
  }

  if (mode === "python") {
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
  const extensions = useMemo(() => {
    const nextExtensions: Extension[] = [
      editorSurfaceTheme,
      EditorView.lineWrapping,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      placeholder(placeholderText)
    ];
    const languageExtension = createLanguageExtension(filePath);
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
  }, [disabled, filePath, onSave, placeholderText]);

  return (
    <div className="code-editor">
      <CodeMirror
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
    </div>
  );
}
