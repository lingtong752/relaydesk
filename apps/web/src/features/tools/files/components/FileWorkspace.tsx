import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionRecord, WorkspaceFileContent, WorkspaceFileEntry } from "@shared";
import { api } from "../../../../lib/api";
import {
  getSessionOriginRuntimeLabel,
  getSessionResumeStatusLabel,
  getSessionStatusLabel
} from "../../../../lib/sessionRuntime";
import { EmptyState } from "../../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../../shared/ui/SectionHeader";
import { CodeEditor } from "./CodeEditor";

interface FileWorkspaceProps {
  boundSession?: SessionRecord | null;
  onOpenBoundSession?(): void;
  projectId: string;
  rootPath: string;
  token: string;
}

interface FileEditorTab {
  file: WorkspaceFileContent;
  draft: string;
  saving: boolean;
}

const FILE_SEARCH_MIN_LENGTH = 2;
const FILE_SEARCH_LIMIT = 24;
const FILE_SEARCH_DEBOUNCE_MS = 180;

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

function getFileName(filePath: string): string {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

function isTabDirty(tab: FileEditorTab): boolean {
  return tab.file.content !== tab.draft;
}

function confirmAction(message: string): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }

  return window.confirm(message);
}

export function FileWorkspace({
  boundSession = null,
  onOpenBoundSession,
  projectId,
  rootPath,
  token
}: FileWorkspaceProps): JSX.Element {
  const [entriesByPath, setEntriesByPath] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [loadingPaths, setLoadingPaths] = useState<string[]>([]);
  const [openTabs, setOpenTabs] = useState<FileEditorTab[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [createFilePath, setCreateFilePath] = useState("notes/todo.md");
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WorkspaceFileEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openTabsRef = useRef<FileEditorTab[]>([]);

  const selectedTab = useMemo(
    () => openTabs.find((tab) => tab.file.path === selectedFilePath) ?? null,
    [openTabs, selectedFilePath]
  );
  const dirtyTabs = useMemo(
    () => openTabs.filter((tab) => isTabDirty(tab)),
    [openTabs]
  );
  const boundSessionResumeLabel = useMemo(
    () => getSessionResumeStatusLabel(boundSession),
    [boundSession]
  );
  const searchQuery = fileSearchQuery.trim();
  const shouldShowSearchResults = searchQuery.length >= FILE_SEARCH_MIN_LENGTH;

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    setEntriesByPath({});
    setExpandedPaths([""]);
    setOpenTabs([]);
    setSelectedFilePath("");
    setCreateFilePath("notes/todo.md");
    setFileSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setCreatingFile(false);
    setError(null);

    void loadDirectory("", true);
  }, [projectId, token]);

  useEffect(() => {
    if (dirtyTabs.length === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirtyTabs.length]);

  useEffect(() => {
    if (!shouldShowSearchResults) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await api.searchFiles(token, projectId, searchQuery, FILE_SEARCH_LIMIT);
        if (!cancelled) {
          setSearchResults(response.entries);
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setSearchResults([]);
          setError(requestError instanceof Error ? requestError.message : "搜索文件失败");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, FILE_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [projectId, searchQuery, shouldShowSearchResults, token]);

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

  async function revealFilePath(filePath: string): Promise<void> {
    const ancestorPaths = getAncestors(filePath);
    setExpandedPaths((current) => [...new Set([...current, "", ...ancestorPaths])]);
    for (const ancestorPath of ancestorPaths) {
      await loadDirectory(ancestorPath);
    }
  }

  function upsertOpenTab(file: WorkspaceFileContent): void {
    setOpenTabs((current) => {
      const existing = current.find((tab) => tab.file.path === file.path);
      if (!existing) {
        return [...current, { file, draft: file.content, saving: false }];
      }

      return current.map((tab) =>
        tab.file.path === file.path
          ? {
              ...tab,
              file,
              draft: isTabDirty(tab) ? tab.draft : file.content
            }
          : tab
      );
    });
    setSelectedFilePath(file.path);
  }

  async function handleOpenFile(filePath: string): Promise<void> {
    setSelectedFilePath(filePath);
    await revealFilePath(filePath);

    const existing = openTabsRef.current.find((tab) => tab.file.path === filePath);
    if (existing) {
      setError(null);
      return;
    }

    try {
      const response = await api.getFileContent(token, projectId, filePath);
      upsertOpenTab(response.file);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "打开文件失败");
    }
  }

  function updateTabDraft(filePath: string, draft: string): void {
    setOpenTabs((current) =>
      current.map((tab) =>
        tab.file.path === filePath
          ? {
              ...tab,
              draft
            }
          : tab
      )
    );
  }

  async function handleSaveFile(filePath = selectedTab?.file.path ?? ""): Promise<void> {
    if (!filePath) {
      return;
    }

    const currentTab = openTabsRef.current.find((tab) => tab.file.path === filePath);
    if (!currentTab) {
      return;
    }

    setOpenTabs((current) =>
      current.map((tab) =>
        tab.file.path === filePath
          ? {
              ...tab,
              saving: true
            }
          : tab
      )
    );

    try {
      const response = await api.saveFile(token, projectId, {
        path: filePath,
        content: currentTab.draft
      });
      setOpenTabs((current) =>
        current.map((tab) =>
          tab.file.path === filePath
            ? {
                file: response.file,
                draft: response.file.content,
                saving: false
              }
            : tab
        )
      );
      await loadDirectory(getParentPath(response.file.path), true);
      setError(null);
    } catch (requestError) {
      setOpenTabs((current) =>
        current.map((tab) =>
          tab.file.path === filePath
            ? {
                ...tab,
                saving: false
              }
            : tab
        )
      );
      setError(requestError instanceof Error ? requestError.message : "保存文件失败");
    }
  }

  async function handleSaveAllDirtyTabs(): Promise<void> {
    for (const tab of openTabsRef.current.filter((item) => isTabDirty(item))) {
      await handleSaveFile(tab.file.path);
    }
  }

  async function handleCreateFile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedPath = createFilePath.trim();
    if (!normalizedPath) {
      return;
    }

    setCreatingFile(true);
    try {
      const response = await api.saveFile(token, projectId, {
        path: normalizedPath,
        content: ""
      });
      const parentPath = getParentPath(response.file.path);
      setExpandedPaths((current) => [...new Set([...current, "", ...getAncestors(response.file.path)])]);
      await loadDirectory(parentPath, true);
      upsertOpenTab(response.file);
      setCreateFilePath(response.file.path);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新建文件失败");
    } finally {
      setCreatingFile(false);
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

  function handleCloseTab(filePath: string): void {
    const targetTab = openTabsRef.current.find((tab) => tab.file.path === filePath);
    if (!targetTab) {
      return;
    }

    if (
      isTabDirty(targetTab) &&
      !confirmAction(`文件 ${filePath} 还有未保存修改，确认关闭这个标签页吗？`)
    ) {
      return;
    }

    setOpenTabs((current) => current.filter((tab) => tab.file.path !== filePath));
    setSelectedFilePath((current) => {
      if (current !== filePath) {
        return current;
      }

      const remainingTabs = openTabsRef.current.filter((tab) => tab.file.path !== filePath);
      return remainingTabs.at(-1)?.file.path ?? "";
    });
  }

  function renderEntries(currentPath = "", depth = 0): JSX.Element[] {
    const entries = entriesByPath[currentPath] ?? [];

    return entries.flatMap((entry) => {
      const isExpanded = expandedPaths.includes(entry.path);
      const isSelected = selectedFilePath === entry.path;
      const isOpen = openTabs.some((tab) => tab.file.path === entry.path);
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
            {entry.kind === "file" && isOpen ? <span className="file-open-indicator">已打开</span> : null}
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
      <SectionHeader
        description={rootPath}
        eyebrow="文件工作台"
        title="项目文件与编辑器"
      />

      {error ? <div className="error-box">{error}</div> : null}
      {boundSession ? (
        <div className="info-box">
          当前从会话“{boundSession.title}”进入文件工作台。
          {` ${boundSession.provider} · ${getSessionOriginRuntimeLabel(boundSession)} · 状态 ${getSessionStatusLabel(boundSession)}。`}
          {boundSessionResumeLabel ? ` ${boundSessionResumeLabel}。` : ""}
          {onOpenBoundSession ? (
            <>
              {" "}
              <button className="secondary-button compact" onClick={onOpenBoundSession} type="button">
                回到当前会话
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="files-layout">
        <div className="file-tree-panel">
          <form className="file-create-form" onSubmit={handleCreateFile}>
            <input
              onChange={(event) => setCreateFilePath(event.target.value)}
              placeholder="输入相对路径，例如 src/app.ts"
              value={createFilePath}
            />
            <button className="secondary-button compact" disabled={creatingFile} type="submit">
              {creatingFile ? "创建中..." : "新建空文件"}
            </button>
          </form>

          <div className="file-search-panel">
            <input
              onChange={(event) => setFileSearchQuery(event.target.value)}
              placeholder="快速打开文件，至少输入 2 个字符"
              value={fileSearchQuery}
            />
            {shouldShowSearchResults ? (
              <div className="file-search-results">
                {searching ? <div className="muted">搜索中...</div> : null}
                {!searching && searchResults.length === 0 ? (
                  <div className="muted">没有找到匹配文件。</div>
                ) : null}
                {searchResults.map((entry) => (
                  <button
                    className="file-search-item"
                    key={entry.path}
                    onClick={() => {
                      setFileSearchQuery("");
                      setSearchResults([]);
                      void handleOpenFile(entry.path);
                    }}
                    type="button"
                  >
                    <strong>{entry.name}</strong>
                    <span className="muted">{entry.path}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="field-hint">输入文件名或路径片段，可以直接从整个工作区快速打开。</div>
            )}
          </div>

          <div className="file-tree">
            {loadingPaths.includes("") && !entriesByPath[""] ? <p className="muted">加载文件树...</p> : null}
            {(entriesByPath[""] ?? []).length === 0 && !loadingPaths.includes("") ? (
              <EmptyState message="当前目录为空，或者工作区路径还不存在。" />
            ) : null}
            {renderEntries()}
          </div>
        </div>

        <div className="file-editor-panel">
          <div className="file-tab-strip">
            {openTabs.length === 0 ? (
              <div className="info-box">从左侧文件树或快速打开里选择文件后，这里会保留多个编辑标签页。</div>
            ) : (
              openTabs.map((tab) => {
                const dirty = isTabDirty(tab);
                const active = tab.file.path === selectedFilePath;
                return (
                  <div className={`file-tab ${active ? "active" : ""}`} key={tab.file.path}>
                    <button
                      className="file-tab-button"
                      onClick={() => setSelectedFilePath(tab.file.path)}
                      type="button"
                    >
                      <strong>{getFileName(tab.file.path)}</strong>
                      <span className="file-tab-meta">
                        {dirty ? "未保存" : "已保存"} · {tab.file.path}
                      </span>
                    </button>
                    <button
                      aria-label={`关闭 ${tab.file.path}`}
                      className="file-tab-close"
                      onClick={() => handleCloseTab(tab.file.path)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="file-editor-header">
            <div>
              <strong>{selectedTab?.file.path ?? "未选择文件"}</strong>
              <div className="muted">
                {selectedTab
                  ? `${isTabDirty(selectedTab) ? "当前标签有未保存修改" : "当前标签已保存"} · 最后更新 ${new Date(selectedTab.file.updatedAt).toLocaleString()}`
                  : "从左侧打开文件开始编辑"}
              </div>
            </div>
            <div className="button-row">
              <button
                className="secondary-button compact"
                disabled={dirtyTabs.length === 0}
                onClick={() => void handleSaveAllDirtyTabs()}
                type="button"
              >
                保存全部
              </button>
              <button
                className="primary-button"
                disabled={!selectedTab || !isTabDirty(selectedTab) || selectedTab.saving}
                onClick={() => void handleSaveFile()}
                type="button"
              >
                {selectedTab?.saving ? "保存中..." : selectedTab && isTabDirty(selectedTab) ? "保存修改" : "已保存"}
              </button>
            </div>
          </div>

          <CodeEditor
            disabled={!selectedTab}
            filePath={selectedTab?.file.path}
            onChange={(value) => {
              if (!selectedTab) {
                return;
              }

              updateTabDraft(selectedTab.file.path, value);
            }}
            onSave={() => {
              void handleSaveFile();
            }}
            placeholderText="选择一个文本文件后开始编辑"
            value={selectedTab?.draft ?? ""}
          />
        </div>
      </div>
    </section>
  );
}
