import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import type { AuthUser } from "@shared";
import type { SessionRecord } from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

interface ProjectLayoutProps {
  user: AuthUser;
}

type WorkbenchTab = "chat" | "terminal" | "files" | "git";
type CommandGroup = "workbench" | "session" | "project";
type CommandPaletteScope = "all" | "session";
const MAX_PINNED_SESSION_COUNT = 6;
const MAX_RECENT_COMMAND_COUNT = 16;
const MAX_RECENT_COMMAND_GROUP_COUNT = 5;

interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  group: CommandGroup;
  sortAt?: number;
  sessionId?: string;
  execute(): void;
}

interface CommandPaletteSection {
  id: string;
  title: string;
  items: CommandPaletteItem[];
}

function getConnectionStatusLabel(state: ReturnType<typeof useProjectWorkspace>["realtimeState"]): string {
  if (state === "connected") {
    return "实时连接正常";
  }

  if (state === "reconnecting") {
    return "正在恢复实时连接";
  }

  if (state === "connecting") {
    return "正在建立实时连接";
  }

  return "实时连接已断开";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function getSessionActivityAt(session: SessionRecord): number {
  const timestamp = Date.parse(session.lastMessageAt ?? session.updatedAt ?? session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getGroupLabel(group: CommandGroup): string {
  if (group === "workbench") {
    return "工作台";
  }

  if (group === "session") {
    return "会话";
  }

  return "项目";
}

function getStorageKey(projectId: string, field: "pinnedSessions" | "recentCommands"): string {
  return `relaydesk.workspace.${projectId}.commandPalette.${field}`;
}

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function persistIds(key: string, ids: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // localStorage may be unavailable in private mode or restricted environments.
  }
}

export function ProjectLayout({ user }: ProjectLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteScope, setPaletteScope] = useState<CommandPaletteScope>("all");
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>([]);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const {
    loadingProject,
    projectId,
    projectName,
    projectRootPath,
    realtimeState,
    selectedSessionId,
    sessions,
    selectSession
  } = useProjectWorkspace();

  const sortedSessions = useMemo(
    () => [...sessions].sort((left, right) => getSessionActivityAt(right) - getSessionActivityAt(left)),
    [sessions]
  );
  const pinnedSessionStorageKey = useMemo(() => getStorageKey(projectId, "pinnedSessions"), [projectId]);
  const recentCommandStorageKey = useMemo(() => getStorageKey(projectId, "recentCommands"), [projectId]);
  const sessionById = useMemo(() => new Map(sortedSessions.map((session) => [session.id, session])), [sortedSessions]);
  const validSessionIdSet = useMemo(() => new Set(sortedSessions.map((session) => session.id)), [sortedSessions]);
  const pinnedSessionIdSet = useMemo(() => new Set(pinnedSessionIds), [pinnedSessionIds]);
  const recentCommandRank = useMemo(() => {
    const rank = new Map<string, number>();
    recentCommandIds.forEach((commandId, index) => rank.set(commandId, index));
    return rank;
  }, [recentCommandIds]);
  const pinnedSessions = useMemo(
    () => pinnedSessionIds.map((sessionId) => sessionById.get(sessionId)).filter((session): session is SessionRecord => Boolean(session)),
    [pinnedSessionIds, sessionById]
  );
  const recentSessions = useMemo(
    () => sortedSessions.filter((session) => !pinnedSessionIdSet.has(session.id)).slice(0, 4),
    [pinnedSessionIdSet, sortedSessions]
  );

  function buildWorkbenchPath(tab: WorkbenchTab, sessionId = selectedSessionId): string {
    const sessionQuery = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    if (tab === "chat") {
      return `/workspace/${projectId}/chat${sessionQuery}`;
    }

    if (tab === "terminal") {
      return `/workspace/${projectId}/tools/terminal${sessionQuery}`;
    }

    if (tab === "files") {
      return `/workspace/${projectId}/tools/files${sessionQuery}`;
    }

    return `/workspace/${projectId}/tools/git${sessionQuery}`;
  }

  function openCommandPalette(scope: CommandPaletteScope = "all"): void {
    setPaletteScope(scope);
    setActiveCommandIndex(0);
    setPaletteOpen(true);
  }

  function closeCommandPalette(): void {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteScope("all");
    setActiveCommandIndex(0);
  }

  function openSessionInChat(sessionId: string): void {
    selectSession(sessionId);
    navigate(buildWorkbenchPath("chat", sessionId));
  }

  function togglePinnedSession(sessionId: string): void {
    setPinnedSessionIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId);
      }

      return [sessionId, ...current.filter((id) => id !== sessionId)].slice(0, MAX_PINNED_SESSION_COUNT);
    });
  }

  function markCommandAsRecent(commandId: string): void {
    setRecentCommandIds((current) => [commandId, ...current.filter((id) => id !== commandId)].slice(0, MAX_RECENT_COMMAND_COUNT));
  }

  function getCommandPriority(item: CommandPaletteItem, normalizedQuery: string): number {
    let score = 0;
    const title = item.title.toLowerCase();
    const searchable = `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();

    if (item.group === "workbench") {
      score += 56;
    } else if (item.group === "session") {
      score += 32;
    } else {
      score += 14;
    }

    if (item.sessionId && pinnedSessionIdSet.has(item.sessionId)) {
      score += 220;
    }

    const recentRank = recentCommandRank.get(item.id);
    if (typeof recentRank === "number") {
      score += Math.max(0, 120 - recentRank * 6);
    }

    if (normalizedQuery) {
      if (title.startsWith(normalizedQuery)) {
        score += 48;
      } else if (title.includes(normalizedQuery)) {
        score += 30;
      } else if (searchable.includes(normalizedQuery)) {
        score += 18;
      }
    }

    return score;
  }

  const commandItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "workbench-chat",
        title: "打开 Chat",
        subtitle: "继续当前会话消息流",
        keywords: "chat conversation message",
        group: "workbench",
        execute: () => navigate(buildWorkbenchPath("chat"))
      },
      {
        id: "workbench-shell",
        title: "打开 Shell",
        subtitle: "进入绑定终端上下文",
        keywords: "shell terminal command",
        group: "workbench",
        execute: () => navigate(buildWorkbenchPath("terminal"))
      },
      {
        id: "workbench-files",
        title: "打开 Files",
        subtitle: "查看并编辑项目文件",
        keywords: "files code editor",
        group: "workbench",
        execute: () => navigate(buildWorkbenchPath("files"))
      },
      {
        id: "workbench-git",
        title: "打开 Source Control",
        subtitle: "查看 Git 变更和分支",
        keywords: "git source control diff",
        group: "workbench",
        execute: () => navigate(buildWorkbenchPath("git"))
      },
      {
        id: "project-switch",
        title: "切换项目",
        subtitle: "返回项目列表",
        keywords: "project switch list",
        group: "project",
        execute: () => navigate("/projects")
      },
      ...sortedSessions.slice(0, 8).map((session) => ({
        id: `session-${session.id}`,
        title: `切换会话：${session.title}${pinnedSessionIdSet.has(session.id) ? "（已固定）" : ""}`,
        subtitle: `${session.provider} · ${session.origin === "imported_cli" ? "CLI 导入" : "RelayDesk 创建"}`,
        keywords: `${session.title} ${session.provider} ${session.origin} ${pinnedSessionIdSet.has(session.id) ? "pinned fixed" : ""}`,
        group: "session" as const,
        sortAt: getSessionActivityAt(session),
        sessionId: session.id,
        execute: () => openSessionInChat(session.id)
      }))
    ],
    [navigate, projectId, selectSession, selectedSessionId, sortedSessions, pinnedSessionIdSet]
  );

  const visibleCommandItems = useMemo(() => {
    const normalizedQuery = paletteQuery.trim().toLowerCase();
    const scopedItems =
      paletteScope === "session" ? commandItems.filter((item) => item.group === "session") : commandItems;
    const filteredItems = normalizedQuery
      ? scopedItems.filter((item) =>
          `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase().includes(normalizedQuery)
        )
      : scopedItems;

    return [...filteredItems].sort((left, right) => {
      const priorityDiff = getCommandPriority(right, normalizedQuery) - getCommandPriority(left, normalizedQuery);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const activityDiff = (right.sortAt ?? 0) - (left.sortAt ?? 0);
      if (activityDiff !== 0) {
        return activityDiff;
      }

      return left.title.localeCompare(right.title, "zh-Hans-CN");
    });
  }, [commandItems, paletteQuery, paletteScope, pinnedSessionIdSet, recentCommandRank]);

  const commandIndexById = useMemo(() => {
    const indexMap = new Map<string, number>();
    visibleCommandItems.forEach((item, index) => indexMap.set(item.id, index));
    return indexMap;
  }, [visibleCommandItems]);

  const commandSections = useMemo<CommandPaletteSection[]>(() => {
    const sections: CommandPaletteSection[] = [];
    const recentItems = visibleCommandItems
      .filter((item) => recentCommandRank.has(item.id))
      .sort((left, right) => (recentCommandRank.get(left.id) ?? 999) - (recentCommandRank.get(right.id) ?? 999))
      .slice(0, MAX_RECENT_COMMAND_GROUP_COUNT);

    if (recentItems.length > 0) {
      sections.push({ id: "recent", title: "最近执行", items: recentItems });
    }

    const recentItemIds = new Set(recentItems.map((item) => item.id));
    const remainingItems = visibleCommandItems.filter((item) => !recentItemIds.has(item.id));

    if (paletteScope === "session") {
      if (remainingItems.length > 0) {
        sections.push({ id: "session", title: "会话命令", items: remainingItems });
      }

      return sections;
    }

    const groupOrder: CommandGroup[] = ["workbench", "session", "project"];
    groupOrder.forEach((group) => {
      const groupItems = remainingItems.filter((item) => item.group === group);
      if (groupItems.length === 0) {
        return;
      }

      sections.push({
        id: group,
        title: group === "workbench" ? "工作台" : group === "session" ? "会话" : "项目",
        items: groupItems
      });
    });

    return sections;
  }, [paletteScope, recentCommandRank, visibleCommandItems]);

  function executeCommandAt(index: number): void {
    const selectedCommand = visibleCommandItems[index];
    if (!selectedCommand) {
      return;
    }

    markCommandAsRecent(selectedCommand.id);
    selectedCommand.execute();
    closeCommandPalette();
  }

  useEffect(() => {
    setPinnedSessionIds(readStoredIds(pinnedSessionStorageKey));
    setRecentCommandIds(readStoredIds(recentCommandStorageKey));
  }, [pinnedSessionStorageKey, recentCommandStorageKey]);

  useEffect(() => {
    setPinnedSessionIds((current) => {
      const next = current.filter((sessionId) => validSessionIdSet.has(sessionId));
      if (next.length === current.length && next.every((sessionId, index) => sessionId === current[index])) {
        return current;
      }

      return next;
    });
  }, [validSessionIdSet]);

  useEffect(() => {
    persistIds(pinnedSessionStorageKey, pinnedSessionIds);
  }, [pinnedSessionIds, pinnedSessionStorageKey]);

  useEffect(() => {
    persistIds(recentCommandStorageKey, recentCommandIds);
  }, [recentCommandIds, recentCommandStorageKey]);

  useEffect(() => {
    if (!paletteOpen) {
      return;
    }

    commandInputRef.current?.focus();
  }, [paletteOpen]);

  useEffect(() => {
    if (activeCommandIndex < visibleCommandItems.length) {
      return;
    }

    setActiveCommandIndex(0);
  }, [activeCommandIndex, visibleCommandItems.length]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette(event.shiftKey ? "session" : "all");
        return;
      }

      if (event.key === "Escape" && paletteOpen) {
        event.preventDefault();
        closeCommandPalette();
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        navigate(buildWorkbenchPath("chat"));
        return;
      }

      if (event.key === "2") {
        event.preventDefault();
        navigate(buildWorkbenchPath("terminal"));
        return;
      }

      if (event.key === "3") {
        event.preventDefault();
        navigate(buildWorkbenchPath("files"));
        return;
      }

      if (event.key === "4") {
        event.preventDefault();
        navigate(buildWorkbenchPath("git"));
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [navigate, paletteOpen, projectId, selectedSessionId]);

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-hero">
          <div className="hero-badge-row">
            <span className="hero-tag brand">RelayDesk</span>
            <span className="hero-tag automation">项目工作台</span>
          </div>
          <div className="sidebar-header">
            <div className="eyebrow">项目控制台</div>
            <h2>{projectName}</h2>
            <p className="muted">{user.email}</p>
          </div>
        </div>

        <nav className="sidebar-section project-nav">
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="home">
            首页
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} end to="chat">
            协作
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="agent">
            替身 Agent
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="tasks">
            任务
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="plugins">
            插件
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="settings">
            设置与 MCP
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="tools">
            工作区工具
          </NavLink>
        </nav>

        <div className="sidebar-section sidebar-context">
          <div className="eyebrow">工作区路径</div>
          <p className="muted sidebar-path">{projectRootPath || "加载中..."}</p>
        </div>

        <div className="sidebar-footer">
          <Link className="secondary-button compact" to="/projects">
            返回项目列表
          </Link>
        </div>
      </aside>

      <main className="workspace-main">
        <section className="workspace-banner">
          <div className="workspace-banner-main">
            <div className="eyebrow">当前工作区</div>
            <div className="workspace-banner-title-row">
              <h1>{projectName}</h1>
              <div className={`connection-pill state-${realtimeState}`}>
                {getConnectionStatusLabel(realtimeState)}
              </div>
            </div>
            <p className="hero-lead">{projectRootPath || "正在读取项目根路径..."}</p>
          </div>

          <div className="workspace-banner-summary">
            <article className="workspace-banner-item">
              <span>工作区准备度</span>
              <strong>{loadingProject ? "正在准备项目上下文" : "已可直接进入会话、替身与工具"}</strong>
              <p>{loadingProject ? "正在连通会话、替身状态和工作区工具。" : "现在可以从左侧模块直接继续推进，无需再做额外准备。"}</p>
            </article>
          </div>
        </section>
        <div className="workbench-top-strip">
          <nav aria-label="工作台主导航" className="workbench-top-nav">
            <NavLink className={({ isActive }) => (isActive ? "workbench-top-link active" : "workbench-top-link")} to={buildWorkbenchPath("chat")}>
              <span>Chat</span>
              <kbd>⌘1</kbd>
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? "workbench-top-link active" : "workbench-top-link")} to={buildWorkbenchPath("terminal")}>
              <span>Shell</span>
              <kbd>⌘2</kbd>
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? "workbench-top-link active" : "workbench-top-link")} to={buildWorkbenchPath("files")}>
              <span>Files</span>
              <kbd>⌘3</kbd>
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? "workbench-top-link active" : "workbench-top-link")} to={buildWorkbenchPath("git")}>
              <span>Source Control</span>
              <kbd>⌘4</kbd>
            </NavLink>
          </nav>
          <button className="secondary-button compact workbench-command-button" onClick={() => openCommandPalette("all")} type="button">
            <span>命令面板</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <section className="workbench-recent-strip">
          <div className="eyebrow">最近会话</div>
          {pinnedSessions.length > 0 ? (
            <section className="workbench-recent-group">
              <div className="workbench-recent-group-label">固定会话</div>
              <div className="workbench-recent-list">
                {pinnedSessions.map((session) => (
                  <article
                    className={session.id === selectedSessionId ? "workbench-recent-chip active" : "workbench-recent-chip"}
                    key={session.id}
                  >
                    <button
                      className="workbench-recent-open"
                      onClick={() => {
                        markCommandAsRecent(`session-${session.id}`);
                        openSessionInChat(session.id);
                      }}
                      type="button"
                    >
                      <strong>{session.title}</strong>
                      <span>{session.provider}</span>
                    </button>
                    <button
                      aria-label={`取消固定会话 ${session.title}`}
                      className="workbench-recent-pin active"
                      onClick={() => togglePinnedSession(session.id)}
                      type="button"
                    >
                      已固定
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="workbench-recent-group">
            <div className="workbench-recent-group-label">{pinnedSessions.length > 0 ? "最近更新" : "最近会话"}</div>
            <div className="workbench-recent-list">
              {pinnedSessions.length === 0 && recentSessions.length === 0 ? (
                <span className="muted">当前项目还没有会话，先在协作页创建一条。</span>
              ) : null}
              {pinnedSessions.length > 0 && recentSessions.length === 0 ? (
                <span className="muted">暂时没有新的最近会话。</span>
              ) : null}
              {recentSessions.map((session) => (
                <article
                  className={session.id === selectedSessionId ? "workbench-recent-chip active" : "workbench-recent-chip"}
                  key={session.id}
                >
                  <button
                    className="workbench-recent-open"
                    onClick={() => {
                      markCommandAsRecent(`session-${session.id}`);
                      openSessionInChat(session.id);
                    }}
                    type="button"
                  >
                    <strong>{session.title}</strong>
                    <span>{session.provider}</span>
                  </button>
                  <button
                    aria-label={`固定会话 ${session.title}`}
                    className="workbench-recent-pin"
                    onClick={() => togglePinnedSession(session.id)}
                    type="button"
                  >
                    固定
                  </button>
                </article>
              ))}
            </div>
          </section>
        </section>

        {loadingProject ? (
          <section className="panel workspace-loading-panel">
            <div className="eyebrow">项目加载中</div>
            <h3>正在准备项目上下文</h3>
            <p className="muted">会话、替身状态和工具工作区即将就绪。</p>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
      {paletteOpen ? (
        <div
          aria-modal="true"
          className="command-palette-backdrop"
          onClick={closeCommandPalette}
          role="dialog"
        >
          <section className="command-palette" onClick={(event) => event.stopPropagation()}>
            <header className="command-palette-header">
              <strong>命令面板</strong>
              <span className="muted">输入关键词快速切换项目、会话和工具，会话支持固定置顶与最近执行</span>
            </header>
            <div className="command-palette-scope-switch" role="tablist" aria-label="命令面板范围">
              <button
                aria-selected={paletteScope === "all"}
                className={paletteScope === "all" ? "command-palette-scope active" : "command-palette-scope"}
                onClick={() => {
                  setPaletteScope("all");
                  setActiveCommandIndex(0);
                }}
                role="tab"
                type="button"
              >
                全部命令
              </button>
              <button
                aria-selected={paletteScope === "session"}
                className={paletteScope === "session" ? "command-palette-scope active" : "command-palette-scope"}
                onClick={() => {
                  setPaletteScope("session");
                  setActiveCommandIndex(0);
                }}
                role="tab"
                type="button"
              >
                会话命令
              </button>
            </div>
            <input
              className="command-palette-input"
              onChange={(event) => {
                setPaletteQuery(event.target.value);
                setActiveCommandIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveCommandIndex((current) =>
                    visibleCommandItems.length === 0 ? 0 : (current + 1) % visibleCommandItems.length
                  );
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveCommandIndex((current) =>
                    visibleCommandItems.length === 0
                      ? 0
                      : (current - 1 + visibleCommandItems.length) % visibleCommandItems.length
                  );
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  executeCommandAt(activeCommandIndex);
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  closeCommandPalette();
                }
              }}
              placeholder={
                paletteScope === "session" ? "例如：会话标题、claude、codex、CLI 导入..." : "例如：chat、shell、会话标题、切换项目..."
              }
              ref={commandInputRef}
              type="text"
              value={paletteQuery}
            />
            <div className="command-palette-tip">↑↓ 选择 · Enter 执行 · ⌘K 全部命令 · ⌘⇧K 会话命令</div>
            <div className="command-palette-list">
              {visibleCommandItems.length === 0 ? <p className="muted">没有匹配项，试试其它关键词。</p> : null}
              {commandSections.map((section) => (
                <section className="command-palette-section" key={section.id}>
                  <div className="command-palette-section-title">{section.title}</div>
                  <div className="command-palette-section-list">
                    {section.items.map((item) => {
                      const itemIndex = commandIndexById.get(item.id);
                      if (typeof itemIndex !== "number") {
                        return null;
                      }

                      const sessionId = item.sessionId;
                      const isPinned = sessionId ? pinnedSessionIdSet.has(sessionId) : false;

                      return (
                        <article
                          className={[
                            "command-palette-item",
                            itemIndex === activeCommandIndex ? "active" : "",
                            sessionId ? "with-pin" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={item.id}
                        >
                          <button className="command-palette-item-main" onClick={() => executeCommandAt(itemIndex)} type="button">
                            <span className="command-palette-item-title">{item.title}</span>
                            <span className="command-palette-item-subtitle">{item.subtitle}</span>
                            <span className="command-palette-item-group">{getGroupLabel(item.group)}</span>
                          </button>
                          {sessionId ? (
                            <button
                              className={isPinned ? "command-palette-pin active" : "command-palette-pin"}
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePinnedSession(sessionId);
                              }}
                              type="button"
                            >
                              {isPinned ? "已固定" : "固定"}
                            </button>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
