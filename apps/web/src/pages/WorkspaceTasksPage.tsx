import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectTaskBoardRecord, ProjectTaskRecord } from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { api } from "../lib/api";
import { EmptyState } from "../shared/ui/EmptyState";
import { SectionHeader } from "../shared/ui/SectionHeader";

const TASK_STATUS_LABELS: Record<ProjectTaskRecord["status"], string> = {
  todo: "待开始",
  in_progress: "进行中",
  done: "已完成",
  blocked: "阻塞",
  unknown: "未知"
};

function getTaskStatusToneClass(status: ProjectTaskRecord["status"]): string {
  if (status === "done") {
    return "state-done";
  }

  if (status === "in_progress") {
    return "state-progress";
  }

  if (status === "blocked") {
    return "state-blocked";
  }

  if (status === "unknown") {
    return "state-unknown";
  }

  return "state-todo";
}

function getTaskSummary(board: ProjectTaskBoardRecord | null): string {
  if (!board) {
    return "正在聚合项目任务与文档基线。";
  }

  if (board.tasks.length === 0) {
    return board.taskMaster.available
      ? "已发现 TaskMaster 文件，但当前没有解析到任务。"
      : "当前项目还没有接入 TaskMaster，先通过文档基线管理任务。";
  }

  return `当前共 ${board.tasks.length} 条任务，其中 ${board.taskMaster.counts.inProgress} 条进行中、${board.taskMaster.counts.blocked} 条阻塞。`;
}

function formatMaybeDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function ProjectTasksOverview({
  board,
  error,
  loading,
  projectId,
  projectRootPath
}: {
  board: ProjectTaskBoardRecord | null;
  error: string | null;
  loading: boolean;
  projectId: string;
  projectRootPath: string;
}): JSX.Element {
  const documentCount = board?.documents.filter((document) => document.exists).length ?? 0;

  return (
    <div className="workspace-route-stack tasks-layout">
      <section className="panel tasks-hero-panel">
        <SectionHeader
          actions={
            <Link className="primary-button" to={`/workspace/${projectId}/agent`}>
              回到替身 Agent
            </Link>
          }
          description={projectRootPath}
          eyebrow="任务工作台"
          title="先对齐任务基线，再推进替身执行"
        />
        <div className="tasks-summary-strip">
          <span>已发现文档 {documentCount} 份</span>
          <span>任务 {board?.tasks.length ?? 0} 条</span>
          <span>{getTaskSummary(board)}</span>
        </div>
        {loading ? <p className="muted">正在读取任务与 TaskMaster 摘要...</p> : null}
        {error ? <div className="error-box">{error}</div> : null}
      </section>

      <div className="tasks-grid">
        <section className="panel">
          <SectionHeader
            eyebrow="文档基线"
            title="项目级 PRD / 路线图 / 测试报告"
            description="任务页第一版先把项目执行文档收口到一个入口。"
          />
          {board?.documents.length ? (
            <div className="task-doc-list">
              {board.documents.map((document) => (
                <article className="task-doc-card" key={document.id}>
                  <div className="section-title-row">
                    <div>
                      <strong>{document.label}</strong>
                      <p className="muted">{document.path}</p>
                    </div>
                    <span className={`task-status-pill ${document.exists ? "state-done" : "state-unknown"}`}>
                      {document.exists ? "已发现" : "缺失"}
                    </span>
                  </div>
                  <p className="muted">
                    {document.updatedAt ? `最近更新 ${formatMaybeDate(document.updatedAt)}` : "当前还没有发现对应文档。"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="还没有聚合到项目文档。" />
          )}
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow="TaskMaster"
            title={board?.taskMaster.available ? "已接入 TaskMaster 只读摘要" : "等待接入 TaskMaster"}
            description="当前阶段只读取本地任务文件，不会修改 TaskMaster 内容。"
          />
          {board ? (
            <div className="taskmaster-summary">
              <article className="taskmaster-card">
                <div className="section-title-row">
                  <strong>接入状态</strong>
                  <span
                    className={`task-status-pill ${board.taskMaster.available ? "state-progress" : "state-unknown"}`}
                  >
                    {board.taskMaster.available ? "已发现" : "未发现"}
                  </span>
                </div>
                <p className="muted">
                  {board.taskMaster.available
                    ? board.taskMaster.sourcePath
                    : "当前未找到 TaskMaster 任务文件，下面会列出扫描过的路径。"}
                </p>
                <div className="tasks-inline-stats">
                  <span>总任务 {board.taskMaster.taskCount}</span>
                  <span>进行中 {board.taskMaster.counts.inProgress}</span>
                  <span>阻塞 {board.taskMaster.counts.blocked}</span>
                </div>
              </article>

              <article className="taskmaster-card">
                <div className="section-title-row">
                  <strong>扫描路径</strong>
                  <span className="muted">{board.taskMaster.scannedPaths.length} 个候选</span>
                </div>
                <div className="task-path-list">
                  {board.taskMaster.scannedPaths.map((candidatePath) => (
                    <code key={candidatePath}>{candidatePath}</code>
                  ))}
                </div>
              </article>

              {board.taskMaster.notes.length > 0 ? (
                <article className="taskmaster-card">
                  <div className="section-title-row">
                    <strong>说明</strong>
                  </div>
                  <ul className="settings-note-list">
                    {board.taskMaster.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
            </div>
          ) : (
            <EmptyState message="TaskMaster 摘要稍后会出现在这里。" />
          )}
        </section>
      </div>

      <section className="panel">
        <SectionHeader
          eyebrow="任务列表"
          title="当前项目的只读任务视图"
          description="后续会在这里叠加 RelayDesk 内建任务和 TaskMaster 双向同步。"
        />
        {board?.tasks.length ? (
          <div className="task-card-list">
            {board.tasks.map((task) => (
              <article
                className="task-card"
                key={`${task.sourceType}:${task.id}`}
                style={{ marginLeft: `${task.nestingLevel * 16}px` }}
              >
                <div className="section-title-row">
                  <div>
                    <strong>{task.title}</strong>
                    <p className="muted">
                      {task.priority ? `优先级 ${task.priority}` : "未标注优先级"} · 来源 {task.sourceType}
                    </p>
                  </div>
                  <span className={`task-status-pill ${getTaskStatusToneClass(task.status)}`}>
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                </div>
                {task.summary ? <p className="muted">{task.summary}</p> : null}
                <div className="tasks-inline-stats">
                  <span>ID {task.id}</span>
                  {task.parentId ? <span>父任务 {task.parentId}</span> : null}
                  {task.updatedAt ? <span>{formatMaybeDate(task.updatedAt)}</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState message="当前没有可展示的任务。先接入 TaskMaster，或者继续通过 PRD / 路线图管理项目推进。" />
        )}
      </section>
    </div>
  );
}

export function WorkspaceTasksPage(): JSX.Element {
  const { projectId, projectRootPath, token } = useProjectWorkspace();
  const [board, setBoard] = useState<ProjectTaskBoardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !projectId) {
      setLoading(false);
      setError("缺少项目上下文，暂时无法读取任务工作台。");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .getProjectTaskBoard(token, projectId)
      .then((response) => {
        if (!cancelled) {
          setBoard(response.board);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "读取任务工作台失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, token]);

  const normalizedRootPath = useMemo(
    () => board?.projectRootPath ?? projectRootPath,
    [board?.projectRootPath, projectRootPath]
  );

  return (
    <ProjectTasksOverview
      board={board}
      error={error}
      loading={loading}
      projectId={projectId}
      projectRootPath={normalizedRootPath}
    />
  );
}
