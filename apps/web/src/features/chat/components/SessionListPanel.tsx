import type { SessionRecord } from "@shared";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";

interface SessionListPanelProps {
  creatingSession: boolean;
  newSessionProvider: SessionRecord["provider"];
  selectedSessionId: string;
  sessions: SessionRecord[];
  sessionCountLabel: string;
  onCreateSession(): void;
  onProviderChange(provider: SessionRecord["provider"]): void;
  onSelectSession(sessionId: string): void;
}

export function SessionListPanel({
  creatingSession,
  newSessionProvider,
  selectedSessionId,
  sessions,
  sessionCountLabel,
  onCreateSession,
  onProviderChange,
  onSelectSession
}: SessionListPanelProps): JSX.Element {
  function getImportedCliLabel(session: SessionRecord): string {
    if (session.origin !== "imported_cli") {
      return "";
    }

    return ["claude", "codex", "gemini"].includes(session.provider)
      ? "CLI 历史会话 · 可继续发送"
      : "CLI 历史会话 · 只读";
  }

  return (
    <section className="panel">
      <SectionHeader
        actions={
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
        }
        description={sessionCountLabel}
        eyebrow="会话"
        title="当前项目的协作上下文"
      />

      <div className="session-list">
        {sessions.length === 0 ? <EmptyState message="还没有会话，先新建一个。" /> : null}
        {sessions.map((session) => (
          <button
            className={session.id === selectedSessionId ? "session-item active" : "session-item"}
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            type="button"
          >
            <strong>{session.title}</strong>
            <span>{session.provider}</span>
            {session.origin === "imported_cli" ? (
              <span className="session-item-meta">{getImportedCliLabel(session)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
