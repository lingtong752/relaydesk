import { useEffect, useMemo, useRef, useState } from "react";
import type { TerminalSessionRecord } from "@shared";
import { api } from "../../../../lib/api";
import { connectTerminal, type TerminalClient, type TerminalEvent } from "../../../../lib/terminal";
import { normalizeTerminalOutput } from "../../../../lib/terminalOutput";

interface TerminalWorkspaceProps {
  projectId: string;
  rootPath: string;
  token: string;
}

type TerminalTabStatus = "idle" | "connecting" | "connected" | "exited";

interface TerminalTabState {
  session: TerminalSessionRecord;
  client: TerminalClient | null;
  output: string;
  command: string;
  status: TerminalTabStatus;
  error: string | null;
}

function getTerminalStatusText(status: TerminalTabStatus): string {
  if (status === "connecting") {
    return "连接中";
  }

  if (status === "connected") {
    return "已连接";
  }

  if (status === "exited") {
    return "已退出";
  }

  return "待连接";
}

export function TerminalWorkspace({
  projectId,
  rootPath,
  token
}: TerminalWorkspaceProps): JSX.Element {
  const [sessions, setSessions] = useState<TerminalTabState[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [action, setAction] = useState<"creating" | "refreshing" | "closing" | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const sessionsRef = useRef<TerminalTabState[]>([]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );

  const statusLabel = useMemo(() => {
    return selectedSession ? getTerminalStatusText(selectedSession.status) : "未连接";
  }, [selectedSession]);

  const renderedOutput = useMemo(() => {
    if (!selectedSession) {
      return "选择或新建一个终端 Tab。";
    }

    const normalized = normalizeTerminalOutput(selectedSession.output);
    return normalized || "终端输出会显示在这里。";
  }, [selectedSession]);

  const selectedSessionLabel = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    const shellName = selectedSession.session.shell.split("/").at(-1) ?? "shell";
    return `${shellName} · ${new Date(selectedSession.session.createdAt).toLocaleTimeString()}`;
  }, [selectedSession]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!outputRef.current) {
      return;
    }

    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [selectedSession?.output]);

  useEffect(() => {
    return () => {
      for (const session of sessionsRef.current) {
        session.client?.close();
      }
    };
  }, []);

  useEffect(() => {
    for (const session of sessionsRef.current) {
      session.client?.close();
    }
    setSessions([]);
    setSelectedSessionId("");
    setWorkspaceError(null);
    void loadSessions(true);
  }, [projectId, token]);

  async function loadSessions(autoSelect = false): Promise<void> {
    setLoadingSessions(true);
    try {
      const response = await api.listTerminalSessions(token, projectId);
      setSessions((current) => {
        for (const session of current) {
          if (!response.sessions.some((entry) => entry.id === session.session.id)) {
            session.client?.close();
          }
        }

        return response.sessions.map((session) => {
          const existing = current.find((entry) => entry.session.id === session.id);
          return {
            session,
            client: existing?.client ?? null,
            output: existing?.output ?? "",
            command: existing?.command ?? "",
            status: existing?.status ?? "idle",
            error: existing?.error ?? null
          };
        });
      });
      setSelectedSessionId((current) => {
        if (current && response.sessions.some((session) => session.id === current)) {
          return current;
        }

        if (autoSelect) {
          return response.sessions[0]?.id ?? "";
        }

        return response.sessions[0]?.id ?? current;
      });
      setWorkspaceError(null);
    } catch (requestError) {
      setWorkspaceError(requestError instanceof Error ? requestError.message : "读取终端会话失败");
    } finally {
      setLoadingSessions(false);
    }
  }

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    void ensureConnected(selectedSessionId);
  }, [selectedSessionId, sessions]);

  function updateSessionState(
    sessionId: string,
    updater: (current: TerminalTabState) => TerminalTabState
  ): void {
    setSessions((current) =>
      current.map((session) =>
        session.session.id === sessionId ? updater(session) : session
      )
    );
  }

  async function ensureConnected(sessionId: string): Promise<void> {
    const currentSession = sessionsRef.current.find((session) => session.session.id === sessionId);
    if (!currentSession || currentSession.client || currentSession.status === "connecting") {
      return;
    }

    updateSessionState(sessionId, (session) => ({
      ...session,
      status: "connecting",
      error: null
    }));

    try {
      const client = connectTerminal({
        token,
        sessionId,
        onEvent: (event: TerminalEvent) => {
          if (event.type === "terminal.ready") {
            updateSessionState(sessionId, (session) => ({
              ...session,
              session: event.payload.session,
              output: event.payload.backlog,
              status: "connected",
              error: null
            }));
            return;
          }

          if (event.type === "terminal.output") {
            updateSessionState(sessionId, (session) => ({
              ...session,
              output: `${session.output}${event.payload.data}`
            }));
            return;
          }

          if (event.type === "terminal.exit") {
            updateSessionState(sessionId, (session) => ({
              ...session,
              client: null,
              status: "exited",
              output: `${session.output}\n\n[terminal exited] code=${event.payload.exitCode} signal=${event.payload.signal ?? "none"}\n`
            }));
            return;
          }

          if (event.type === "terminal.error") {
            updateSessionState(sessionId, (session) => ({
              ...session,
              error: event.payload.message
            }));
          }
        }
      });

      client.resize(120, 32);
      updateSessionState(sessionId, (session) => ({
        ...session,
        client,
        status: "connecting",
        error: null
      }));
    } catch (requestError) {
      updateSessionState(sessionId, (session) => ({
        ...session,
        client: null,
        status: "idle",
        error: requestError instanceof Error ? requestError.message : "连接终端失败"
      }));
    }
  }

  async function handleCreateSession(): Promise<void> {
    setAction("creating");
    try {
      const response = await api.createTerminalSession(token, projectId);
      setSessions((current) => [
        {
          session: response.session,
          client: null,
          output: "",
          command: "",
          status: "idle",
          error: null
        },
        ...current
      ]);
      setSelectedSessionId(response.session.id);
      setWorkspaceError(null);
      await ensureConnected(response.session.id);
    } catch (requestError) {
      setWorkspaceError(requestError instanceof Error ? requestError.message : "创建终端失败");
    } finally {
      setAction(null);
    }
  }

  async function handleRefreshSessions(): Promise<void> {
    setAction("refreshing");
    try {
      await loadSessions(true);
    } finally {
      setAction(null);
    }
  }

  async function handleReconnectSession(): Promise<void> {
    if (!selectedSession) {
      return;
    }

    selectedSession.client?.close();
    updateSessionState(selectedSession.session.id, (session) => ({
      ...session,
      client: null,
      status: "idle",
      error: null
    }));
    await ensureConnected(selectedSession.session.id);
  }

  async function handleCloseSession(sessionId: string): Promise<void> {
    const existing = sessionsRef.current.find((session) => session.session.id === sessionId);
    if (!existing) {
      return;
    }

    setAction("closing");
    try {
      await api.closeTerminalSession(token, projectId, sessionId);
      existing.client?.close();
      setSessions((current) => current.filter((session) => session.session.id !== sessionId));
      setSelectedSessionId((current) => {
        if (current !== sessionId) {
          return current;
        }

        return (
          sessionsRef.current.find((session) => session.session.id !== sessionId)?.session.id ?? ""
        );
      });
      setWorkspaceError(null);
    } catch (requestError) {
      setWorkspaceError(requestError instanceof Error ? requestError.message : "关闭终端失败");
    } finally {
      setAction(null);
    }
  }

  function handleSendCommand(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selectedSession?.client || !selectedSession.command.trim()) {
      return;
    }

    selectedSession.client.sendInput(`${selectedSession.command}\n`);
    updateSessionState(selectedSession.session.id, (session) => ({
      ...session,
      command: ""
    }));
  }

  function handleCtrlC(): void {
    selectedSession?.client?.sendInput("\u0003");
  }

  return (
    <section className="terminal-panel">
      <div className="terminal-toolbar">
        <div className="terminal-toolbar-main">
          <div className="eyebrow">终端工作台</div>
          <div className="terminal-toolbar-title-row">
            <h3>{statusLabel}</h3>
            {selectedSession ? (
              <span className={`terminal-status-pill status-${selectedSession.status}`}>
                {getTerminalStatusText(selectedSession.status)}
              </span>
            ) : null}
          </div>
          <p className="muted terminal-toolbar-path">{selectedSession?.session.cwd ?? rootPath}</p>
          {selectedSessionLabel ? (
            <div className="terminal-toolbar-meta">
              <span>{selectedSessionLabel}</span>
              <span>{sessions.length} 个会话</span>
            </div>
          ) : null}
        </div>

        <div className="terminal-actions" role="toolbar" aria-label="终端操作">
          <button
            className="secondary-button compact"
            disabled={!selectedSession}
            onClick={() => {
              if (!selectedSession) {
                return;
              }

              updateSessionState(selectedSession.session.id, (session) => ({
                ...session,
                output: ""
              }));
            }}
            type="button"
          >
            清屏
          </button>
          <button
            className="secondary-button compact"
            disabled={!selectedSession?.client}
            onClick={handleCtrlC}
            type="button"
          >
            Ctrl+C
          </button>
          <button
            className="secondary-button compact"
            disabled={!selectedSession || action !== null}
            onClick={() => void handleReconnectSession()}
            type="button"
          >
            重连
          </button>
          <button
            className="secondary-button compact"
            disabled={!selectedSession || action !== null}
            onClick={() => {
              if (!selectedSession) {
                return;
              }

              void handleCloseSession(selectedSession.session.id);
            }}
            type="button"
          >
            {action === "closing" ? "关闭中..." : "关闭"}
          </button>
          <button
            className="secondary-button compact"
            disabled={action !== null}
            onClick={() => void handleRefreshSessions()}
            type="button"
          >
            {action === "refreshing" ? "刷新中..." : "刷新"}
          </button>
          <button className="primary-button compact" disabled={action !== null} onClick={() => void handleCreateSession()} type="button">
            {action === "creating" ? "创建中..." : "新建 Tab"}
          </button>
        </div>
      </div>

      {workspaceError ? <div className="error-box">{workspaceError}</div> : null}
      {selectedSession?.error ? <div className="error-box">{selectedSession.error}</div> : null}

      {sessions.length === 0 ? (
        <div className="info-box">
          {loadingSessions ? "正在读取终端会话..." : "当前还没有终端会话，先新建一个 Tab。"}
        </div>
      ) : sessions.length > 1 ? (
        <div className="terminal-tabs" role="tablist" aria-label="终端会话">
          {sessions.map((session) => (
            <button
              className={session.session.id === selectedSessionId ? "terminal-tab active" : "terminal-tab"}
              key={session.session.id}
              onClick={() => setSelectedSessionId(session.session.id)}
              type="button"
            >
              <strong>{session.session.shell.split("/").at(-1) ?? "shell"}</strong>
              <span className="terminal-tab-meta">
                {new Date(session.session.createdAt).toLocaleTimeString()} · {getTerminalStatusText(session.status)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <pre className="terminal-output" ref={outputRef}>
        {renderedOutput}
      </pre>

      <form className="terminal-form" onSubmit={handleSendCommand}>
        <input
          disabled={!selectedSession?.client}
          onChange={(event) => {
            if (!selectedSession) {
              return;
            }

            updateSessionState(selectedSession.session.id, (session) => ({
              ...session,
              command: event.target.value
            }));
          }}
          placeholder={selectedSession?.client ? "输入命令并回车" : "先连接或选中一个终端 Tab"}
          value={selectedSession?.command ?? ""}
        />
        <button
          className="primary-button"
          disabled={!selectedSession?.client || !selectedSession.command.trim()}
          type="submit"
        >
          发送命令
        </button>
      </form>
    </section>
  );
}
