import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionRecord, TerminalSessionRecord } from "@shared";
import { api } from "../../../../lib/api";
import {
  getSessionResumeStatusLabel,
  getSessionStatusLabel
} from "../../../../lib/sessionRuntime";
import { connectTerminal, type TerminalClient, type TerminalEvent } from "../../../../lib/terminal";
import { normalizeTerminalOutput } from "../../../../lib/terminalOutput";

interface TerminalWorkspaceProps {
  focusSourceSessionId?: string;
  projectId: string;
  rootPath: string;
  token: string;
  workspaceSessions: SessionRecord[];
  onOpenBoundSession?(sessionId: string): void;
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

function getSourceSessionRuntimeLabel(
  sourceSession: TerminalSessionRecord["sourceSession"]
): string {
  if (!sourceSession) {
    return "项目终端";
  }

  return sourceSession.origin === "imported_cli" ? "原生 CLI session" : "RelayDesk 托管会话";
}

function getTerminalBackendLabel(session: TerminalSessionRecord): string {
  if (session.backendType === "provider_cli") {
    return session.attachMode === "resume_bridge" ? "Provider CLI 桥接 (半双工)" : "Provider CLI";
  }

  return "项目 shell";
}

function getTerminalCapabilityLabel(session: TerminalSessionRecord): string {
  const capabilities = [
    session.supportsInput ? "可输入" : "只读",
    session.supportsResize ? "可缩放" : "固定尺寸"
  ];
  return capabilities.join(" · ");
}

function getTerminalTabTitle(session: TerminalSessionRecord): string {
  if (session.backendType === "provider_cli" && session.attachMode === "resume_bridge") {
    return `[桥接] ${session.sourceSession?.provider ?? "CLI"}`;
  }
  return session.sourceSession?.title ?? session.shell.split("/").at(-1) ?? "shell";
}

function getTerminalTabMeta(session: TerminalSessionRecord, status: TerminalTabStatus): string {
  const createdAt = new Date(session.createdAt).toLocaleTimeString();

  if (session.sourceSession) {
    return `${session.sourceSession.provider} · ${getTerminalBackendLabel(session)} · ${getTerminalStatusText(status)}`;
  }

  return `${createdAt} · ${getTerminalBackendLabel(session)} · ${getTerminalStatusText(status)}`;
}

export function TerminalWorkspace({
  focusSourceSessionId,
  projectId,
  rootPath,
  token,
  workspaceSessions,
  onOpenBoundSession
}: TerminalWorkspaceProps): JSX.Element {
  const [sessions, setSessions] = useState<TerminalTabState[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [action, setAction] = useState<"creating" | "refreshing" | "closing" | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const sessionsRef = useRef<TerminalTabState[]>([]);
  const lastFocusedSourceSessionRef = useRef<string | null>(null);

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
    if (selectedSession.session.sourceSession) {
      return `${selectedSession.session.sourceSession.title} · ${selectedSession.session.sourceSession.provider} · ${getTerminalBackendLabel(selectedSession.session)} · ${shellName}`;
    }

    return `${shellName} · ${getTerminalBackendLabel(selectedSession.session)} · ${new Date(selectedSession.session.createdAt).toLocaleTimeString()}`;
  }, [selectedSession]);
  const boundWorkspaceSession = useMemo(() => {
    const sourceSessionId = selectedSession?.session.sourceSession?.id;
    if (!sourceSessionId) {
      return null;
    }

    return workspaceSessions.find((session) => session.id === sourceSessionId) ?? null;
  }, [selectedSession, workspaceSessions]);
  const boundWorkspaceSessionResumeLabel = useMemo(
    () => getSessionResumeStatusLabel(boundWorkspaceSession),
    [boundWorkspaceSession]
  );

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
    lastFocusedSourceSessionRef.current = null;
    void loadSessions(true);
  }, [projectId, token]);

  useEffect(() => {
    if (!focusSourceSessionId) {
      lastFocusedSourceSessionRef.current = null;
      return;
    }

    const requestKey = `${projectId}:${focusSourceSessionId}`;
    if (lastFocusedSourceSessionRef.current === requestKey) {
      return;
    }

    lastFocusedSourceSessionRef.current = requestKey;
    void handleCreateSession(focusSourceSessionId);
  }, [focusSourceSessionId, projectId]);

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

  async function handleCreateSession(sourceSessionId?: string): Promise<void> {
    setAction("creating");
    try {
      const response = await api.createTerminalSession(token, projectId, {
        ...(sourceSessionId ? { sourceSessionId } : {})
      });
      setSessions((current) => {
        const existing = current.find((session) => session.session.id === response.session.id);
        const nextEntry: TerminalTabState = {
          session: response.session,
          client: existing?.client ?? null,
          output: existing?.output ?? "",
          command: existing?.command ?? "",
          status: existing?.status ?? "idle",
          error: existing?.error ?? null
        };

        return [
          nextEntry,
          ...current.filter((session) => session.session.id !== response.session.id)
        ];
      });
      setSelectedSessionId(response.session.id);
      setWorkspaceError(null);
      await ensureConnected(response.session.id);
    } catch (requestError) {
      if (sourceSessionId) {
        lastFocusedSourceSessionRef.current = null;
      }
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
            disabled={!selectedSession?.client || !selectedSession.session.supportsInput}
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
      {selectedSession?.session.sourceSession && boundWorkspaceSession ? (
        <div className="info-box">
          当前终端已绑定到会话“{selectedSession.session.sourceSession.title}”。
          {` ${selectedSession.session.sourceSession.provider} · ${getSourceSessionRuntimeLabel(selectedSession.session.sourceSession)}。`}
          {` Terminal backend：${getTerminalBackendLabel(selectedSession.session)} · ${getTerminalCapabilityLabel(selectedSession.session)}。`}
          {` 当前状态：${getSessionStatusLabel(boundWorkspaceSession)}。`}
          {boundWorkspaceSessionResumeLabel ? ` ${boundWorkspaceSessionResumeLabel}。` : ""}
          {selectedSession.session.fallbackReason ? ` ${selectedSession.session.fallbackReason}` : ""}
          {` 你可以继续回到协作页处理这条会话。`}
          {onOpenBoundSession ? (
            <>
              {" "}
              <button
                className="secondary-button compact"
                onClick={() => onOpenBoundSession(boundWorkspaceSession.id)}
                type="button"
              >
                回到当前会话
              </button>
            </>
          ) : null}
        </div>
      ) : selectedSession?.session.sourceSession ? (
        <div className="info-box">
          当前终端已绑定到会话“{selectedSession.session.sourceSession.title}”。
          {` ${selectedSession.session.sourceSession.provider} · ${getSourceSessionRuntimeLabel(selectedSession.session.sourceSession)}。`}
          {` Terminal backend：${getTerminalBackendLabel(selectedSession.session)} · ${getTerminalCapabilityLabel(selectedSession.session)}。`}
          {selectedSession.session.fallbackReason ? ` ${selectedSession.session.fallbackReason}` : ""}
          当前工作区里的会话状态还在刷新中。
        </div>
      ) : (
        <div className="info-box">
          当前 Tab 是项目级 shell，没有绑定具体会话。
          {selectedSession ? ` 当前 backend：${getTerminalBackendLabel(selectedSession.session)}。` : ""}
        </div>
      )}

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
              <strong>{getTerminalTabTitle(session.session)}</strong>
              <span className="terminal-tab-meta">
                {getTerminalTabMeta(session.session, session.status)}
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
          disabled={!selectedSession?.client || !selectedSession.session.supportsInput}
          onChange={(event) => {
            if (!selectedSession) {
              return;
            }

            updateSessionState(selectedSession.session.id, (session) => ({
              ...session,
              command: event.target.value
            }));
          }}
          placeholder={
            !selectedSession?.client
              ? "先连接或选中一个终端 Tab"
              : selectedSession.session.supportsInput
                ? "输入命令并回车"
                : "当前 terminal backend 为只读"
          }
          value={selectedSession?.command ?? ""}
        />
        <button
          className="primary-button"
          disabled={
            !selectedSession?.client ||
            !selectedSession.session.supportsInput ||
            !selectedSession.command.trim()
          }
          type="submit"
        >
          发送命令
        </button>
      </form>
    </section>
  );
}
