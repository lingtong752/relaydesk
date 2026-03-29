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
      notes: ["当前为 TaskMaster 只读摘要，后续会补双向同步和 RelayDesk 内建任务。"]
    }
  };
}

describe("ProjectTasksOverview", () => {
  it("renders project documents, TaskMaster summary, and task list", () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/tasks">
        <ProjectTasksOverview
          board={createTaskBoard()}
          error={null}
          loading={false}
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
    expect(markup).toContain("只读任务视图");
  });
});
