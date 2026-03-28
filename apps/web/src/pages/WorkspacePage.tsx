import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  ApprovalRecord,
  AuthUser,
  MessageRecord,
  RealtimeEvent,
  RunRecord,
  SessionRecord
} from "@shared";
import { api, authStorage } from "../lib/api";
import { connectRealtime, type RealtimeClient, type RealtimeConnectionState } from "../lib/ws";
import { FileWorkspace } from "../components/FileWorkspace";
import { TerminalWorkspace } from "../components/TerminalWorkspace";
import { GitWorkspace } from "../components/GitWorkspace";

interface WorkspacePageProps {
  user: AuthUser;
}

function mergeMessages(current: MessageRecord[], incoming: MessageRecord): MessageRecord[] {
  const existing = current.find((item) => item.id === incoming.id);
  if (!existing) {
    return [...current, incoming].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  return current.map((item) => (item.id === incoming.id ? incoming : item));
}

function mergePendingApprovals(current: ApprovalRecord[], incoming: ApprovalRecord): ApprovalRecord[] {
  const withoutIncoming = current.filter((item) => item.id !== incoming.id);
  if (incoming.status !== "pending") {
    return withoutIncoming;
  }

  return [incoming, ...withoutIncoming].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function WorkspacePage({ user }: WorkspacePageProps): JSX.Element {
  const { projectId = "" } = useParams();
  const token = authStorage.getToken();
  const [projectName, setProjectName] = useState("项目控制台");
  const [projectRootPath, setProjectRootPath] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [newSessionProvider, setNewSessionProvider] = useState<SessionRecord["provider"]>("mock");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [runObjective, setRunObjective] = useState("帮我拆解当前项目的下一步开发任务");
  const [runConstraints, setRunConstraints] = useState("保守推进，遇到风险操作时停下来等待人工介入。");
  const [activeRun, setActiveRun] = useState<RunRecord | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRecord[]>([]);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [runAction, setRunAction] = useState<"stop" | "takeover" | "resume" | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>("connecting");
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wsClient, setWsClient] = useState<RealtimeClient | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  useEffect(() => {
    if (!token || !projectId) {
      return;
    }

    let cancelled = false;
    void api
      .getProjectBootstrap(token, projectId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setProjectName(response.project.name);
        setProjectRootPath(response.project.rootPath);
        setSessions(response.sessions);
        setActiveRun(response.activeRun);
        setPendingApprovals(response.pendingApprovals);
        setSelectedSessionId((current) => {
          if (current && response.sessions.some((session) => session.id === current)) {
            return current;
          }

          return response.sessions[0]?.id ?? "";
        });
        setError(null);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "加载项目失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, reconnectVersion, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const client = connectRealtime(token, {
      onEvent: (event: RealtimeEvent) => {
        if (event.type === "message.created") {
          setMessages((current) => mergeMessages(current, event.payload.message));
        }

        if (event.type === "message.delta") {
          setMessages((current) =>
            current.map((item) =>
              item.id === event.payload.messageId
                ? { ...item, content: `${item.content}${event.payload.delta}`, status: "streaming" }
                : item
            )
          );
        }

        if (event.type === "message.completed") {
          setMessages((current) => mergeMessages(current, event.payload.message));
        }

        if (event.type === "run.updated") {
          setActiveRun(event.payload.run);
        }

        if (event.type === "approval.updated") {
          setPendingApprovals((current) => mergePendingApprovals(current, event.payload.approval));
        }
      },
      onConnectionStateChange: setRealtimeState,
      onReconnect: () => setReconnectVersion((current) => current + 1)
    });

    setWsClient(client);
    return () => client.close();
  }, [token]);

  useEffect(() => {
    if (!wsClient || !projectId) {
      return;
    }

    wsClient.subscribe(`project:${projectId}`);
  }, [projectId, wsClient]);

  useEffect(() => {
    if (!token || !selectedSessionId || !wsClient) {
      return;
    }

    wsClient.subscribe(`session:${selectedSessionId}`);
    void api
      .getMessages(token, selectedSessionId)
      .then((response) => {
        setMessages(response.messages);
        setError(null);
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "加载消息失败")
      );
  }, [reconnectVersion, selectedSessionId, token, wsClient]);

  async function handleCreateSession(): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      const response = await api.createSession(token, projectId, {
        title: `会话 ${sessions.length + 1}`,
        provider: newSessionProvider
      });
      setSessions((current) => [response.session, ...current]);
      setSelectedSessionId(response.session.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建会话失败");
    }
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token || !selectedSessionId || !messageDraft.trim()) {
      return;
    }

    try {
      await api.sendMessage(token, selectedSessionId, { content: messageDraft });
      setMessageDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送失败");
    }
  }

  async function handleStopSession(): Promise<void> {
    if (!token || !selectedSessionId) {
      return;
    }

    await api.stopSession(token, selectedSessionId);
  }

  async function handleStartRun(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token || !projectId || !selectedSessionId) {
      return;
    }

    try {
      const response = await api.startRun(token, projectId, {
        sessionId: selectedSessionId,
        objective: runObjective,
        constraints: runConstraints
      });
      setActiveRun(response.run);
      if (response.approval) {
        const approval = response.approval;
        setPendingApprovals((current) => mergePendingApprovals(current, approval));
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "启动替身失败");
    }
  }

  async function handleStopRun(): Promise<void> {
    if (!token || !activeRun) {
      return;
    }

    setRunAction("stop");
    try {
      await api.stopRun(token, activeRun.id);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "停止替身失败");
    } finally {
      setRunAction(null);
    }
  }

  async function handleTakeoverRun(): Promise<void> {
    if (!token || !activeRun) {
      return;
    }

    setRunAction("takeover");
    try {
      const response = await api.takeoverRun(token, activeRun.id);
      if (response.run) {
        setActiveRun(response.run);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "人工接管失败");
    } finally {
      setRunAction(null);
    }
  }

  async function handleResumeRun(): Promise<void> {
    if (!token || !activeRun) {
      return;
    }

    setRunAction("resume");
    try {
      const response = await api.resumeRun(token, activeRun.id);
      if (response.run) {
        setActiveRun(response.run);
      }
      if (response.approval) {
        const approval = response.approval;
        setPendingApprovals((current) => mergePendingApprovals(current, approval));
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "恢复替身失败");
    } finally {
      setRunAction(null);
    }
  }

  async function handleApprove(approvalId: string): Promise<void> {
    if (!token) {
      return;
    }

    setApprovalActionId(approvalId);
    try {
      const response = await api.approveApproval(token, approvalId);
      if (response.approval) {
        const approval = response.approval;
        setPendingApprovals((current) => mergePendingApprovals(current, approval));
      }
      if (response.run) {
        setActiveRun(response.run);
      }
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "审批失败");
    } finally {
      setApprovalActionId(null);
    }
  }

  async function handleReject(approvalId: string): Promise<void> {
    if (!token) {
      return;
    }

    setApprovalActionId(approvalId);
    try {
      const response = await api.rejectApproval(token, approvalId);
      if (response.approval) {
        const approval = response.approval;
        setPendingApprovals((current) => mergePendingApprovals(current, approval));
      }
      if (response.run) {
        setActiveRun(response.run);
      }
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "拒绝审批失败");
    } finally {
      setApprovalActionId(null);
    }
  }

  const hasBlockingRun =
    activeRun !== null && ["running", "waiting_human", "paused"].includes(activeRun.status);
  const connectionStatusLabel =
    realtimeState === "connected"
      ? "实时连接正常"
      : realtimeState === "reconnecting"
        ? "正在恢复实时连接"
        : realtimeState === "connecting"
          ? "正在建立实时连接"
          : "实时连接已断开";

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="eyebrow">项目控制台</div>
          <h2>{projectName}</h2>
          <p className="muted">{user.email}</p>
        </div>

        <div className="sidebar-section">
          <div className="section-title-row">
            <h3>会话</h3>
            <div className="session-create-controls">
              <select
                aria-label="选择会话 provider"
                className="session-provider-select"
                value={newSessionProvider}
                onChange={(event) => setNewSessionProvider(event.target.value as SessionRecord["provider"])}
              >
                <option value="mock">mock</option>
                <option value="claude">claude</option>
                <option value="codex">codex</option>
              </select>
              <button className="secondary-button compact" onClick={handleCreateSession} type="button">
                新建
              </button>
            </div>
          </div>
          <div className="session-list">
            {sessions.map((session) => (
              <button
                className={session.id === selectedSessionId ? "session-item active" : "session-item"}
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                type="button"
              >
                <strong>{session.title}</strong>
                <span>{session.provider}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <Link className="secondary-button compact" to="/projects">
            返回项目列表
          </Link>
        </div>
      </aside>

      <main className="workspace-main">
        <section className="run-panel">
          <div>
            <div className="eyebrow">替身 AI Agent</div>
            <h3>{activeRun ? `当前状态：${activeRun.status}` : "当前未运行"}</h3>
            <div className={`connection-pill state-${realtimeState}`}>{connectionStatusLabel}</div>
          </div>

          <form className="run-form" onSubmit={handleStartRun}>
            <textarea
              placeholder="本轮替身目标"
              rows={3}
              value={runObjective}
              onChange={(event) => setRunObjective(event.target.value)}
            />
            <textarea
              placeholder="执行边界与约束"
              rows={2}
              value={runConstraints}
              onChange={(event) => setRunConstraints(event.target.value)}
            />
            <div className="button-row">
              <button className="primary-button" disabled={!selectedSession || hasBlockingRun} type="submit">
                启动替身
              </button>
              <button
                className="secondary-button"
                disabled={!activeRun || !["running", "waiting_human", "paused"].includes(activeRun.status)}
                onClick={handleStopRun}
                type="button"
              >
                {runAction === "stop" ? "停止中..." : "停止替身"}
              </button>
              <button
                className="secondary-button"
                disabled={!activeRun || !["running", "waiting_human"].includes(activeRun.status) || runAction !== null}
                onClick={handleTakeoverRun}
                type="button"
              >
                {runAction === "takeover" ? "接管中..." : "人工接管"}
              </button>
              <button
                className="secondary-button"
                disabled={!activeRun || activeRun.status !== "paused" || runAction !== null}
                onClick={handleResumeRun}
                type="button"
              >
                {runAction === "resume" ? "恢复中..." : "恢复替身"}
              </button>
            </div>
          </form>

          {pendingApprovals.length > 0 ? (
            <div className="approval-panel">
              <div className="section-title-row">
                <h4>待处理审批</h4>
                <span className="muted">{pendingApprovals.length} 项</span>
              </div>
              <div className="approval-list">
                {pendingApprovals.map((approval) => (
                  <article className="approval-card" key={approval.id}>
                    <header>
                      <strong>{approval.title}</strong>
                      <span>{new Date(approval.createdAt).toLocaleTimeString()}</span>
                    </header>
                    <p>{approval.reason}</p>
                    <div className="button-row">
                      <button
                        className="primary-button compact"
                        disabled={approvalActionId === approval.id}
                        onClick={() => handleApprove(approval.id)}
                        type="button"
                      >
                        批准继续
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={approvalActionId === approval.id}
                        onClick={() => handleReject(approval.id)}
                        type="button"
                      >
                        拒绝并停止
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <div className="content-grid">
          <section className="chat-panel">
            <div className="chat-header">
              <div>
                <div className="eyebrow">当前会话</div>
                <h3>{selectedSession?.title ?? "请选择会话"}</h3>
                {selectedSession ? <p className="muted">Provider: {selectedSession.provider}</p> : null}
              </div>
              <button className="secondary-button" disabled={!selectedSession} onClick={handleStopSession} type="button">
                停止当前输出
              </button>
            </div>

            {error ? <div className="error-box">{error}</div> : null}

            <div className="message-list">
              {messages.length === 0 ? <p className="muted">会话还没有消息，先发一条试试。</p> : null}
              {messages.map((message) => (
                <article className={`message-card role-${message.role}`} key={message.id}>
                  <header>
                    <strong>{message.role}</strong>
                    <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                  </header>
                  <p>{message.content || (message.status === "streaming" ? "..." : "")}</p>
                </article>
              ))}
            </div>

            <form className="chat-form" onSubmit={handleSendMessage}>
              <textarea
                placeholder="输入你要交给 Agent 的任务"
                rows={4}
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
              />
              <button className="primary-button" disabled={!selectedSession || !messageDraft.trim()} type="submit">
                发送
              </button>
            </form>
          </section>

          <div className="workspace-sidepanels">
            {token ? <FileWorkspace projectId={projectId} rootPath={projectRootPath} token={token} /> : null}
            {token ? <TerminalWorkspace projectId={projectId} rootPath={projectRootPath} token={token} /> : null}
            {token ? <GitWorkspace projectId={projectId} token={token} /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
