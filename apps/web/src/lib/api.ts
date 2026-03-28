import type {
  ApprovalRecord,
  LoginResponse,
  GitDiffRecord,
  GitStatusRecord,
  MessageRecord,
  ProjectRecord,
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
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
    pendingApprovals: ApprovalRecord[];
  }> {
    return request(`/api/projects/${projectId}/bootstrap`, { token });
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
  listRunApprovals(token: string, runId: string): Promise<{ approvals: ApprovalRecord[] }> {
    return request(`/api/runs/${runId}/approvals`, {
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
  }
};

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
