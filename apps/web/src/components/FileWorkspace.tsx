import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFileContent, WorkspaceFileEntry } from "@shared";
import { api } from "../lib/api";

interface FileWorkspaceProps {
  projectId: string;
  rootPath: string;
  token: string;
}

function getParentPath(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function getAncestors(filePath: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let index = 0; index < parts.length - 1; index += 1) {
    ancestors.push(parts.slice(0, index + 1).join("/"));
  }

  return ancestors;
}

export function FileWorkspace({ projectId, rootPath, token }: FileWorkspaceProps): JSX.Element {
  const [entriesByPath, setEntriesByPath] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [loadingPaths, setLoadingPaths] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileContent | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [createFilePath, setCreateFilePath] = useState("notes/todo.md");
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () => selectedFile !== null && selectedFile.content !== editorContent,
    [editorContent, selectedFile]
  );

  useEffect(() => {
    setEntriesByPath({});
    setExpandedPaths([""]);
    setSelectedFile(null);
    setEditorContent("");
    setError(null);

    void loadDirectory("", true);
  }, [projectId, token]);

  async function loadDirectory(currentPath = "", force = false): Promise<void> {
    if (!force && entriesByPath[currentPath]) {
      return;
    }

    setLoadingPaths((current) => [...new Set([...current, currentPath])]);
    try {
      const response = await api.listFiles(token, projectId, currentPath);
      setEntriesByPath((current) => ({ ...current, [response.currentPath]: response.entries }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载文件失败");
    } finally {
      setLoadingPaths((current) => current.filter((item) => item !== currentPath));
    }
  }

  async function handleOpenFile(filePath: string): Promise<void> {
    try {
      const response = await api.getFileContent(token, projectId, filePath);
      setSelectedFile(response.file);
      setEditorContent(response.file.content);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "打开文件失败");
    }
  }

  async function handleSaveFile(): Promise<void> {
    if (!selectedFile) {
      return;
    }

    setSaving(true);
    try {
      const response = await api.saveFile(token, projectId, {
        path: selectedFile.path,
        content: editorContent
      });
      setSelectedFile(response.file);
      setEditorContent(response.file.content);
      await loadDirectory(getParentPath(response.file.path), true);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存文件失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!createFilePath.trim()) {
      return;
    }

    setSaving(true);
    try {
      const response = await api.saveFile(token, projectId, {
        path: createFilePath.trim(),
        content: ""
      });
      const parentPath = getParentPath(response.file.path);
      setExpandedPaths((current) => [...new Set([...current, "", ...getAncestors(response.file.path)])]);
      await loadDirectory(parentPath, true);
      setSelectedFile(response.file);
      setEditorContent(response.file.content);
      setCreateFilePath(response.file.path);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新建文件失败");
    } finally {
      setSaving(false);
    }
  }

  function toggleDirectory(filePath: string): void {
    setExpandedPaths((current) => {
      if (current.includes(filePath)) {
        return current.filter((item) => item !== filePath);
      }

      void loadDirectory(filePath);
      return [...current, filePath];
    });
  }

  function renderEntries(currentPath = "", depth = 0): JSX.Element[] {
    const entries = entriesByPath[currentPath] ?? [];

    return entries.flatMap((entry) => {
      const isExpanded = expandedPaths.includes(entry.path);
      const isSelected = selectedFile?.path === entry.path;
      const loading = loadingPaths.includes(entry.path);

      const row = (
        <div className="file-tree-row" key={entry.path}>
          <button
            className={`file-tree-button ${isSelected ? "active" : ""}`}
            onClick={() =>
              entry.kind === "directory" ? toggleDirectory(entry.path) : void handleOpenFile(entry.path)
            }
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            type="button"
          >
            <span>{entry.kind === "directory" ? (isExpanded ? "▾" : "▸") : "•"}</span>
            <strong>{entry.name}</strong>
          </button>
          {entry.kind === "directory" && isExpanded ? (
            <>
              {loading ? <div className="muted file-tree-loading">加载中...</div> : null}
              {renderEntries(entry.path, depth + 1)}
            </>
          ) : null}
        </div>
      );

      return [row];
    });
  }

  return (
    <section className="files-panel">
      <div className="chat-header">
        <div>
          <div className="eyebrow">文件工作台</div>
          <h3>项目文件与编辑器</h3>
          <p className="muted">{rootPath}</p>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="files-layout">
        <div className="file-tree-panel">
          <form className="file-create-form" onSubmit={handleCreateFile}>
            <input
              onChange={(event) => setCreateFilePath(event.target.value)}
              placeholder="输入相对路径，例如 src/app.ts"
              value={createFilePath}
            />
            <button className="secondary-button compact" disabled={saving} type="submit">
              新建空文件
            </button>
          </form>

          <div className="file-tree">
            {loadingPaths.includes("") && !entriesByPath[""] ? <p className="muted">加载文件树...</p> : null}
            {(entriesByPath[""] ?? []).length === 0 && !loadingPaths.includes("") ? (
              <p className="muted">当前目录为空，或者工作区路径还不存在。</p>
            ) : null}
            {renderEntries()}
          </div>
        </div>

        <div className="file-editor-panel">
          <div className="file-editor-header">
            <div>
              <strong>{selectedFile?.path ?? "未选择文件"}</strong>
              <div className="muted">
                {selectedFile ? `最后更新：${new Date(selectedFile.updatedAt).toLocaleString()}` : "从左侧打开文件开始编辑"}
              </div>
            </div>
            <button
              className="primary-button"
              disabled={!selectedFile || !dirty || saving}
              onClick={handleSaveFile}
              type="button"
            >
              {saving ? "保存中..." : dirty ? "保存修改" : "已保存"}
            </button>
          </div>

          <textarea
            className="code-editor"
            disabled={!selectedFile}
            onChange={(event) => setEditorContent(event.target.value)}
            placeholder="选择一个文本文件后开始编辑"
            spellCheck={false}
            value={editorContent}
          />
        </div>
      </div>
    </section>
  );
}
