import { useEffect, useMemo, useState } from "react";
import type {
  GitBranchRecord,
  GitChangedFileRecord,
  GitDiffRecord,
  GitRemoteRecord,
  GitStatusRecord,
  SessionRecord
} from "@shared";
import { api } from "../../../../lib/api";
import {
  getSessionOriginRuntimeLabel,
  getSessionResumeStatusLabel,
  getSessionStatusLabel
} from "../../../../lib/sessionRuntime";
import { EmptyState } from "../../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../../shared/ui/SectionHeader";

interface GitWorkspaceProps {
  boundSession?: SessionRecord | null;
  onOpenBoundSession?(): void;
  projectId: string;
  token: string;
}

function hasStagedChanges(file: GitChangedFileRecord): boolean {
  return file.stagedStatus !== " " && file.stagedStatus !== "?";
}

function canStageFile(file: GitChangedFileRecord): boolean {
  return file.stagedStatus === "?" || (file.unstagedStatus !== " " && file.unstagedStatus !== "?");
}

export function GitWorkspace({
  boundSession = null,
  onOpenBoundSession,
  projectId,
  token
}: GitWorkspaceProps): JSX.Element {
  const [status, setStatus] = useState<GitStatusRecord | null>(null);
  const [branches, setBranches] = useState<GitBranchRecord[]>([]);
  const [remotes, setRemotes] = useState<GitRemoteRecord[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [diff, setDiff] = useState<GitDiffRecord | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [remoteName, setRemoteName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedFile = useMemo(
    () => status?.files.find((file) => file.path === selectedPath) ?? null,
    [selectedPath, status]
  );
  const stagedFiles = useMemo(
    () => status?.files.filter((file) => hasStagedChanges(file)) ?? [],
    [status]
  );
  const stageableFiles = useMemo(
    () => status?.files.filter((file) => canStageFile(file)) ?? [],
    [status]
  );
  const selectedRemote = useMemo(
    () => remotes.find((remote) => remote.name === remoteName) ?? null,
    [remoteName, remotes]
  );
  const boundSessionResumeLabel = useMemo(
    () => getSessionResumeStatusLabel(boundSession),
    [boundSession]
  );
  const currentBranchName = status?.branch ?? "";

  useEffect(() => {
    setStatus(null);
    setBranches([]);
    setRemotes([]);
    setSelectedPath("");
    setDiff(null);
    setCommitMessage("");
    setBranchName("");
    setNewBranchName("");
    setRemoteName("");
    setError(null);
    setNotice(null);
    void loadWorkspaceState();
  }, [projectId, token]);

  async function loadDiff(filePath: string): Promise<void> {
    setLoadingDiff(true);
    try {
      const response = await api.getGitDiff(token, projectId, filePath);
      setDiff(response.diff);
      setError(null);
    } catch (requestError) {
      setDiff(null);
      setError(requestError instanceof Error ? requestError.message : "加载 diff 失败");
    } finally {
      setLoadingDiff(false);
    }
  }

  async function loadWorkspaceState(preferredPath?: string): Promise<void> {
    setLoading(true);
    try {
      const [statusResponse, branchesResponse, remotesResponse] = await Promise.all([
        api.getGitStatus(token, projectId),
        api.listGitBranches(token, projectId),
        api.listGitRemotes(token, projectId)
      ]);
      const nextStatus = statusResponse.status;
      const nextBranches = branchesResponse.branches;
      const nextRemotes = remotesResponse.remotes;
      const nextPath =
        preferredPath && nextStatus.files.some((file) => file.path === preferredPath)
          ? preferredPath
          : nextStatus.files[0]?.path ?? "";

      setStatus(nextStatus);
      setBranches(nextBranches);
      setRemotes(nextRemotes);
      setBranchName((current) => {
        if (current && nextBranches.some((branch) => branch.name === current)) {
          return current;
        }

        return nextBranches.find((branch) => branch.current)?.name ?? nextBranches[0]?.name ?? "";
      });
      setRemoteName((current) => {
        if (current && nextRemotes.some((remote) => remote.name === current)) {
          return current;
        }

        return (
          nextRemotes.find((remote) => remote.name === "origin")?.name ??
          nextRemotes[0]?.name ??
          ""
        );
      });
      setSelectedPath(nextPath);
      setError(null);

      if (nextPath) {
        await loadDiff(nextPath);
      } else {
        setDiff(null);
      }
    } catch (requestError) {
      setStatus(null);
      setBranches([]);
      setRemotes([]);
      setSelectedPath("");
      setDiff(null);
      setRemoteName("");
      setError(requestError instanceof Error ? requestError.message : "加载 Git 工作台失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPath(filePath: string): Promise<void> {
    setSelectedPath(filePath);
    await loadDiff(filePath);
  }

  async function runAction(
    actionName: string,
    task: () => Promise<void>,
    successMessage: string,
    preferredPath?: string
  ): Promise<void> {
    setAction(actionName);
    setNotice(null);
    try {
      await task();
      setNotice(successMessage);
      setError(null);
      await loadWorkspaceState(preferredPath ?? selectedPath);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Git 操作失败");
    } finally {
      setAction(null);
    }
  }

  async function handleStage(paths: string[], successMessage: string): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    await runAction(
      "stage",
      () => api.stageGitFiles(token, projectId, { paths }).then(() => undefined),
      successMessage,
      paths[0]
    );
  }

  async function handleUnstage(paths: string[], successMessage: string): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    await runAction(
      "unstage",
      () => api.unstageGitFiles(token, projectId, { paths }).then(() => undefined),
      successMessage,
      paths[0]
    );
  }

  async function handleCommit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedMessage = commitMessage.trim();
    if (!normalizedMessage) {
      return;
    }

    await runAction(
      "commit",
      () => api.commitGitChanges(token, projectId, { message: normalizedMessage }).then(() => undefined),
      "提交已创建"
    );
    setCommitMessage("");
  }

  async function handleCheckoutBranch(): Promise<void> {
    const normalizedBranchName = branchName.trim();
    if (!normalizedBranchName || normalizedBranchName === status?.branch) {
      return;
    }

    await runAction(
      "checkout",
      () =>
        api
          .checkoutGitBranch(token, projectId, { name: normalizedBranchName, create: false })
          .then(() => undefined),
      `已切换到分支 ${normalizedBranchName}`
    );
  }

  async function handleCreateBranch(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedBranchName = newBranchName.trim();
    if (!normalizedBranchName) {
      return;
    }

    await runAction(
      "create-branch",
      () =>
        api
          .checkoutGitBranch(token, projectId, { name: normalizedBranchName, create: true })
          .then(() => undefined),
      `已创建并切换到分支 ${normalizedBranchName}`
    );
    setNewBranchName("");
  }

  async function handleFetchRemote(): Promise<void> {
    const normalizedRemoteName = remoteName.trim();
    if (!normalizedRemoteName) {
      return;
    }

    await runAction(
      "fetch",
      () => api.fetchGitRemote(token, projectId, { remote: normalizedRemoteName }).then(() => undefined),
      `已获取 ${normalizedRemoteName} 的最新远程引用`
    );
  }

  async function handlePullRemote(): Promise<void> {
    const normalizedRemoteName = remoteName.trim();
    if (!normalizedRemoteName || !currentBranchName) {
      return;
    }

    await runAction(
      "pull",
      () =>
        api
          .pullGitBranch(token, projectId, {
            remote: normalizedRemoteName,
            branch: currentBranchName
          })
          .then(() => undefined),
      `已同步 ${normalizedRemoteName}/${currentBranchName}`,
      selectedPath
    );
  }

  async function handlePushRemote(): Promise<void> {
    const normalizedRemoteName = remoteName.trim();
    if (!normalizedRemoteName || !currentBranchName) {
      return;
    }

    await runAction(
      "push",
      () =>
        api
          .pushGitBranch(token, projectId, {
            remote: normalizedRemoteName,
            branch: currentBranchName
          })
          .then(() => undefined),
      `已推送 ${currentBranchName} 到 ${normalizedRemoteName}`,
      selectedPath
    );
  }

  const headerDescription =
    status && !status.available
      ? "当前工作区路径不存在，或者还不是一个 Git 仓库。"
      : status
        ? `变更文件 ${status.files.length} 个，已暂存 ${stagedFiles.length} 个，ahead ${status.ahead}，behind ${status.behind}，远程 ${remotes.length} 个`
        : "读取当前项目的 Git 状态、提交与分支";

  return (
    <section className="git-panel">
      <SectionHeader
        actions={
          <button
            className="secondary-button compact"
            disabled={loading || action !== null}
            onClick={() => void loadWorkspaceState(selectedPath)}
            type="button"
          >
            刷新
          </button>
        }
        description={headerDescription}
        eyebrow="Git 工作台"
        title={status?.branch ? `分支：${status.branch}` : "尚未检测到仓库"}
      />

      {error ? <div className="error-box">{error}</div> : null}
      {notice ? <div className="success-box">{notice}</div> : null}
      {boundSession ? (
        <div className="info-box">
          当前从会话“{boundSession.title}”进入 Git 工作台。
          {` ${boundSession.provider} · ${getSessionOriginRuntimeLabel(boundSession)} · 状态 ${getSessionStatusLabel(boundSession)}。`}
          {boundSessionResumeLabel ? ` ${boundSessionResumeLabel}。` : ""}
          {onOpenBoundSession ? (
            <>
              {" "}
              <button className="secondary-button compact" onClick={onOpenBoundSession} type="button">
                回到当前会话
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="git-toolbar">
        <div className="git-toolbar-card">
          <div className="eyebrow">批量操作</div>
          <div className="git-toolbar-actions">
            <button
              className="secondary-button compact"
              disabled={stageableFiles.length === 0 || action !== null}
              onClick={() => void handleStage(stageableFiles.map((file) => file.path), "已暂存全部变更")}
              type="button"
            >
              {action === "stage" ? "处理中..." : "全部暂存"}
            </button>
            <button
              className="secondary-button compact"
              disabled={stagedFiles.length === 0 || action !== null}
              onClick={() => void handleUnstage(stagedFiles.map((file) => file.path), "已取消全部暂存")}
              type="button"
            >
              {action === "unstage" ? "处理中..." : "全部取消暂存"}
            </button>
          </div>
        </div>

        <form className="git-toolbar-card git-commit-form" onSubmit={handleCommit}>
          <div className="eyebrow">提交</div>
          <div className="git-inline-form">
            <input
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="输入提交说明"
              value={commitMessage}
            />
            <button
              className="primary-button compact"
              disabled={!commitMessage.trim() || stagedFiles.length === 0 || action !== null}
              type="submit"
            >
              {action === "commit" ? "提交中..." : "提交"}
            </button>
          </div>
        </form>

        <div className="git-toolbar-card">
          <div className="eyebrow">分支</div>
          <div className="git-inline-form">
            <select
              aria-label="选择分支"
              disabled={branches.length === 0 || action !== null}
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
            >
              {branches.length === 0 ? <option value="">暂无分支</option> : null}
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.current ? `${branch.name} (当前)` : branch.name}
                </option>
              ))}
            </select>
            <button
              className="secondary-button compact"
              disabled={!branchName || branchName === status?.branch || action !== null}
              onClick={() => void handleCheckoutBranch()}
              type="button"
            >
              {action === "checkout" ? "切换中..." : "切换"}
            </button>
          </div>
          <form className="git-inline-form" onSubmit={handleCreateBranch}>
            <input
              onChange={(event) => setNewBranchName(event.target.value)}
              placeholder="新分支名，例如 feat/git-write"
              value={newBranchName}
            />
            <button
              className="secondary-button compact"
              disabled={!newBranchName.trim() || action !== null}
              type="submit"
            >
              {action === "create-branch" ? "创建中..." : "新建并切换"}
            </button>
          </form>
        </div>

        <div className="git-toolbar-card">
          <div className="eyebrow">远程同步</div>
          <div className="git-inline-form">
            <select
              aria-label="选择远程仓库"
              disabled={remotes.length === 0 || action !== null}
              value={remoteName}
              onChange={(event) => setRemoteName(event.target.value)}
            >
              {remotes.length === 0 ? <option value="">暂无远程</option> : null}
              {remotes.map((remote) => (
                <option key={remote.name} value={remote.name}>
                  {remote.name}
                </option>
              ))}
            </select>
            <button
              className="secondary-button compact"
              disabled={!remoteName || action !== null}
              onClick={() => void handleFetchRemote()}
              type="button"
            >
              {action === "fetch" ? "获取中..." : "Fetch"}
            </button>
            <button
              className="secondary-button compact"
              disabled={!remoteName || !currentBranchName || action !== null}
              onClick={() => void handlePullRemote()}
              type="button"
            >
              {action === "pull" ? "同步中..." : "Pull"}
            </button>
            <button
              className="secondary-button compact"
              disabled={!remoteName || !currentBranchName || action !== null}
              onClick={() => void handlePushRemote()}
              type="button"
            >
              {action === "push" ? "推送中..." : "Push"}
            </button>
          </div>
          {selectedRemote ? (
            <div className="field-hint">
              {currentBranchName
                ? `当前会同步分支 ${currentBranchName}。`
                : "先切换到一个本地分支后，再执行 Pull / Push。"}{" "}
              fetch: {selectedRemote.fetchUrl ?? "未配置"}；push: {selectedRemote.pushUrl ?? "未配置"}
            </div>
          ) : (
            <div className="field-hint">当前仓库还没有配置远程仓库。</div>
          )}
        </div>
      </div>

      <div className="git-layout">
        <div className="git-files-panel">
          {loading ? <p className="muted">加载 Git 状态...</p> : null}
          {!loading && status?.available && status.files.length === 0 ? (
            <EmptyState message="当前仓库没有未提交改动。" />
          ) : null}
          {!loading && status && !status.available ? (
            <EmptyState message="设置有效工作区路径后，这里会显示仓库状态和分支信息。" />
          ) : null}
          <div className="git-file-list">
            {(status?.files ?? []).map((file) => (
              <button
                className={file.path === selectedPath ? "git-file-item active" : "git-file-item"}
                key={file.path}
                onClick={() => void handleSelectPath(file.path)}
                type="button"
              >
                <strong>{file.path}</strong>
                <span>{file.summary}</span>
                <span className="muted">
                  index: {file.stagedStatus} / worktree: {file.unstagedStatus}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="git-diff-panel">
          <div className="git-diff-header">
            <div>
              <strong>{selectedPath || "未选择文件"}</strong>
              <div className="muted">{diff?.isUntracked ? "未跟踪文件" : "Diff 预览"}</div>
            </div>
            <div className="git-toolbar-actions">
              <button
                className="secondary-button compact"
                disabled={!selectedFile || !canStageFile(selectedFile) || action !== null}
                onClick={() =>
                  void handleStage(
                    selectedFile ? [selectedFile.path] : [],
                    `已暂存 ${selectedFile?.path ?? "当前文件"}`
                  )
                }
                type="button"
              >
                {action === "stage" ? "处理中..." : "暂存文件"}
              </button>
              <button
                className="secondary-button compact"
                disabled={!selectedFile || !hasStagedChanges(selectedFile) || action !== null}
                onClick={() =>
                  void handleUnstage(
                    selectedFile ? [selectedFile.path] : [],
                    `已取消暂存 ${selectedFile?.path ?? "当前文件"}`
                  )
                }
                type="button"
              >
                {action === "unstage" ? "处理中..." : "取消暂存"}
              </button>
            </div>
          </div>

          {loadingDiff ? <p className="muted">加载 diff...</p> : null}
          {!loadingDiff && diff?.notice ? <div className="muted">{diff.notice}</div> : null}
          <pre className="git-diff-output">
            {diff?.diff || (!loadingDiff ? "选择一个变更文件查看 diff。" : "")}
          </pre>
        </div>
      </div>
    </section>
  );
}
