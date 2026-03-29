import type {
  ApprovalRecord,
  AuditEventRecord,
  DiscoveredProjectRecord,
  GitBranchRecord,
  LoginResponse,
  GitDiffRecord,
  GitRemoteRecord,
  GitStatusRecord,
  MessageRecord,
  PluginActionExecutionRecord,
  PluginCatalogRecord,
  PluginHostContextRecord,
  PluginInstallationRecord,
  ProjectTaskBoardRecord,
  ProjectSettingsUpdateInput,
  ProjectSettingsSummary,
  ProjectRecord,
  RunCheckpointRecord,
  RunRecord,
  SessionRecord,
  TerminalSessionRecord,
  WorkspaceFileContent,
  WorkspaceFileEntry
} from "@shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4010";

type HttpMethod = "GET" | "POST";

async function request<T>(
  path: string,
  options: {
    method?: HttpMethod;
    token?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem("relaydesk-token");
  },
  setToken(token: string): void {
    localStorage.setItem("relaydesk-token", token);
  },
  clear(): void {
    localStorage.removeItem("relaydesk-token");
  }
};

export const api = {
  register(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/api/auth/register", {
      method: "POST",
      body: { email, password }
    });
  },
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password }
    });
  },
  me(token: string): Promise<{ user: LoginResponse["user"] | null }> {
    return request("/api/auth/me", { token });
  },
  listProjects(token: string): Promise<{ projects: ProjectRecord[] }> {
    return request("/api/projects", { token });
  },
  listDiscoveredProjects(token: string): Promise<{ projects: DiscoveredProjectRecord[] }> {
    return request("/api/projects/discovery", { token });
  },
  createProject(token: string, body: { name: string; rootPath: string }): Promise<{ project: ProjectRecord }> {
    return request("/api/projects", { method: "POST", token, body });
  },
  getProjectBootstrap(
    token: string,
    projectId: string
  ): Promise<{
    project: ProjectRecord;
    sessions: SessionRecord[];
    activeRun: RunRecord | null;
    latestRun: RunRecord | null;
    pendingApprovals: ApprovalRecord[];
  }> {
    return request(`/api/projects/${projectId}/bootstrap`, { token });
  },
  getProjectSettings(token: string, projectId: string): Promise<{ settings: ProjectSettingsSummary }> {
    return request(`/api/projects/${projectId}/settings`, { token });
  },
  getProjectTaskBoard(token: string, projectId: string): Promise<{ board: ProjectTaskBoardRecord }> {
    return request(`/api/projects/${projectId}/tasks`, { token });
  },
  listPluginCatalog(token: string, projectId: string): Promise<{ plugins: PluginCatalogRecord[] }> {
    return request(`/api/projects/${projectId}/plugins/catalog`, { token });
  },
  listProjectPlugins(
    token: string,
    projectId: string
  ): Promise<{ installations: PluginInstallationRecord[] }> {
    return request(`/api/projects/${projectId}/plugins`, { token });
  },
  installProjectPlugin(
    token: string,
    projectId: string,
    pluginId: string
  ): Promise<{ installation: PluginInstallationRecord }> {
    return request(`/api/projects/${projectId}/plugins/install`, {
      method: "POST",
      token,
      body: { pluginId }
    });
  },
  updateProjectPluginState(
    token: string,
    projectId: string,
    pluginId: string,
    enabled: boolean
  ): Promise<{ installation: PluginInstallationRecord }> {
    return request(`/api/projects/${projectId}/plugins/${pluginId}/state`, {
      method: "POST",
      token,
      body: { enabled }
    });
  },
  getProjectPluginContext(
    token: string,
    projectId: string,
    pluginId: string
  ): Promise<{
    installation: PluginInstallationRecord;
    context: PluginHostContextRecord;
  }> {
    return request(`/api/projects/${projectId}/plugins/${pluginId}/context`, {
      token
    });
  },
  executeProjectPluginAction(
    token: string,
    projectId: string,
    pluginId: string,
    actionId: string,
    body: { inputs: Record<string, string> }
  ): Promise<{
    installation: PluginInstallationRecord;
    execution: PluginActionExecutionRecord;
  }> {
    return request(`/api/projects/${projectId}/plugins/${pluginId}/actions/${actionId}/execute`, {
      method: "POST",
      token,
      body
    });
  },
  saveProjectProviderSettings(
    token: string,
    projectId: string,
    provider: "claude" | "codex",
    body: Omit<ProjectSettingsUpdateInput, "provider">
  ): Promise<{ settings: ProjectSettingsSummary }> {
    return request(`/api/projects/${projectId}/settings/providers/${provider}`, {
      method: "POST",
      token,
      body
    });
  },
  createSession(
    token: string,
    projectId: string,
    body: { title: string; provider: SessionRecord["provider"] }
  ): Promise<{ session: SessionRecord }> {
    return request(`/api/projects/${projectId}/sessions`, {
      method: "POST",
      token,
      body
    });
  },
  getMessages(token: string, sessionId: string): Promise<{ messages: MessageRecord[] }> {
    return request(`/api/sessions/${sessionId}/messages`, { token });
  },
  sendMessage(
    token: string,
    sessionId: string,
    body: { content: string }
  ): Promise<{ message: MessageRecord }> {
    return request(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      token,
      body
    });
  },
  stopSession(token: string, sessionId: string): Promise<{ ok: boolean }> {
    return request(`/api/sessions/${sessionId}/stop`, {
      method: "POST",
      token
    });
  },
  getActiveRun(token: string, projectId: string): Promise<{ run: RunRecord | null }> {
    return request(`/api/projects/${projectId}/runs/active`, { token });
  },
  startRun(
    token: string,
    projectId: string,
    body: { sessionId: string; objective: string; constraints: string }
  ): Promise<{ run: RunRecord; approval: ApprovalRecord | null }> {
    return request(`/api/projects/${projectId}/runs`, {
      method: "POST",
      token,
      body
    });
  },
  stopRun(token: string, runId: string): Promise<{ ok: boolean }> {
    return request(`/api/runs/${runId}/stop`, {
      method: "POST",
      token
    });
  },
  takeoverRun(token: string, runId: string): Promise<{ run: RunRecord | null }> {
    return request(`/api/runs/${runId}/takeover`, {
      method: "POST",
      token
    });
  },
  resumeRun(
    token: string,
    runId: string
  ): Promise<{ run: RunRecord | null; approval: ApprovalRecord | null }> {
    return request(`/api/runs/${runId}/resume`, {
      method: "POST",
      token
    });
  },
  restoreRun(
    token: string,
    runId: string,
    body: { checkpointId?: string } = {}
  ): Promise<{
    run: RunRecord | null;
    approval: ApprovalRecord | null;
    checkpoint: RunCheckpointRecord | null;
  }> {
    return request(`/api/runs/${runId}/restore`, {
      method: "POST",
      token,
      body
    });
  },
  listRunApprovals(token: string, runId: string): Promise<{ approvals: ApprovalRecord[] }> {
    return request(`/api/runs/${runId}/approvals`, {
      token
    });
  },
  listRunAuditEvents(
    token: string,
    runId: string,
    limit = 20
  ): Promise<{ events: AuditEventRecord[] }> {
    return request(`/api/runs/${runId}/audit-events?limit=${limit}`, {
      token
    });
  },
  listRunCheckpoints(
    token: string,
    runId: string,
    limit = 20
  ): Promise<{ checkpoints: RunCheckpointRecord[] }> {
    return request(`/api/runs/${runId}/checkpoints?limit=${limit}`, {
      token
    });
  },
  approveApproval(
    token: string,
    approvalId: string,
    body: { note?: string } = {}
  ): Promise<{ approval: ApprovalRecord | null; run: RunRecord | null }> {
    return request(`/api/approvals/${approvalId}/approve`, {
      method: "POST",
      token,
      body
    });
  },
  rejectApproval(
    token: string,
    approvalId: string,
    body: { note?: string } = {}
  ): Promise<{ approval: ApprovalRecord | null; run: RunRecord | null }> {
    return request(`/api/approvals/${approvalId}/reject`, {
      method: "POST",
      token,
      body
    });
  },
  listFiles(
    token: string,
    projectId: string,
    currentPath = ""
  ): Promise<{ currentPath: string; rootPath: string; entries: WorkspaceFileEntry[] }> {
    const query = new URLSearchParams();
    if (currentPath) {
      query.set("path", currentPath);
    }

    return request(`/api/projects/${projectId}/files${query.size ? `?${query.toString()}` : ""}`, {
      token
    });
  },
  searchFiles(
    token: string,
    projectId: string,
    queryText: string,
    limit = 20
  ): Promise<{ entries: WorkspaceFileEntry[] }> {
    const query = new URLSearchParams({ query: queryText, limit: String(limit) });
    return request(`/api/projects/${projectId}/files/search?${query.toString()}`, {
      token
    });
  },
  getFileContent(
    token: string,
    projectId: string,
    filePath: string
  ): Promise<{ file: WorkspaceFileContent }> {
    const query = new URLSearchParams({ path: filePath });
    return request(`/api/projects/${projectId}/files/content?${query.toString()}`, {
      token
    });
  },
  saveFile(
    token: string,
    projectId: string,
    body: { path: string; content: string }
  ): Promise<{ file: WorkspaceFileContent }> {
    return request(`/api/projects/${projectId}/files/save`, {
      method: "POST",
      token,
      body
    });
  },
  createTerminalSession(
    token: string,
    projectId: string
  ): Promise<{ session: TerminalSessionRecord }> {
    return request(`/api/projects/${projectId}/terminal/session`, {
      method: "POST",
      token
    });
  },
  listTerminalSessions(
    token: string,
    projectId: string
  ): Promise<{ sessions: TerminalSessionRecord[] }> {
    return request(`/api/projects/${projectId}/terminal/sessions`, {
      token
    });
  },
  closeTerminalSession(
    token: string,
    projectId: string,
    sessionId: string
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/terminal/sessions/${sessionId}/close`, {
      method: "POST",
      token
    });
  },
  getGitStatus(
    token: string,
    projectId: string
  ): Promise<{ status: GitStatusRecord }> {
    return request(`/api/projects/${projectId}/git/status`, {
      token
    });
  },
  getGitDiff(
    token: string,
    projectId: string,
    filePath: string
  ): Promise<{ diff: GitDiffRecord }> {
    const query = new URLSearchParams({ path: filePath });
    return request(`/api/projects/${projectId}/git/diff?${query.toString()}`, {
      token
    });
  },
  listGitBranches(
    token: string,
    projectId: string
  ): Promise<{ branches: GitBranchRecord[] }> {
    return request(`/api/projects/${projectId}/git/branches`, {
      token
    });
  },
  listGitRemotes(
    token: string,
    projectId: string
  ): Promise<{ remotes: GitRemoteRecord[] }> {
    return request(`/api/projects/${projectId}/git/remotes`, {
      token
    });
  },
  stageGitFiles(
    token: string,
    projectId: string,
    body: { paths: string[] }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/stage`, {
      method: "POST",
      token,
      body
    });
  },
  unstageGitFiles(
    token: string,
    projectId: string,
    body: { paths: string[] }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/unstage`, {
      method: "POST",
      token,
      body
    });
  },
  commitGitChanges(
    token: string,
    projectId: string,
    body: { message: string }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/commit`, {
      method: "POST",
      token,
      body
    });
  },
  checkoutGitBranch(
    token: string,
    projectId: string,
    body: { name: string; create?: boolean }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/checkout`, {
      method: "POST",
      token,
      body
    });
  },
  fetchGitRemote(
    token: string,
    projectId: string,
    body: { remote: string }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/fetch`, {
      method: "POST",
      token,
      body
    });
  },
  pullGitBranch(
    token: string,
    projectId: string,
    body: { remote: string; branch: string }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/pull`, {
      method: "POST",
      token,
      body
    });
  },
  pushGitBranch(
    token: string,
    projectId: string,
    body: { remote: string; branch: string }
  ): Promise<{ ok: boolean }> {
    return request(`/api/projects/${projectId}/git/push`, {
      method: "POST",
      token,
      body
    });
  }
};

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
