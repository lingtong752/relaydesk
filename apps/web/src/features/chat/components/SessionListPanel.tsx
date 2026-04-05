import { useMemo, useState } from "react";
import type { SessionRecord } from "@shared";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import {
  getSessionCapabilities,
  getSessionOriginRuntimeLabel,
  getSessionResumeStatusLabel
} from "../../../lib/sessionRuntime";

interface SessionListPanelProps {
  creatingSession: boolean;
  newSessionProvider: SessionRecord["provider"];
  projectName: string;
  projectRootPath: string;
  selectedSessionId: string;
  sessions: SessionRecord[];
  sessionCountLabel: string;
  onCreateSession(): void;
  onOpenProjects(): void;
  onProviderChange(provider: SessionRecord["provider"]): void;
  onSelectSession(sessionId: string): void;
}

type SessionPanelTab = "projects" | "conversations";

function getSessionActivityAt(session: SessionRecord): number {
  const timestamp = Date.parse(session.lastMessageAt ?? session.updatedAt ?? session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getSelectedSessionActivityAt(sessions: SessionRecord[], selectedSessionId: string): number {
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  return selectedSession ? getSessionActivityAt(selectedSession) : 0;
}

function hasUnreadActivity(
  session: SessionRecord,
  selectedSessionId: string,
  selectedSessionActivityAt: number
): boolean {
  if (session.id === selectedSessionId) {
    return false;
  }

  return getSessionActivityAt(session) > selectedSessionActivityAt;
}

function getSessionPriority(
  session: SessionRecord,
  selectedSessionId: string,
  selectedSessionActivityAt: number
): number {
  if (session.status === "running") {
    return 3;
  }

  if (session.status === "reconnecting") {
    return 2;
  }

  if (hasUnreadActivity(session, selectedSessionId, selectedSessionActivityAt)) {
    return 1;
  }

  return 0;
}

export function SessionListPanel({
  creatingSession,
  newSessionProvider,
  projectName,
  projectRootPath,
  selectedSessionId,
  sessions,
  sessionCountLabel,
  onCreateSession,
  onOpenProjects,
  onProviderChange,
  onSelectSession
}: SessionListPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<SessionPanelTab>("conversations");
  const [keyword, setKeyword] = useState("");
  const selectedSessionActivityAt = useMemo(
    () => getSelectedSessionActivityAt(sessions, selectedSessionId),
    [sessions, selectedSessionId]
  );
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        const priorityDiff =
          getSessionPriority(right, selectedSessionId, selectedSessionActivityAt) -
          getSessionPriority(left, selectedSessionId, selectedSessionActivityAt);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return getSessionActivityAt(right) - getSessionActivityAt(left);
      }),
    [selectedSessionActivityAt, selectedSessionId, sessions]
  );
  const filteredSessions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return sortedSessions;
    }

    return sortedSessions.filter((session) =>
      `${session.title} ${session.provider} ${session.origin}`.toLowerCase().includes(normalizedKeyword)
    );
  }, [keyword, sortedSessions]);

  return (
    <section className="panel chat-session-panel">
      <div className="chat-left-tabs" role="tablist" aria-label="会话导航">
        <button
          aria-selected={activeTab === "projects"}
          className={activeTab === "projects" ? "chat-left-tab active" : "chat-left-tab"}
          onClick={() => setActiveTab("projects")}
          role="tab"
          type="button"
        >
          Projects
        </button>
        <button
          aria-selected={activeTab === "conversations"}
          className={activeTab === "conversations" ? "chat-left-tab active" : "chat-left-tab"}
          onClick={() => setActiveTab("conversations")}
          role="tab"
          type="button"
        >
          Conversations
        </button>
      </div>
      <SectionHeader
        actions={
          activeTab === "projects" ? (
            <button className="secondary-button compact" onClick={onOpenProjects} type="button">
              打开项目列表
            </button>
          ) : (
            <div className="session-create-controls">
              <select
                aria-label="选择会话 provider"
                className="session-provider-select"
                onChange={(event) => onProviderChange(event.target.value as SessionRecord["provider"])}
                value={newSessionProvider}
              >
                <option value="mock">mock</option>
                <option value="claude">claude</option>
                <option value="codex">codex</option>
                <option value="gemini">gemini</option>
              </select>
              <button className="secondary-button compact" disabled={creatingSession} onClick={onCreateSession} type="button">
                {creatingSession ? "创建中..." : "新建"}
              </button>
            </div>
          )
        }
        description={activeTab === "projects" ? "当前项目固定置顶" : sessionCountLabel}
        eyebrow={activeTab === "projects" ? "项目" : "会话"}
        title={activeTab === "projects" ? "当前项目工作区" : "当前项目的协作上下文"}
      />

      {activeTab === "projects" ? (
        <article className="chat-project-card">
          <div className="chat-project-card-head">
            <strong>{projectName}</strong>
            <span className="plugin-badge">Current</span>
          </div>
          <p className="chat-project-card-path">{projectRootPath || "正在读取项目路径..."}</p>
          <p className="chat-project-card-meta">当前项目已聚合 {sessions.length} 条会话，切到 Conversations 可直接继续。</p>
          <div className="chat-project-card-actions">
            <button className="secondary-button compact" onClick={() => setActiveTab("conversations")} type="button">
              查看会话
            </button>
            <button className="secondary-button compact" onClick={onOpenProjects} type="button">
              切换项目
            </button>
          </div>
        </article>
      ) : (
        <>
          <article className="chat-project-pinned">
            <strong>{projectName}</strong>
            <span className="muted">{projectRootPath || "正在读取项目路径..."}</span>
          </article>
          <label className="chat-session-search">
            <span className="visually-hidden">搜索会话</span>
            <input
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索会话..."
              type="search"
              value={keyword}
            />
          </label>
          <div className="session-list">
            {sessions.length === 0 ? <EmptyState message="还没有会话，先新建一个。" /> : null}
            {sessions.length > 0 && filteredSessions.length === 0 ? <EmptyState message="没有匹配的会话。" /> : null}
            {filteredSessions.map((session) => {
              const capabilities = getSessionCapabilities(session);
              const resumeLabel = getSessionResumeStatusLabel(session);
              const isRunning = session.status === "running" || session.status === "reconnecting";
              const hasUnread = hasUnreadActivity(session, selectedSessionId, selectedSessionActivityAt);

              return (
                <button
                  className={[
                    "session-item",
                    session.id === selectedSessionId ? "active" : "",
                    isRunning ? "is-running" : "",
                    hasUnread ? "has-unread" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  type="button"
                >
                  <div className="session-item-title-row">
                    <strong>{session.title}</strong>
                    <span className="session-item-signals">
                      {isRunning ? (
                        <span className="session-status-badge running">
                          {session.status === "reconnecting" ? "重连中" : "运行中"}
                        </span>
                      ) : null}
                      {hasUnread ? <span className="session-status-badge unread">新消息</span> : null}
                    </span>
                  </div>
                  <span>{session.provider}</span>
                  <span className="session-item-meta">
                    {getSessionOriginRuntimeLabel(session)} · {capabilities.canSendMessages ? "可继续发送" : "只读"}
                  </span>
                  {resumeLabel ? <span className="session-item-meta">{resumeLabel}</span> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
