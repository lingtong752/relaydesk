import path from "node:path";
import { access, readdir, readFile, stat } from "node:fs/promises";
import type {
  ProjectDocumentReferenceRecord,
  ProjectTaskBoardRecord,
  ProjectTaskRecord,
  ProjectTaskStatus,
  ProjectTaskStatusCounts,
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
      scannedPaths,
      taskCount: 0,
      counts: createEmptyTaskStatusCounts(),
      notes: ["未发现 TaskMaster 任务文件，当前仅展示项目文档基线。"],
      tasks: []
    };
  }

  try {
    const raw = await readFile(sourcePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const tasks = normalizeTaskMasterTasks(parsed, sourcePath);

    return {
      available: true,
      sourcePath,
      scannedPaths,
      taskCount: tasks.length,
      counts: countTaskStatuses(tasks),
      notes:
        tasks.length > 0
          ? ["当前为 TaskMaster 只读摘要，后续会补双向同步和 RelayDesk 内建任务。"]
          : ["已发现 TaskMaster 文件，但没有解析到任务条目。"],
      tasks
    };
  } catch (error) {
    return {
      available: true,
      sourcePath,
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
