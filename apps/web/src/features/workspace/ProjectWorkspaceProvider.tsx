import { createContext, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import type { ApprovalRecord, RealtimeEvent, RunRecord, SessionRecord } from "@shared";
import { api, authStorage } from "../../lib/api";
import type { RealtimeClient, RealtimeConnectionState } from "../../lib/ws";
import { useProjectBootstrap } from "./useProjectBootstrap";
import { useProjectRealtime } from "./useProjectRealtime";

export interface ProjectWorkspaceContextValue {
  projectId: string;
  token: string | null;
  projectName: string;
  projectRootPath: string;
  sessions: SessionRecord[];
  selectedSessionId: string;
  selectedSession: SessionRecord | null;
  newSessionProvider: SessionRecord["provider"];
  activeRun: RunRecord | null;
  latestRun: RunRecord | null;
  pendingApprovals: ApprovalRecord[];
  realtimeState: RealtimeConnectionState;
  reconnectVersion: number;
  wsClient: RealtimeClient | null;
  lastRealtimeEvent: RealtimeEvent | null;
  loadingProject: boolean;
  workspaceError: string | null;
  setNewSessionProvider(provider: SessionRecord["provider"]): void;
  selectSession(sessionId: string): void;
  clearWorkspaceError(): void;
  createSession(): Promise<void>;
  startRun(input: { objective: string; constraints: string }): Promise<void>;
  stopRun(): Promise<void>;
  takeoverRun(): Promise<void>;
  resumeRun(): Promise<void>;
  approveApproval(approvalId: string): Promise<void>;
  rejectApproval(approvalId: string): Promise<void>;
  handleRunCreated(run: RunRecord | null, approval: ApprovalRecord | null): void;
  handleRunRestored(run: RunRecord | null, approval: ApprovalRecord | null): void;
}

export const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | null>(null);

export function ProjectWorkspaceProvider({
  children
}: {
  children: ReactNode;
}): JSX.Element {
  const { projectId = "" } = useParams();
  const token = authStorage.getToken();
  const [newSessionProvider, setNewSessionProvider] = useState<SessionRecord["provider"]>("mock");
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const {
    projectName,
    projectRootPath,
    sessions,
    selectedSessionId,
    selectedSession,
    activeRun,
    latestRun,
    pendingApprovals,
    loadingProject,
    workspaceError,
    setSessions,
    setSelectedSessionId,
    setWorkspaceError,
    clearWorkspaceError,
    applyRunUpdate,
    handleApprovalUpdate
  } = useProjectBootstrap({
    projectId,
    refreshVersion: reconnectVersion,
    token
  });
  const { realtimeState, wsClient, lastRealtimeEvent } = useProjectRealtime({
    projectId,
    token,
    onReconnect: () => setReconnectVersion((current) => current + 1),
    onRunUpdated: applyRunUpdate,
    onApprovalUpdated: handleApprovalUpdate
  });

  function setActiveApproval(approval: ApprovalRecord | null): void {
    if (approval) {
      handleApprovalUpdate(approval);
    }
  }

  function updateActiveRun(run: RunRecord | null): void {
    if (run) {
      applyRunUpdate(run);
    }
  }

  async function createSession(): Promise<void> {
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
      setWorkspaceError(null);
    } catch (createError) {
      setWorkspaceError(createError instanceof Error ? createError.message : "创建会话失败");
    }
  }

  async function startRun(input: {
    objective: string;
    constraints: string;
  }): Promise<void> {
    if (!token || !projectId || !selectedSessionId) {
      return;
    }

    try {
      const response = await api.startRun(token, projectId, {
        sessionId: selectedSessionId,
        objective: input.objective,
        constraints: input.constraints
      });
      applyRunUpdate(response.run);
      setActiveApproval(response.approval ?? null);
      setWorkspaceError(null);
    } catch (runError) {
      setWorkspaceError(runError instanceof Error ? runError.message : "启动替身失败");
    }
  }

  async function stopRun(): Promise<void> {
    if (!token || !activeRun) {
      return;
    }

    try {
      await api.stopRun(token, activeRun.id);
      setWorkspaceError(null);
    } catch (runError) {
      setWorkspaceError(runError instanceof Error ? runError.message : "停止替身失败");
    }
  }

  async function takeoverRun(): Promise<void> {
    if (!token || !activeRun) {
      return;
    }

    try {
      const response = await api.takeoverRun(token, activeRun.id);
      updateActiveRun(response.run ?? null);
      setWorkspaceError(null);
    } catch (runError) {
      setWorkspaceError(runError instanceof Error ? runError.message : "人工接管失败");
    }
  }

  async function resumeRun(): Promise<void> {
    if (!token || !activeRun) {
      return;
    }

    try {
      const response = await api.resumeRun(token, activeRun.id);
      updateActiveRun(response.run ?? null);
      setActiveApproval(response.approval ?? null);
      setWorkspaceError(null);
    } catch (runError) {
      setWorkspaceError(runError instanceof Error ? runError.message : "恢复替身失败");
    }
  }

  async function approveApproval(approvalId: string): Promise<void> {
    if (!token) {
      return;
    }

    try {
      const response = await api.approveApproval(token, approvalId);
      setActiveApproval(response.approval ?? null);
      updateActiveRun(response.run ?? null);
      setWorkspaceError(null);
    } catch (approvalError) {
      setWorkspaceError(approvalError instanceof Error ? approvalError.message : "审批失败");
    }
  }

  async function rejectApproval(approvalId: string): Promise<void> {
    if (!token) {
      return;
    }

    try {
      const response = await api.rejectApproval(token, approvalId);
      setActiveApproval(response.approval ?? null);
      updateActiveRun(response.run ?? null);
      setWorkspaceError(null);
    } catch (approvalError) {
      setWorkspaceError(approvalError instanceof Error ? approvalError.message : "拒绝审批失败");
    }
  }

  function handleRunRestored(run: RunRecord | null, approval: ApprovalRecord | null): void {
    updateActiveRun(run);
    setActiveApproval(approval);
  }

  function handleRunCreated(run: RunRecord | null, approval: ApprovalRecord | null): void {
    updateActiveRun(run);
    setActiveApproval(approval);
  }

  return (
    <ProjectWorkspaceContext.Provider
      value={{
        projectId,
        token,
        projectName,
        projectRootPath,
        sessions,
        selectedSessionId,
        selectedSession,
        newSessionProvider,
        activeRun,
        latestRun,
        pendingApprovals,
        realtimeState,
        reconnectVersion,
        wsClient,
        lastRealtimeEvent,
        loadingProject,
        workspaceError,
        setNewSessionProvider,
        selectSession: setSelectedSessionId,
        clearWorkspaceError,
        createSession,
        startRun,
        stopRun,
        takeoverRun,
        resumeRun,
        approveApproval,
        rejectApproval,
        handleRunCreated,
        handleRunRestored
      }}
    >
      {children}
    </ProjectWorkspaceContext.Provider>
  );
}
