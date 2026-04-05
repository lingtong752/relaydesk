import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
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

  it("updates TaskMaster tasks and starts runs from the task workspace", async () => {
    await mkdir(path.join(workspaceRoot, ".taskmaster", "tasks"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".taskmaster", "tasks", "tasks.json"),
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "推进任务工作台",
              status: "todo",
              summary: "先把任务改成可执行面板。"
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
        name: "tasks-execution-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader,
      payload: {
        title: "Task Session",
        provider: "claude"
      }
    });
    const sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/tasks/TASK-1`,
      headers: authHeader,
      payload: {
        status: "in_progress",
        assignee: "Alice",
        notes: "进入实现阶段。"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      board: expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({
            id: "TASK-1",
            status: "in_progress",
            assignee: "Alice",
            notes: "进入实现阶段。"
          })
        ])
      }),
      task: expect.objectContaining({
        id: "TASK-1",
        status: "in_progress"
      })
    });

    const startRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks/TASK-1/start-run`,
      headers: authHeader,
      payload: {
        sessionId,
        objective: "推进任务：任务工作台",
        constraints: "保持验证链路完整"
      }
    });

    expect(startRunResponse.statusCode).toBe(200);
    expect(startRunResponse.json()).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: "TASK-1",
          boundSessionId: sessionId,
          boundRunId: expect.any(String),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              type: "run_started"
            })
          ])
        }),
        run: expect.objectContaining({
          status: "waiting_human",
          objective: "推进任务：任务工作台"
        }),
        approval: expect.objectContaining({
          status: "pending"
        })
      })
    );
  });

  it("returns a sync conflict when TaskMaster changed after the board was loaded", async () => {
    await mkdir(path.join(workspaceRoot, ".taskmaster", "tasks"), { recursive: true });
    const taskFilePath = path.join(workspaceRoot, ".taskmaster", "tasks", "tasks.json");
    await writeFile(
      taskFilePath,
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "保护 TaskMaster 同步",
              status: "todo"
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
        name: "tasks-conflict-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader,
      payload: {
        title: "Conflict Session",
        provider: "claude"
      }
    });
    const sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;

    const boardResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/tasks`,
      headers: authHeader
    });
    const syncToken = (
      boardResponse.json() as { board: { taskMaster: { syncToken: string | null } } }
    ).board.taskMaster.syncToken;
    expect(syncToken).toEqual(expect.any(String));

    await writeFile(
      taskFilePath,
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "保护 TaskMaster 同步",
              status: "blocked",
              relaydesk: {
                notes: "外部流程已经更新这个任务。"
              }
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/tasks/TASK-1`,
      headers: authHeader,
      payload: {
        status: "in_progress",
        expectedSyncToken: syncToken
      }
    });
    expect(updateResponse.statusCode).toBe(409);
    expect(updateResponse.json()).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("显式同步"),
        board: expect.objectContaining({
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: "TASK-1",
              status: "blocked",
              notes: "外部流程已经更新这个任务。"
            })
          ]),
          taskMaster: expect.objectContaining({
            syncToken: expect.any(String),
            sourceUpdatedAt: expect.any(String)
          })
        })
      })
    );

    const startRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks/TASK-1/start-run`,
      headers: authHeader,
      payload: {
        sessionId,
        constraints: "",
        expectedSyncToken: syncToken
      }
    });
    expect(startRunResponse.statusCode).toBe(409);
    expect(startRunResponse.json()).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("显式同步"),
        board: expect.objectContaining({
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: "TASK-1",
              status: "blocked"
            })
          ])
        })
      })
    );

    const forceSaveResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/tasks/TASK-1`,
      headers: authHeader,
      payload: {
        status: "done",
        notes: "保留当前编辑并覆盖外部更新。",
        expectedSyncToken: syncToken,
        forceOverwrite: true
      }
    });
    expect(forceSaveResponse.statusCode).toBe(200);
    expect(forceSaveResponse.json()).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: "TASK-1",
          status: "done",
          notes: "保留当前编辑并覆盖外部更新。"
        })
      })
    );

    const secondSessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader,
      payload: {
        title: "Conflict Session 2",
        provider: "claude"
      }
    });
    const secondSessionId = (secondSessionResponse.json() as { session: { id: string } }).session.id;

    await writeFile(
      taskFilePath,
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "保护 TaskMaster 同步",
              status: "blocked",
              relaydesk: {
                notes: "再次发生了外部更新。"
              }
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const refreshedBoardResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/tasks`,
      headers: authHeader
    });
    const staleSyncToken = (
      refreshedBoardResponse.json() as { board: { taskMaster: { syncToken: string | null } } }
    ).board.taskMaster.syncToken;
    expect(staleSyncToken).toEqual(expect.any(String));

    await writeFile(
      taskFilePath,
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "保护 TaskMaster 同步",
              status: "blocked",
              relaydesk: {
                notes: "外部更新之后准备再次启动 run。"
              }
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const forceRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks/TASK-1/start-run`,
      headers: authHeader,
      payload: {
        sessionId: secondSessionId,
        objective: "推进任务：冲突覆盖运行",
        constraints: "",
        expectedSyncToken: staleSyncToken,
        forceOverwrite: true
      }
    });
    expect(forceRunResponse.statusCode).toBe(200);
    expect(forceRunResponse.json()).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: "TASK-1",
          boundSessionId: secondSessionId,
          boundRunId: expect.any(String)
        }),
        run: expect.objectContaining({
          objective: "推进任务：冲突覆盖运行"
        })
      })
    );
  });

  it("returns stable negative contracts for task route guards and run bootstrap", async () => {
    await mkdir(path.join(workspaceRoot, ".taskmaster", "tasks"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".taskmaster", "tasks", "tasks.json"),
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "负向合同测试",
              status: "todo"
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
        name: "tasks-negative-contracts",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const invalidProjectTasksResponse = await app.inject({
      method: "GET",
      url: "/api/projects/not-an-object-id/tasks",
      headers: authHeader
    });
    expect(invalidProjectTasksResponse.statusCode).toBe(400);
    expect(invalidProjectTasksResponse.json()).toEqual({
      message: "Invalid project id"
    });

    const missingProjectTasksResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${new ObjectId().toHexString()}/tasks`,
      headers: authHeader
    });
    expect(missingProjectTasksResponse.statusCode).toBe(404);
    expect(missingProjectTasksResponse.json()).toEqual({
      message: "Project not found"
    });

    const invalidPatchPayloadResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/tasks/TASK-1`,
      headers: authHeader,
      payload: {
        status: "unexpected"
      }
    });
    expect(invalidPatchPayloadResponse.statusCode).toBe(400);
    expect(invalidPatchPayloadResponse.json()).toEqual({
      message: "Invalid payload"
    });

    const invalidSessionIdStartRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks/TASK-1/start-run`,
      headers: authHeader,
      payload: {
        sessionId: "invalid-session-id",
        constraints: ""
      }
    });
    expect(invalidSessionIdStartRunResponse.statusCode).toBe(400);
    expect(invalidSessionIdStartRunResponse.json()).toEqual({
      message: "Invalid session id"
    });

    const missingSessionStartRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks/TASK-1/start-run`,
      headers: authHeader,
      payload: {
        sessionId: new ObjectId().toHexString(),
        constraints: ""
      }
    });
    expect(missingSessionStartRunResponse.statusCode).toBe(404);
    expect(missingSessionStartRunResponse.json()).toEqual({
      message: "Session not found"
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
