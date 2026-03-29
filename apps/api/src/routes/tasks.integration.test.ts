import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("task routes integration", () => {
  let app: FastifyInstance;
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "relaydesk-task-workspace-"));
    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "tasks-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("returns project documents and TaskMaster task summary", async () => {
    await mkdir(path.join(workspaceRoot, "docs", "prd"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "docs", "project-management"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "docs", "testing"), { recursive: true });
    await mkdir(path.join(workspaceRoot, ".taskmaster", "tasks"), { recursive: true });

    await writeFile(
      path.join(workspaceRoot, "docs", "prd", "PRODUCT_REQUIREMENTS.zh-CN.md"),
      "# PRD\n",
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "docs", "project-management", "ROADMAP.zh-CN.md"),
      "# Roadmap\n",
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "docs", "project-management", "BACKLOG.zh-CN.md"),
      "# Backlog\n",
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "docs", "testing", "TEST_REPORT-2026-03-29.md"),
      "# Test Report\n",
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, ".taskmaster", "tasks", "tasks.json"),
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "接入任务页",
              status: "in-progress",
              summary: "把任务系统做成正式工作台。",
              priority: "high",
              subtasks: [
                {
                  id: "TASK-1.1",
                  title: "补 API 路由",
                  status: "done"
                }
              ]
            },
            {
              id: "TASK-2",
              title: "补 TaskMaster 摘要",
              status: "blocked"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const authHeader = await registerAndAuthenticate(app);
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "tasks-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const boardResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/tasks`,
      headers: authHeader
    });

    expect(boardResponse.statusCode).toBe(200);
    expect(boardResponse.json()).toEqual({
      board: expect.objectContaining({
        projectId,
        projectRootPath: workspaceRoot,
        documents: expect.arrayContaining([
          expect.objectContaining({
            id: "prd",
            exists: true
          }),
          expect.objectContaining({
            id: "test-report",
            exists: true
          })
        ]),
        tasks: expect.arrayContaining([
          expect.objectContaining({
            id: "TASK-1",
            title: "接入任务页",
            status: "in_progress",
            sourceType: "taskmaster"
          }),
          expect.objectContaining({
            id: "TASK-1.1",
            parentId: "TASK-1",
            status: "done"
          }),
          expect.objectContaining({
            id: "TASK-2",
            status: "blocked"
          })
        ]),
        taskMaster: expect.objectContaining({
          available: true,
          taskCount: 3,
          sourcePath: path.join(workspaceRoot, ".taskmaster", "tasks", "tasks.json"),
          counts: {
            todo: 0,
            inProgress: 1,
            done: 1,
            blocked: 1,
            unknown: 0
          }
        })
      })
    });
  });
});

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "tasks@example.com",
      password: "password123"
    }
  });

  const body = response.json() as { token: string };
  return {
    authorization: `Bearer ${body.token}`
  };
}
