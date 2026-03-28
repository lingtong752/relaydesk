import { useEffect, useState } from "react";
import type { GitDiffRecord, GitStatusRecord } from "@shared";
import { api } from "../lib/api";

interface GitWorkspaceProps {
  projectId: string;
  token: string;
}

export function GitWorkspace({ projectId, token }: GitWorkspaceProps): JSX.Element {
  const [status, setStatus] = useState<GitStatusRecord | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [diff, setDiff] = useState<GitDiffRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setSelectedPath("");
    setDiff(null);
    setError(null);
    void loadStatus();
  }, [projectId, token]);

  async function loadStatus(): Promise<void> {
    setLoading(true);
    try {
      const response = await api.getGitStatus(token, projectId);
      setStatus(response.status);
      setError(null);
      if (response.status.files[0]) {
        void handleSelectPath(response.status.files[0].path);
      }
    } catch (requestError) {
      setStatus(null);
      setDiff(null);
      setError(requestError instanceof Error ? requestError.message : "加载 Git 状态失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPath(filePath: string): Promise<void> {
    setSelectedPath(filePath);
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

  return (
    <section className="git-panel">
      <div className="chat-header">
        <div>
          <div className="eyebrow">Git 工作台</div>
          <h3>{status?.branch ? `分支：${status.branch}` : "尚未检测到仓库"}</h3>
          <p className="muted">
            {status
              ? `变更文件 ${status.files.length} 个，ahead ${status.ahead}，behind ${status.behind}`
              : "读取当前项目的 Git 状态和 diff"}
          </p>
        </div>
        <button className="secondary-button compact" onClick={() => void loadStatus()} type="button">
          刷新
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="git-layout">
        <div className="git-files-panel">
          {loading ? <p className="muted">加载 Git 状态...</p> : null}
          {!loading && status && status.files.length === 0 ? (
            <p className="muted">当前仓库没有未提交改动。</p>
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
              </button>
            ))}
          </div>
        </div>

        <div className="git-diff-panel">
          <div className="git-diff-header">
            <strong>{selectedPath || "未选择文件"}</strong>
            <span className="muted">{diff?.isUntracked ? "未跟踪文件" : "Diff"}</span>
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
