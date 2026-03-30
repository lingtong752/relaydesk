import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import type { ProjectTaskBoardRecord } from "@shared";
import { describe, expect, it } from "vitest";
import { ProjectTasksOverview } from "./WorkspaceTasksPage";

function createTaskBoard(): ProjectTaskBoardRecord {
  return {
    projectId: "project-demo",
    projectRootPath: "/tmp/relaydesk",
    collectedAt: "2026-03-29T06:00:00.000Z",
    documents: [
      {
        id: "prd",
        label: "PRD",
        type: "prd",
        path: "/tmp/relaydesk/docs/prd/PRODUCT_REQUIREMENTS.zh-CN.md",
        exists: true,
        updatedAt: "2026-03-29T05:00:00.000Z"
      },
      {
        id: "test-report",
        label: "最新测试报告",
        type: "test_report",
        path: "/tmp/relaydesk/docs/testing/TEST_REPORT-2026-03-29.md",
        exists: true,
        updatedAt: "2026-03-29T05:30:00.000Z"
      }
    ],
    tasks: [
      {
        id: "TASK-1",
        sourceType: "taskmaster",
        title: "接入任务页",
        status: "in_progress",
        priority: "high",
        summary: "把任务系统做成正式工作台。",
        nestingLevel: 0,
        assignee: "Alice",
        notes: "先把路由和页面打通。",
        blockedReason: null,
        boundSessionId: "session-1",
        boundRunId: null,
        timeline: [],
        sourcePath: "/tmp/relaydesk/.taskmaster/tasks/tasks.json",
        updatedAt: "2026-03-29T05:10:00.000Z"
      },
      {
        id: "TASK-1.1",
        sourceType: "taskmaster",
        title: "补 API 路由",
        status: "done",
        parentId: "TASK-1",
        nestingLevel: 1,
        assignee: null,
        notes: null,
        blockedReason: null,
        boundSessionId: null,
        boundRunId: "run-1",
        timeline: [
          {
            id: "timeline-1",
            type: "run_started",
            summary: "已从任务面板发起替身运行。",
            detail: "推进任务：补 API 路由",
            createdAt: "2026-03-29T05:20:00.000Z"
          }
        ],
        sourcePath: "/tmp/relaydesk/.taskmaster/tasks/tasks.json",
        updatedAt: "2026-03-29T05:12:00.000Z"
      }
    ],
    taskMaster: {
      available: true,
      sourcePath: "/tmp/relaydesk/.taskmaster/tasks/tasks.json",
      scannedPaths: [
        "/tmp/relaydesk/.taskmaster/tasks/tasks.json",
        "/tmp/relaydesk/.taskmaster/tasks.json"
      ],
      taskCount: 2,
      counts: {
        todo: 0,
        inProgress: 1,
        done: 1,
        blocked: 0,
        unknown: 0
      },
      notes: ["TaskMaster 已接入可执行工作台，任务修改会显式写回本地文件。"]
    }
  };
}

describe("ProjectTasksOverview", () => {
  it("renders project documents, TaskMaster summary, and task list", () => {
    const board = createTaskBoard();
    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/tasks">
        <ProjectTasksOverview
          board={board}
          error={null}
          loading={false}
          pendingConflict={{
            kind: "save",
            task: {
              ...board.tasks[0]!,
              status: "blocked",
              notes: "需要先补充 API 错误态。"
            },
            message: "TaskMaster 文件已在外部更新，请先显式同步后再保存。"
          }}
          projectId="project-demo"
          projectRootPath="/tmp/relaydesk"
        />
      </StaticRouter>
    );

    expect(markup).toContain("任务工作台");
    expect(markup).toContain("TaskMaster");
    expect(markup).toContain("接入任务页");
    expect(markup).toContain("补 API 路由");
    expect(markup).toContain("PRD");
    expect(markup).toContain("任务执行视图");
    expect(markup).toContain("检测到 TaskMaster 同步冲突");
    expect(markup).toContain("保留当前编辑并覆盖");
    expect(markup).toContain("字段分叉");
    expect(markup).toContain("当前编辑：阻塞");
    expect(markup).toContain("最新文件：进行中");
  });
});
