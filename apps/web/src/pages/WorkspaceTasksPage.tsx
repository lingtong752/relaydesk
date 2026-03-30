import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectTaskBoardRecord, ProjectTaskRecord } from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { ApiRequestError, api } from "../lib/api";
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

function extractConflictBoard(error: unknown): ProjectTaskBoardRecord | null {
  if (!(error instanceof ApiRequestError) || !error.payload || typeof error.payload !== "object") {
    return null;
  }

  const payload = error.payload as { board?: ProjectTaskBoardRecord };
  return payload.board ?? null;
}

function buildTaskConflictMessage(error: unknown, fallback: string): string {
  const baseMessage = error instanceof Error ? error.message : fallback;
  const board = extractConflictBoard(error);
  if (board?.taskMaster.sourceUpdatedAt) {
    return `${baseMessage} 最新 TaskMaster 更新时间：${formatMaybeDate(board.taskMaster.sourceUpdatedAt)}。`;
  }

  return baseMessage;
}

function formatTaskFieldValue(
  field: "status" | "summary" | "assignee" | "notes" | "blockedReason" | "boundSessionId" | "boundRunId",
  value: string | null | undefined
): string {
  if (field === "status" && value) {
    return TASK_STATUS_LABELS[value as ProjectTaskRecord["status"]] ?? value;
  }

  return value && value.trim().length > 0 ? value : "未设置";
}

type PendingTaskConflict =
  | {
      kind: "save";
      task: ProjectTaskRecord;
      message: string;
    }
  | {
      kind: "start_run";
      task: ProjectTaskRecord;
      sessionId: string;
      objective: string;
      constraints: string;
      message: string;
    };

interface TaskConflictFieldDiff {
  field: "status" | "summary" | "assignee" | "notes" | "blockedReason" | "boundSessionId" | "boundRunId";
  label: string;
  pendingValue: string;
  latestValue: string;
}

function buildTaskConflictFieldDiffs(
  board: ProjectTaskBoardRecord | null,
  pendingConflict: PendingTaskConflict | null | undefined
): TaskConflictFieldDiff[] {
  if (!board || !pendingConflict) {
    return [];
  }

  const latestTask = board.tasks.find((task) => task.id === pendingConflict.task.id);
  if (!latestTask) {
    return [];
  }

  const comparableFields: Array<{
    field: TaskConflictFieldDiff["field"];
    label: string;
    pendingValue: string | null | undefined;
    latestValue: string | null | undefined;
  }> = [
    {
      field: "status",
      label: "状态",
      pendingValue: pendingConflict.task.status,
      latestValue: latestTask.status
    },
    {
      field: "summary",
      label: "摘要",
      pendingValue: pendingConflict.task.summary,
      latestValue: latestTask.summary
    },
    {
      field: "assignee",
      label: "负责人",
      pendingValue: pendingConflict.task.assignee,
      latestValue: latestTask.assignee
    },
    {
      field: "notes",
      label: "备注",
      pendingValue: pendingConflict.task.notes,
      latestValue: latestTask.notes
    },
    {
      field: "blockedReason",
      label: "阻塞原因",
      pendingValue: pendingConflict.task.blockedReason,
      latestValue: latestTask.blockedReason
    },
    {
      field: "boundSessionId",
      label: "绑定会话",
      pendingValue: pendingConflict.task.boundSessionId,
      latestValue: latestTask.boundSessionId
    },
    {
      field: "boundRunId",
      label: "绑定 Run",
      pendingValue: pendingConflict.task.boundRunId,
      latestValue: latestTask.boundRunId
    }
  ];

  return comparableFields
    .filter((field) => (field.pendingValue ?? null) !== (field.latestValue ?? null))
    .map((field) => ({
      field: field.field,
      label: field.label,
      pendingValue: formatTaskFieldValue(field.field, field.pendingValue),
      latestValue: formatTaskFieldValue(field.field, field.latestValue)
    }));
}

export function ProjectTasksOverview({
  board,
  error,
  loading,
  projectId,
  projectRootPath,
  selectedTaskId,
  savingTaskId,
  syncing,
  startingRunTaskId,
  pendingConflict,
  selectedSessionLabel,
  hasBlockingRun,
  onSelectTask,
  onSaveTask,
  onSync,
  onStartRun,
  onResolveConflict,
  onDiscardConflict
}: {
  board: ProjectTaskBoardRecord | null;
  error: string | null;
  loading: boolean;
  projectId: string;
  projectRootPath: string;
  selectedTaskId?: string | null;
  savingTaskId?: string | null;
  syncing?: boolean;
  startingRunTaskId?: string | null;
  pendingConflict?: PendingTaskConflict | null;
  selectedSessionLabel?: string | null;
  hasBlockingRun?: boolean;
  onSelectTask?(taskId: string): void;
  onSaveTask?(task: ProjectTaskRecord): Promise<void>;
  onSync?(): Promise<void>;
  onStartRun?(task: ProjectTaskRecord): Promise<void>;
  onResolveConflict?(conflict: PendingTaskConflict): Promise<void>;
  onDiscardConflict?(): Promise<void>;
}): JSX.Element {
  const documentCount = board?.documents.filter((document) => document.exists).length ?? 0;
  const conflictDiffs = buildTaskConflictFieldDiffs(board, pendingConflict);

  return (
    <div className="workspace-route-stack tasks-layout">
      <section className="panel tasks-hero-panel">
        <SectionHeader
          actions={
            <div className="plugins-card-actions">
              <button
                className="secondary-button compact"
                disabled={Boolean(syncing)}
                onClick={() => void onSync?.()}
                type="button"
              >
                {syncing ? "同步中..." : "显式同步"}
              </button>
              <Link className="primary-button" to={`/workspace/${projectId}/agent`}>
                回到替身 Agent
              </Link>
            </div>
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
        {pendingConflict ? (
          <div className="warning-box">
            <div className="section-title-row">
              <strong>检测到 TaskMaster 同步冲突</strong>
              <span className="task-status-pill state-blocked">
                {pendingConflict.kind === "save" ? "保存冲突" : "运行冲突"}
              </span>
            </div>
            <p>{pendingConflict.message}</p>
            <p className="muted">待处理任务：{pendingConflict.task.title}</p>
            {pendingConflict.kind === "start_run" ? (
              <p className="muted">
                待发起运行：{pendingConflict.objective} · 会话 {pendingConflict.sessionId}
              </p>
            ) : null}
            {conflictDiffs.length > 0 ? (
              <div className="task-doc-list">
                {conflictDiffs.map((diff) => (
                  <article className="task-doc-card" key={diff.field}>
                    <div className="section-title-row">
                      <strong>{diff.label}</strong>
                      <span className="task-status-pill state-unknown">字段分叉</span>
                    </div>
                    <p className="muted">当前编辑：{diff.pendingValue}</p>
                    <p className="muted">最新文件：{diff.latestValue}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="info-box">
                当前冲突主要来自同步令牌变化，任务字段本身没有检测到明显差异。你可以先显式同步，也可以继续覆盖。
              </div>
            )}
            <div className="plugins-card-actions">
              <button
                className="secondary-button compact"
                disabled={Boolean(syncing)}
                onClick={() => void onDiscardConflict?.()}
                type="button"
              >
                {syncing ? "同步中..." : "显式同步最新内容"}
              </button>
              <button
                className="primary-button compact"
                disabled={Boolean(syncing)}
                onClick={() => void onResolveConflict?.(pendingConflict)}
                type="button"
              >
                {pendingConflict.kind === "save" ? "保留当前编辑并覆盖" : "忽略外部变更并继续发起运行"}
              </button>
            </div>
          </div>
        ) : null}
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
            title={board?.taskMaster.available ? "已接入 TaskMaster 可执行面板" : "等待接入 TaskMaster"}
            description="当前页会显式写回本地任务文件，并在发起 run 时绑定 session / run 上下文。"
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
                  {board.taskMaster.sourceUpdatedAt ? (
                    <span>最近同步 {formatMaybeDate(board.taskMaster.sourceUpdatedAt)}</span>
                  ) : null}
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
          {board?.taskMaster.available ? (
            <div className="info-box">
              任务保存和从任务发起运行都会带上同步令牌。如果 `tasks.json` 在 RelayDesk 外部被更新，当前页会阻止覆盖并要求先显式同步。
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel">
        <SectionHeader
          eyebrow="任务列表"
          title="当前项目的任务执行视图"
          description="选中任务后可以直接更新状态、备注、阻塞原因，并从当前会话发起替身执行。"
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
                  {task.assignee ? <span>负责人 {task.assignee}</span> : null}
                  {task.blockedReason ? <span>阻塞 {task.blockedReason}</span> : null}
                  {task.boundSessionId ? <span>会话 {task.boundSessionId}</span> : null}
                  {task.boundRunId ? <span>Run {task.boundRunId}</span> : null}
                  {task.updatedAt ? <span>{formatMaybeDate(task.updatedAt)}</span> : null}
                </div>
                {task.notes ? <p className="muted">备注：{task.notes}</p> : null}
                <div className="plugins-card-actions">
                  <button
                    className="secondary-button compact"
                    onClick={() => onSelectTask?.(task.id)}
                    type="button"
                  >
                    {selectedTaskId === task.id ? "正在编辑" : "编辑任务"}
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={!selectedSessionLabel || Boolean(hasBlockingRun) || startingRunTaskId === task.id}
                    onClick={() => void onStartRun?.(task)}
                    type="button"
                  >
                    {startingRunTaskId === task.id ? "启动中..." : "从当前会话启动替身"}
                  </button>
                </div>
                {selectedTaskId === task.id ? (
                  <TaskEditorCard
                    hasBlockingRun={Boolean(hasBlockingRun)}
                    saving={savingTaskId === task.id}
                    selectedSessionLabel={selectedSessionLabel ?? null}
                    task={task}
                    onSave={onSaveTask}
                  />
                ) : null}
                {task.timeline.length > 0 ? (
                  <div className="taskmaster-summary" style={{ marginTop: "0.75rem" }}>
                    <article className="taskmaster-card">
                      <div className="section-title-row">
                        <strong>任务时间线</strong>
                        <span className="muted">{task.timeline.length} 条</span>
                      </div>
                      <div className="task-doc-list">
                        {task.timeline.slice(0, 5).map((event) => (
                          <article className="task-doc-card" key={event.id}>
                            <div className="section-title-row">
                              <strong>{event.summary}</strong>
                              <span className="task-status-pill state-unknown">{event.type}</span>
                            </div>
                            {event.detail ? <p className="muted">{event.detail}</p> : null}
                            <p className="muted">{formatMaybeDate(event.createdAt)}</p>
                          </article>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}
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

function TaskEditorCard({
  task,
  saving,
  selectedSessionLabel,
  hasBlockingRun,
  onSave
}: {
  task: ProjectTaskRecord;
  saving: boolean;
  selectedSessionLabel: string | null;
  hasBlockingRun: boolean;
  onSave?(task: ProjectTaskRecord): Promise<void>;
}): JSX.Element {
  const [status, setStatus] = useState<ProjectTaskRecord["status"]>(task.status);
  const [summary, setSummary] = useState(task.summary ?? "");
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [blockedReason, setBlockedReason] = useState(task.blockedReason ?? "");

  useEffect(() => {
    setStatus(task.status);
    setSummary(task.summary ?? "");
    setAssignee(task.assignee ?? "");
    setNotes(task.notes ?? "");
    setBlockedReason(task.blockedReason ?? "");
  }, [task]);

  return (
    <form
      className="settings-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave?.({
          ...task,
          status,
          summary: summary.trim() || null,
          assignee: assignee.trim() || null,
          notes: notes.trim() || null,
          blockedReason: blockedReason.trim() || null
        });
      }}
    >
      <div className="settings-inline-grid">
        <label>
          状态
          <select onChange={(event) => setStatus(event.target.value as ProjectTaskRecord["status"])} value={status}>
            <option value="todo">待开始</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
            <option value="blocked">阻塞</option>
            <option value="unknown">未知</option>
          </select>
        </label>
        <label>
          负责人
          <input onChange={(event) => setAssignee(event.target.value)} value={assignee} />
        </label>
      </div>
      <label>
        摘要
        <textarea onChange={(event) => setSummary(event.target.value)} rows={3} value={summary} />
      </label>
      <label>
        备注
        <textarea onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} />
      </label>
      <label>
        阻塞原因
        <textarea onChange={(event) => setBlockedReason(event.target.value)} rows={2} value={blockedReason} />
      </label>
      <div className="settings-card-actions">
        <span className="muted">
          {selectedSessionLabel
            ? `当前会话 ${selectedSessionLabel}${hasBlockingRun ? " · 当前已有运行占用" : ""}`
            : "当前还没有选中会话，保存任务后可回到聊天页选择会话再发起运行。"}
        </span>
        <button className="primary-button compact" disabled={saving} type="submit">
          {saving ? "保存中..." : "保存任务"}
        </button>
      </div>
    </form>
  );
}

export function WorkspaceTasksPage(): JSX.Element {
  const {
    projectId,
    projectRootPath,
    token,
    selectedSession,
    activeRun,
    handleRunCreated
  } = useProjectWorkspace();
  const [board, setBoard] = useState<ProjectTaskBoardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [startingRunTaskId, setStartingRunTaskId] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingTaskConflict | null>(null);

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

  async function handleSync(): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setSyncing(true);
      setError(null);
      const response = await api.syncProjectTasks(token, projectId);
      setBoard(response.board);
      setPendingConflict(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "同步任务失败");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveTask(
    task: ProjectTaskRecord,
    options: {
      forceOverwrite?: boolean;
    } = {}
  ): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setSavingTaskId(task.id);
      setError(null);
      setPendingConflict(null);
      const response = await api.updateProjectTask(token, projectId, task.id, {
        status: task.status,
        summary: task.summary ?? null,
        assignee: task.assignee ?? null,
        notes: task.notes ?? null,
        blockedReason: task.blockedReason ?? null,
        boundSessionId: task.boundSessionId ?? null,
        boundRunId: task.boundRunId ?? null,
        expectedSyncToken: board?.taskMaster.syncToken ?? null,
        forceOverwrite: options.forceOverwrite ?? false
      });
      setBoard(response.board);
      setPendingConflict(null);
    } catch (requestError) {
      const conflictBoard = extractConflictBoard(requestError);
      if (conflictBoard) {
        setBoard(conflictBoard);
        setPendingConflict({
          kind: "save",
          task,
          message: buildTaskConflictMessage(requestError, "保存任务失败")
        });
      }
      setError(buildTaskConflictMessage(requestError, "保存任务失败"));
    } finally {
      setSavingTaskId(null);
    }
  }

  async function handleStartRun(
    task: ProjectTaskRecord,
    options: {
      forceOverwrite?: boolean;
      sessionId?: string;
      objective?: string;
      constraints?: string;
    } = {}
  ): Promise<void> {
    const effectiveSessionId = options.sessionId ?? selectedSession?.id ?? null;

    if (!token || !projectId || !effectiveSessionId) {
      setError("请先在聊天页或工作区中选中一条会话。");
      return;
    }

    const objective = options.objective ?? `推进任务：${task.title}`;
    const constraints = options.constraints ?? task.blockedReason ?? "";

    try {
      setStartingRunTaskId(task.id);
      setError(null);
      setPendingConflict(null);
      const response = await api.startTaskRun(token, projectId, task.id, {
        sessionId: effectiveSessionId,
        constraints,
        objective,
        expectedSyncToken: board?.taskMaster.syncToken ?? null,
        forceOverwrite: options.forceOverwrite ?? false
      });
      setBoard(response.board);
      setPendingConflict(null);
      handleRunCreated(response.run, response.approval);
    } catch (requestError) {
      const conflictBoard = extractConflictBoard(requestError);
      if (conflictBoard) {
        setBoard(conflictBoard);
        setPendingConflict({
          kind: "start_run",
          task,
          sessionId: effectiveSessionId,
          objective,
          constraints,
          message: buildTaskConflictMessage(requestError, "从任务启动替身失败")
        });
      }
      setError(buildTaskConflictMessage(requestError, "从任务启动替身失败"));
    } finally {
      setStartingRunTaskId(null);
    }
  }

  async function handleResolveConflict(conflict: PendingTaskConflict): Promise<void> {
    if (conflict.kind === "save") {
      await handleSaveTask(conflict.task, { forceOverwrite: true });
      return;
    }

    await handleStartRun(conflict.task, {
      forceOverwrite: true,
      sessionId: conflict.sessionId,
      objective: conflict.objective,
      constraints: conflict.constraints
    });
  }

  return (
    <ProjectTasksOverview
      board={board}
      error={error}
      loading={loading}
      pendingConflict={pendingConflict}
      projectId={projectId}
      projectRootPath={normalizedRootPath}
      selectedTaskId={selectedTaskId}
      savingTaskId={savingTaskId}
      syncing={syncing}
      startingRunTaskId={startingRunTaskId}
      selectedSessionLabel={selectedSession ? `${selectedSession.title} · ${selectedSession.provider}` : null}
      hasBlockingRun={Boolean(activeRun)}
      onSaveTask={handleSaveTask}
      onSelectTask={setSelectedTaskId}
      onStartRun={handleStartRun}
      onResolveConflict={handleResolveConflict}
      onDiscardConflict={handleSync}
      onSync={handleSync}
    />
  );
}
