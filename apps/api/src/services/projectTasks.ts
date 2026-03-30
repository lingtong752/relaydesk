import path from "node:path";
import { createHash } from "node:crypto";
import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type {
  ProjectDocumentReferenceRecord,
  ProjectTaskBoardRecord,
  ProjectTaskRecord,
  ProjectTaskStatus,
  ProjectTaskStatusCounts,
  ProjectTaskTimelineEventRecord,
  ProjectTaskTimelineEventType,
  TaskMasterSummaryRecord
} from "@shared";

const TASKMASTER_CANDIDATE_RELATIVE_PATHS = [
  path.join(".taskmaster", "tasks", "tasks.json"),
  path.join(".taskmaster", "tasks.json"),
  path.join("taskmaster", "tasks.json"),
  path.join("tasks", "tasks.json")
];

const DOCUMENT_REFERENCE_SPECS: Array<{
  id: ProjectDocumentReferenceRecord["id"];
  label: string;
  type: ProjectDocumentReferenceRecord["type"];
  relativePath?: string;
  dynamic?: "latest_test_report";
}> = [
  {
    id: "prd",
    label: "PRD",
    type: "prd",
    relativePath: path.join("docs", "prd", "PRODUCT_REQUIREMENTS.zh-CN.md")
  },
  {
    id: "roadmap",
    label: "路线图",
    type: "roadmap",
    relativePath: path.join("docs", "project-management", "ROADMAP.zh-CN.md")
  },
  {
    id: "backlog",
    label: "开发待办",
    type: "backlog",
    relativePath: path.join("docs", "project-management", "BACKLOG.zh-CN.md")
  },
  {
    id: "test-report",
    label: "最新测试报告",
    type: "test_report",
    dynamic: "latest_test_report"
  }
];

export interface TaskMutationInput {
  status?: ProjectTaskStatus;
  summary?: string | null;
  assignee?: string | null;
  notes?: string | null;
  blockedReason?: string | null;
  boundSessionId?: string | null;
  boundRunId?: string | null;
  timelineEvent?: {
    type: ProjectTaskTimelineEventType;
    summary: string;
    detail?: string | null;
    createdAt?: string;
  };
}

interface TaskMasterSourceSnapshot {
  sourcePath: string;
  raw: string;
  sourceUpdatedAt: string | null;
  syncToken: string;
}

export class TaskMasterSyncConflictError extends Error {
  readonly sourcePath: string;
  readonly sourceUpdatedAt: string | null;
  readonly currentSyncToken: string;

  constructor(input: {
    sourcePath: string;
    sourceUpdatedAt: string | null;
    currentSyncToken: string;
  }) {
    super("TaskMaster file changed since the last sync");
    this.name = "TaskMasterSyncConflictError";
    this.sourcePath = input.sourcePath;
    this.sourceUpdatedAt = input.sourceUpdatedAt;
    this.currentSyncToken = input.currentSyncToken;
  }
}

export async function buildProjectTaskBoard(input: {
  projectId: string;
  projectRootPath: string;
}): Promise<ProjectTaskBoardRecord> {
  const [documents, taskMaster] = await Promise.all([
    collectProjectDocumentReferences(input.projectRootPath),
    collectTaskMasterSummary(input.projectRootPath)
  ]);

  return {
    projectId: input.projectId,
    projectRootPath: input.projectRootPath,
    collectedAt: new Date().toISOString(),
    documents,
    tasks: taskMaster.tasks,
    taskMaster: {
      available: taskMaster.available,
      sourcePath: taskMaster.sourcePath,
      sourceUpdatedAt: taskMaster.sourceUpdatedAt,
      syncToken: taskMaster.syncToken,
      scannedPaths: taskMaster.scannedPaths,
      taskCount: taskMaster.taskCount,
      counts: taskMaster.counts,
      notes: taskMaster.notes
    }
  };
}

async function collectProjectDocumentReferences(
  projectRootPath: string
): Promise<ProjectDocumentReferenceRecord[]> {
  const references: ProjectDocumentReferenceRecord[] = [];

  for (const spec of DOCUMENT_REFERENCE_SPECS) {
    const resolvedPath =
      spec.dynamic === "latest_test_report"
        ? await findLatestTestReportPath(projectRootPath)
        : path.join(projectRootPath, spec.relativePath!);

    if (!resolvedPath) {
      references.push({
        id: spec.id,
        label: spec.label,
        type: spec.type,
        path: path.join(projectRootPath, "docs", "testing"),
        exists: false,
        updatedAt: null
      });
      continue;
    }

    const metadata = await readFileMetadata(resolvedPath);
    references.push({
      id: spec.id,
      label: spec.label,
      type: spec.type,
      path: resolvedPath,
      exists: metadata.exists,
      updatedAt: metadata.updatedAt
    });
  }

  return references;
}

async function findLatestTestReportPath(projectRootPath: string): Promise<string | null> {
  const testingDirectoryPath = path.join(projectRootPath, "docs", "testing");
  const entries = await readdir(testingDirectoryPath, { withFileTypes: true }).catch(() => []);
  const reportFiles = entries
    .filter((entry) => entry.isFile() && /^TEST_REPORT.*\.md$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const latestReportFile = reportFiles[0];
  if (!latestReportFile) {
    return null;
  }

  return path.join(testingDirectoryPath, latestReportFile);
}

async function readFileMetadata(filePath: string): Promise<{ exists: boolean; updatedAt: string | null }> {
  try {
    const info = await stat(filePath);
    return {
      exists: true,
      updatedAt: info.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      updatedAt: null
    };
  }
}

async function collectTaskMasterSummary(projectRootPath: string): Promise<
  TaskMasterSummaryRecord & {
    tasks: ProjectTaskRecord[];
  }
> {
  const scannedPaths = TASKMASTER_CANDIDATE_RELATIVE_PATHS.map((relativePath) =>
    path.join(projectRootPath, relativePath)
  );

  const sourcePath = await findFirstExistingPath(scannedPaths);
  if (!sourcePath) {
    return {
      available: false,
      sourcePath: null,
      sourceUpdatedAt: null,
      syncToken: null,
      scannedPaths,
      taskCount: 0,
      counts: createEmptyTaskStatusCounts(),
      notes: ["未发现 TaskMaster 任务文件，当前仅展示项目文档基线。"],
      tasks: []
    };
  }

  try {
    const snapshot = await readTaskMasterSourceSnapshot(sourcePath);
    const parsed = JSON.parse(snapshot.raw) as unknown;
    const tasks = normalizeTaskMasterTasks(parsed, sourcePath);

    return {
      available: true,
      sourcePath,
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
      syncToken: snapshot.syncToken,
      scannedPaths,
      taskCount: tasks.length,
      counts: countTaskStatuses(tasks),
      notes:
        tasks.length > 0
          ? ["TaskMaster 已接入可执行工作台，任务修改会显式写回本地文件。"]
          : ["已发现 TaskMaster 文件，但没有解析到任务条目。"],
      tasks
    };
  } catch (error) {
    return {
      available: true,
      sourcePath,
      sourceUpdatedAt: null,
      syncToken: null,
      scannedPaths,
      taskCount: 0,
      counts: createEmptyTaskStatusCounts(),
      notes: [
        error instanceof Error
          ? `TaskMaster 文件读取失败：${error.message}`
          : "TaskMaster 文件读取失败。"
      ],
      tasks: []
    };
  }
}

async function findFirstExistingPath(candidatePaths: string[]): Promise<string | null> {
  for (const candidatePath of candidatePaths) {
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
}

async function readTaskMasterSourceSnapshot(sourcePath: string): Promise<TaskMasterSourceSnapshot> {
  const [raw, metadata] = await Promise.all([readFile(sourcePath, "utf8"), readFileMetadata(sourcePath)]);
  return {
    sourcePath,
    raw,
    sourceUpdatedAt: metadata.updatedAt,
    syncToken: createHash("sha1").update(raw).digest("hex")
  };
}

function normalizeTaskMasterTasks(parsed: unknown, sourcePath: string): ProjectTaskRecord[] {
  const topLevelTasks = extractTaskArray(parsed);
  const results: ProjectTaskRecord[] = [];

  for (const task of topLevelTasks) {
    flattenTaskNode(task, sourcePath, results, null, 0);
  }

  return results;
}

function extractTaskArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    const objectValue = parsed as Record<string, unknown>;
    if (Array.isArray(objectValue.tasks)) {
      return objectValue.tasks;
    }

    if (objectValue.master && typeof objectValue.master === "object") {
      const masterValue = objectValue.master as Record<string, unknown>;
      if (Array.isArray(masterValue.tasks)) {
        return masterValue.tasks;
      }
    }

    if (Array.isArray(objectValue.items)) {
      return objectValue.items;
    }
  }

  return [];
}

function flattenTaskNode(
  node: unknown,
  sourcePath: string,
  accumulator: ProjectTaskRecord[],
  parentId: string | null,
  nestingLevel: number
): void {
  if (!node || typeof node !== "object") {
    return;
  }

  const value = node as Record<string, unknown>;
  const rawTitle = readString(value, ["title", "name", "task"]);
  if (!rawTitle) {
    return;
  }

  const taskId = String(value.id ?? `${parentId ?? "task"}-${accumulator.length + 1}`);
  const relaydeskMetadata = asRecord(value.relaydesk);
  accumulator.push({
    id: taskId,
    sourceType: "taskmaster",
    title: rawTitle,
    status: normalizeTaskStatus(readString(value, ["status", "state"])),
    priority: readString(value, ["priority", "severity"]),
    summary: readString(value, ["summary", "description", "details"]),
    parentId,
    nestingLevel,
    sourcePath,
    assignee:
      readString(relaydeskMetadata ?? value, ["assignee", "owner", "assignedTo"]) ?? null,
    notes: readString(relaydeskMetadata ?? value, ["notes", "note"]) ?? null,
    blockedReason:
      readString(relaydeskMetadata ?? value, ["blockedReason", "blocked_reason"]) ?? null,
    boundSessionId:
      readString(relaydeskMetadata ?? value, ["boundSessionId", "sessionId"]) ?? null,
    boundRunId: readString(relaydeskMetadata ?? value, ["boundRunId", "runId"]) ?? null,
    timeline: normalizeTaskTimeline(relaydeskMetadata?.timeline),
    updatedAt: readString(value, ["updatedAt", "updated_at", "lastUpdated", "modifiedAt"])
  });

  const subtasks = Array.isArray(value.subtasks)
    ? value.subtasks
    : Array.isArray(value.children)
      ? value.children
      : [];
  for (const subtask of subtasks) {
    flattenTaskNode(subtask, sourcePath, accumulator, taskId, nestingLevel + 1);
  }
}

function readString(value: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const candidate = value[field];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeTaskTimeline(raw: unknown): ProjectTaskTimelineEventRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item, index) => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }

    const summary = readString(record, ["summary", "label", "title"]);
    const type = readString(record, ["type"]) as ProjectTaskTimelineEventType | null;
    const createdAt = readString(record, ["createdAt", "created_at", "timestamp"]);
    if (!summary || !type || !createdAt) {
      return [];
    }

    return [
      {
        id: String(record.id ?? `timeline-${index + 1}`),
        type,
        summary,
        detail: readString(record, ["detail", "description"]),
        createdAt
      }
    ];
  });
}

function normalizeTaskStatus(rawStatus: string | null): ProjectTaskStatus {
  if (!rawStatus) {
    return "unknown";
  }

  const normalized = rawStatus.trim().toLowerCase();
  if (["todo", "pending", "open", "planned", "backlog"].includes(normalized)) {
    return "todo";
  }

  if (["doing", "in-progress", "in_progress", "in progress", "active"].includes(normalized)) {
    return "in_progress";
  }

  if (["done", "completed", "complete", "closed"].includes(normalized)) {
    return "done";
  }

  if (["blocked", "paused", "waiting"].includes(normalized)) {
    return "blocked";
  }

  return "unknown";
}

function createEmptyTaskStatusCounts(): ProjectTaskStatusCounts {
  return {
    todo: 0,
    inProgress: 0,
    done: 0,
    blocked: 0,
    unknown: 0
  };
}

function countTaskStatuses(tasks: ProjectTaskRecord[]): ProjectTaskStatusCounts {
  const counts = createEmptyTaskStatusCounts();
  for (const task of tasks) {
    if (task.status === "todo") {
      counts.todo += 1;
      continue;
    }

    if (task.status === "in_progress") {
      counts.inProgress += 1;
      continue;
    }

    if (task.status === "done") {
      counts.done += 1;
      continue;
    }

    if (task.status === "blocked") {
      counts.blocked += 1;
      continue;
    }

    counts.unknown += 1;
  }

  return counts;
}

export async function findTaskMasterSourcePath(projectRootPath: string): Promise<string | null> {
  const scannedPaths = TASKMASTER_CANDIDATE_RELATIVE_PATHS.map((relativePath) =>
    path.join(projectRootPath, relativePath)
  );
  return findFirstExistingPath(scannedPaths);
}

export async function updateTaskMasterTask(
  projectRootPath: string,
  taskId: string,
  mutation: TaskMutationInput,
  options: {
    expectedSyncToken?: string | null;
    forceOverwrite?: boolean;
  } = {}
): Promise<string> {
  const sourcePath = await findTaskMasterSourcePath(projectRootPath);
  if (!sourcePath) {
    throw new Error("TaskMaster source file not found");
  }

  const snapshot = await readTaskMasterSourceSnapshot(sourcePath);
  if (
    !options.forceOverwrite &&
    options.expectedSyncToken &&
    snapshot.syncToken.trim().length > 0 &&
    options.expectedSyncToken !== snapshot.syncToken
  ) {
    throw new TaskMasterSyncConflictError({
      sourcePath: snapshot.sourcePath,
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
      currentSyncToken: snapshot.syncToken
    });
  }

  const parsed = JSON.parse(snapshot.raw) as unknown;
  const updatedAt = new Date().toISOString();

  const updated = mutateTaskTree(parsed, taskId, (task) => {
    if (mutation.status) {
      task.status = mutation.status;
    }

    setStringField(task, "summary", mutation.summary);
    setStringField(task, "updatedAt", updatedAt);

    const relaydesk = ensureNestedRecord(task, "relaydesk");
    setStringField(relaydesk, "assignee", mutation.assignee);
    setStringField(relaydesk, "notes", mutation.notes);
    setStringField(relaydesk, "blockedReason", mutation.blockedReason);
    setStringField(relaydesk, "boundSessionId", mutation.boundSessionId);
    setStringField(relaydesk, "boundRunId", mutation.boundRunId);

    if (mutation.timelineEvent) {
      const timeline = ensureArray(relaydesk, "timeline");
      timeline.unshift({
        id: `${taskId}-${Date.now()}`,
        type: mutation.timelineEvent.type,
        summary: mutation.timelineEvent.summary,
        ...(mutation.timelineEvent.detail ? { detail: mutation.timelineEvent.detail } : {}),
        createdAt: mutation.timelineEvent.createdAt ?? updatedAt
      });
    }

    cleanupEmptyRelaydesk(relaydesk, task);
  });

  if (!updated) {
    throw new Error("Task not found in TaskMaster file");
  }

  await writeFile(sourcePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return sourcePath;
}

function mutateTaskTree(
  root: unknown,
  taskId: string,
  mutate: (task: Record<string, unknown>) => void
): boolean {
  const tasks = extractTaskArray(root);
  return mutateTaskArray(tasks, taskId, mutate);
}

function mutateTaskArray(
  tasks: unknown[],
  taskId: string,
  mutate: (task: Record<string, unknown>) => void
): boolean {
  for (const item of tasks) {
    const task = asRecord(item);
    if (!task) {
      continue;
    }

    if (String(task.id ?? "") === taskId) {
      mutate(task);
      return true;
    }

    const subtasks = Array.isArray(task.subtasks)
      ? task.subtasks
      : Array.isArray(task.children)
        ? task.children
        : [];
    if (mutateTaskArray(subtasks, taskId, mutate)) {
      return true;
    }
  }

  return false;
}

function ensureNestedRecord(
  document: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const existing = asRecord(document[key]);
  if (existing) {
    return existing;
  }

  const created: Record<string, unknown> = {};
  document[key] = created;
  return created;
}

function ensureArray(document: Record<string, unknown>, key: string): Record<string, unknown>[] {
  if (Array.isArray(document[key])) {
    return document[key] as Record<string, unknown>[];
  }

  const created: Record<string, unknown>[] = [];
  document[key] = created;
  return created;
}

function setStringField(
  document: Record<string, unknown>,
  key: string,
  value: string | null | undefined
): void {
  if (value === undefined) {
    return;
  }

  if (value === null || value.trim().length === 0) {
    delete document[key];
    return;
  }

  document[key] = value.trim();
}

function cleanupEmptyRelaydesk(
  relaydesk: Record<string, unknown>,
  task: Record<string, unknown>
): void {
  const timeline = Array.isArray(relaydesk.timeline) ? relaydesk.timeline : [];
  if (timeline.length === 0) {
    delete relaydesk.timeline;
  }

  if (Object.keys(relaydesk).length === 0) {
    delete task.relaydesk;
  }
}
