import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("plugin routes integration", () => {
  let app: FastifyInstance;
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "relaydesk-plugin-workspace-"));
    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "plugins-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("installs built-in plugins, toggles state, and returns host context", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "plugins-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const catalogResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins/catalog`,
      headers: authHeader
    });
    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.json()).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({ id: "project-pulse" }),
        expect.objectContaining({ id: "delivery-radar" })
      ])
    });

    const installResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/install`,
      headers: authHeader,
      payload: { pluginId: "project-pulse" }
    });
    expect(installResponse.statusCode).toBe(200);
    expect(installResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "project-pulse",
        projectId,
        enabled: true
      })
    });

    const createdSessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader,
      payload: {
        title: "Imported Claude Session",
        provider: "claude"
      }
    });
    const sessionId = (createdSessionResponse.json() as { session: { id: string } }).session.id;

    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/runs`,
      headers: authHeader,
      payload: {
        sessionId,
        objective: "Review latest patch",
        constraints: "Only inspect code"
      }
    });

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins`,
      headers: authHeader
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      installations: [
        expect.objectContaining({
          id: "project-pulse",
          enabled: true
        })
      ]
    });

    const contextResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins/project-pulse/context`,
      headers: authHeader
    });
    expect(contextResponse.statusCode).toBe(200);
    expect(contextResponse.json()).toEqual({
      installation: expect.objectContaining({ id: "project-pulse" }),
      context: expect.objectContaining({
        projectId,
        projectName: "plugins-demo",
        projectRootPath: workspaceRoot,
        sessionCount: 1,
        pendingApprovalCount: 1,
        latestSessions: [expect.objectContaining({ title: "Imported Claude Session" })]
      })
    });

    const toggleResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/project-pulse/state`,
      headers: authHeader,
      payload: { enabled: false }
    });
    expect(toggleResponse.statusCode).toBe(200);
    expect(toggleResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "project-pulse",
        enabled: false
      })
    });
  });

  it("discovers and installs local plugin manifests from the project workspace", async () => {
    await mkdir(path.join(workspaceRoot, ".relaydesk", "plugins"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".relaydesk", "plugins", "qa-panel.json"),
      JSON.stringify(
        {
          id: "qa-panel",
          name: "QA Panel",
          version: "0.2.0",
          description: "项目本地 QA 观察面板。",
          capabilities: ["quality", "sessions"],
          tabTitle: "QA Panel",
          routeSegment: "qa-panel",
          frontendComponent: "project_pulse",
          backendService: "context_snapshot",
          actions: []
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
        name: "local-plugins-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const catalogResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins/catalog`,
      headers: authHeader
    });
    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.json()).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          id: "qa-panel",
          sourceType: "local",
          sourceRef: path.join(workspaceRoot, ".relaydesk", "plugins", "qa-panel.json")
        })
      ])
    });

    const installResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/install`,
      headers: authHeader,
      payload: { pluginId: "qa-panel" }
    });
    expect(installResponse.statusCode).toBe(200);
    expect(installResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "qa-panel",
        sourceType: "local",
        sourceRef: path.join(workspaceRoot, ".relaydesk", "plugins", "qa-panel.json"),
        enabled: true
      })
    });
  });

  it("executes local plugin actions in controlled mode and records audit events", async () => {
    await mkdir(path.join(workspaceRoot, ".relaydesk", "plugins"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".relaydesk", "plugins", "workspace-inspector.json"),
      JSON.stringify(
        {
          id: "workspace-inspector",
          name: "Workspace Inspector",
          version: "0.1.0",
          description: "检查当前项目工作目录。",
          capabilities: ["runtime"],
          tabTitle: "Workspace Inspector",
          routeSegment: "workspace-inspector",
          frontendComponent: "project_pulse",
          backendService: "context_snapshot",
          actions: [
            {
              id: "show-root",
              label: "显示项目根目录",
              description: "运行 pwd 检查插件工作目录。",
              command: "pwd",
              args: [],
              inputs: [],
              permissions: ["read_project"],
              timeoutMs: 1000
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
        name: "plugin-runtime-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const installResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/install`,
      headers: authHeader,
      payload: { pluginId: "workspace-inspector" }
    });
    expect(installResponse.statusCode).toBe(200);

    const executeResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/workspace-inspector/actions/show-root/execute`,
      headers: authHeader,
      payload: { inputs: {} }
    });

    expect(executeResponse.statusCode).toBe(200);
    const executionBody = executeResponse.json() as {
      installation: { id: string; enabled: boolean };
      execution: { stdout: string; cwd: string };
    };
    expect(executionBody.installation).toMatchObject({
      id: "workspace-inspector",
      enabled: true
    });
    expect(executionBody.execution).toMatchObject({
      pluginId: "workspace-inspector",
      actionId: "show-root",
      command: "pwd",
      success: true,
      exitCode: 0,
      cwd: workspaceRoot
    });
    expect(executionBody.execution.stdout).toContain(path.basename(workspaceRoot));

    const auditEvents = await app.db.collections.auditEvents.find({}).toArray();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      eventType: "plugin.action.executed",
      actorType: "user",
      summary: "Workspace Inspector 执行了动作 show-root。",
      payload: expect.objectContaining({
        pluginId: "workspace-inspector",
        actionId: "show-root",
        command: "pwd",
        success: true
      })
    });
  });
});

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "plugins@example.com",
      password: "password123"
    }
  });

  const body = response.json() as { token: string };
  return {
    authorization: `Bearer ${body.token}`
  };
}
