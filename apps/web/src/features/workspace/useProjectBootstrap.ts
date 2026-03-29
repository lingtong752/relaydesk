import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ApprovalRecord, RunRecord, SessionRecord } from "@shared";
import { api } from "../../lib/api";

function mergePendingApprovals(
  current: ApprovalRecord[],
  incoming: ApprovalRecord
): ApprovalRecord[] {
  const withoutIncoming = current.filter((item) => item.id !== incoming.id);
  if (incoming.status !== "pending") {
    return withoutIncoming;
  }

  return [incoming, ...withoutIncoming].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

interface UseProjectBootstrapOptions {
  projectId: string;
  refreshVersion: number;
  token: string | null;
}

export interface ProjectBootstrapState {
  projectName: string;
  projectRootPath: string;
  sessions: SessionRecord[];
  selectedSessionId: string;
  selectedSession: SessionRecord | null;
  activeRun: RunRecord | null;
  latestRun: RunRecord | null;
  pendingApprovals: ApprovalRecord[];
  loadingProject: boolean;
  workspaceError: string | null;
  setSessions: Dispatch<SetStateAction<SessionRecord[]>>;
  setSelectedSessionId: Dispatch<SetStateAction<string>>;
  setWorkspaceError: Dispatch<SetStateAction<string | null>>;
  clearWorkspaceError(): void;
  applyRunUpdate(run: RunRecord | null): void;
  handleApprovalUpdate(approval: ApprovalRecord): void;
}

export function useProjectBootstrap({
  projectId,
  refreshVersion,
  token
}: UseProjectBootstrapOptions): ProjectBootstrapState {
  const [projectName, setProjectName] = useState("项目控制台");
  const [projectRootPath, setProjectRootPath] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [activeRun, setActiveRun] = useState<RunRecord | null>(null);
  const [latestRun, setLatestRun] = useState<RunRecord | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRecord[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );

  function clearWorkspaceError(): void {
    setWorkspaceError(null);
  }

  function applyRunUpdate(run: RunRecord | null): void {
    if (!run) {
      setActiveRun(null);
      return;
    }

    setLatestRun(run);
    setActiveRun(["running", "waiting_human", "paused"].includes(run.status) ? run : null);
  }

  function handleApprovalUpdate(approval: ApprovalRecord): void {
    setPendingApprovals((current) => mergePendingApprovals(current, approval));
  }

  useEffect(() => {
    if (!token || !projectId) {
      setProjectName("项目控制台");
      setProjectRootPath("");
      setSessions([]);
      setSelectedSessionId("");
      setActiveRun(null);
      setLatestRun(null);
      setPendingApprovals([]);
      setWorkspaceError(null);
      setLoadingProject(false);
      return;
    }

    let cancelled = false;
    setLoadingProject(true);
    setWorkspaceError(null);
    setProjectName("项目控制台");
    setProjectRootPath("");
    setSessions([]);
    setSelectedSessionId("");
    setActiveRun(null);
    setLatestRun(null);
    setPendingApprovals([]);

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
        setLatestRun(response.latestRun ?? response.activeRun);
        setPendingApprovals(response.pendingApprovals);
        setSelectedSessionId((current) => {
          if (current && response.sessions.some((session) => session.id === current)) {
            return current;
          }

          return response.sessions[0]?.id ?? "";
        });
        setWorkspaceError(null);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setWorkspaceError(requestError instanceof Error ? requestError.message : "加载项目失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProject(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshVersion, token]);

  return {
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
  };
}
