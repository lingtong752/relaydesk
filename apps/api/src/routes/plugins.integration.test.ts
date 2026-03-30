import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

const execFileAsync = promisify(execFile);

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
      path.join(workspaceRoot, ".relaydesk", "plugins", "qa-panel.bundle.js"),
      [
        "export function renderRelayDeskPlugin(root, bridge) {",
        "  const state = bridge.getState();",
        "  root.textContent = `plugin:${state.projectId}`;",
        "}"
      ].join("\n"),
      "utf8"
    );
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
          frontend: {
            type: "local_bundle",
            apiVersion: "1.0",
            displayName: "QA Panel",
            entry: "./qa-panel.bundle.js"
          },
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

    const previewResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/preview`,
      headers: authHeader,
      payload: {
        sourceType: "local",
        sourceRef: path.join(workspaceRoot, ".relaydesk", "plugins", "qa-panel.json")
      }
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toEqual({
      plugin: expect.objectContaining({
        id: "qa-panel",
        sourceType: "local",
        version: "0.2.0"
      }),
      alreadyInstalled: false,
      installation: null,
      diff: null
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
        frontend: expect.objectContaining({
          type: "local_bundle",
          entry: "./qa-panel.bundle.js"
        }),
        enabled: true
      })
    });

    const frontendModuleResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins/qa-panel/frontend/module`,
      headers: authHeader
    });
    expect(frontendModuleResponse.statusCode).toBe(200);
    expect(frontendModuleResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "qa-panel"
      }),
      frontend: expect.objectContaining({
        type: "local_bundle",
        displayName: "QA Panel"
      }),
      entryPath: path.join(workspaceRoot, ".relaydesk", "plugins", "qa-panel.bundle.js"),
      code: expect.stringContaining("renderRelayDeskPlugin"),
      integrity: expect.stringMatching(/^sha256-/),
      hostApiVersion: "1.0"
    });
  });

  it("rejects plugin frontend entries that escape the plugin source directory", async () => {
    await mkdir(path.join(workspaceRoot, ".relaydesk", "plugins"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "outside.bundle.js"), "export default function () {}", "utf8");
    await writeFile(
      path.join(workspaceRoot, ".relaydesk", "plugins", "unsafe-panel.json"),
      JSON.stringify(
        {
          id: "unsafe-panel",
          name: "Unsafe Panel",
          version: "0.1.0",
          description: "尝试加载插件目录之外的 bundle。",
          capabilities: ["demo"],
          tabTitle: "Unsafe Panel",
          routeSegment: "unsafe-panel",
          frontend: {
            type: "local_bundle",
            apiVersion: "1.0",
            displayName: "Unsafe Panel",
            entry: "../../outside.bundle.js"
          },
          frontendComponent: "project_pulse",
          backendService: "rpc_bridge",
          actions: [],
          rpcMethods: []
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
        name: "unsafe-plugin-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const installResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/install`,
      headers: authHeader,
      payload: { pluginId: "unsafe-panel" }
    });
    expect(installResponse.statusCode).toBe(200);

    const frontendModuleResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins/unsafe-panel/frontend/module`,
      headers: authHeader
    });
    expect(frontendModuleResponse.statusCode).toBe(404);
    expect(frontendModuleResponse.json()).toEqual({
      message: "Plugin frontend module could not be resolved"
    });
  });

  it("upgrades and uninstalls local plugins while retaining execution history", async () => {
    await mkdir(path.join(workspaceRoot, ".relaydesk", "plugins"), { recursive: true });
    const manifestPath = path.join(workspaceRoot, ".relaydesk", "plugins", "workspace-inspector.json");
    await writeFile(
      manifestPath,
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
          ],
          rpcMethods: []
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
        name: "plugin-lifecycle-demo",
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

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          id: "workspace-inspector",
          name: "Workspace Inspector",
          version: "0.2.0",
          description: "升级后的项目工作区观察插件。",
          capabilities: ["runtime", "audit"],
          tabTitle: "Workspace Inspector",
          routeSegment: "workspace-inspector",
          frontendComponent: "project_pulse",
          backendService: "rpc_bridge",
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
          ],
          rpcMethods: [
            {
              id: "recent-audit",
              label: "读取最近审计记录",
              description: "读取最近 10 条审计事件。",
              handler: "list_recent_audit_events",
              inputs: [],
              permissions: ["read_audit"]
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const previewResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/preview`,
      headers: authHeader,
      payload: {
        sourceType: "local",
        sourceRef: manifestPath
      }
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toEqual({
      plugin: expect.objectContaining({
        id: "workspace-inspector",
        version: "0.2.0",
        backendService: "rpc_bridge"
      }),
      alreadyInstalled: true,
      installation: expect.objectContaining({
        id: "workspace-inspector",
        version: "0.1.0",
        backendService: "context_snapshot"
      }),
      diff: expect.objectContaining({
        hasChanges: true,
        changedFields: expect.arrayContaining(["version", "description", "backendService"]),
        addedCapabilities: ["audit"],
        removedCapabilities: [],
        addedPermissions: ["read_audit"],
        removedPermissions: [],
        addedActions: [],
        removedActions: [],
        changedActions: [],
        addedRpcMethods: ["读取最近审计记录 (recent-audit)"],
        removedRpcMethods: [],
        changedRpcMethods: []
      })
    });

    const upgradeResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/workspace-inspector/upgrade`,
      headers: authHeader
    });
    expect(upgradeResponse.statusCode).toBe(200);
    expect(upgradeResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "workspace-inspector",
        version: "0.2.0",
        backendService: "rpc_bridge",
        rpcMethods: expect.arrayContaining([
          expect.objectContaining({
            id: "recent-audit",
            handler: "list_recent_audit_events"
          })
        ])
      })
    });

    const uninstallResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/workspace-inspector/uninstall`,
      headers: authHeader
    });
    expect(uninstallResponse.statusCode).toBe(200);
    expect(uninstallResponse.json()).toEqual({
      ok: true,
      installation: expect.objectContaining({
        id: "workspace-inspector",
        version: "0.2.0"
      }),
      retainedHistoryCount: 1
    });

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins`,
      headers: authHeader
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      installations: []
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
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "plugin.installed",
          actorType: "user",
          payload: expect.objectContaining({
            pluginId: "workspace-inspector"
          })
        }),
        expect.objectContaining({
          eventType: "plugin.action.executed",
          actorType: "user",
          summary: "Workspace Inspector 执行了动作 show-root。",
          payload: expect.objectContaining({
            pluginId: "workspace-inspector",
            actionId: "show-root",
            command: "pwd",
            success: true
          })
        })
      ])
    );
  });

  it("installs plugins from a git source and exposes backend RPC plus execution history", async () => {
    const gitSourceRoot = await mkdtemp(path.join(os.tmpdir(), "relaydesk-plugin-source-"));
    await writeFile(
      path.join(gitSourceRoot, "relaydesk.plugin.json"),
      JSON.stringify(
        {
          id: "git-radar",
          name: "Git Radar",
          version: "0.1.0",
          description: "通过 git source 安装的插件。",
          capabilities: ["activity", "tasks"],
          tabTitle: "Git Radar",
          routeSegment: "git-radar",
          frontendComponent: "delivery_radar",
          backendService: "rpc_bridge",
          actions: [],
          rpcMethods: [
            {
              id: "task-board",
              label: "任务看板",
              description: "读取当前项目的任务工作台。",
              handler: "list_task_board",
              inputs: [],
              permissions: ["read_project"]
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );
    await execFileAsync("git", ["init"], { cwd: gitSourceRoot, encoding: "utf8" });
    await execFileAsync("git", ["add", "."], { cwd: gitSourceRoot, encoding: "utf8" });
    await execFileAsync(
      "git",
      ["-c", "user.name=RelayDesk", "-c", "user.email=relaydesk@example.com", "commit", "-m", "init"],
      { cwd: gitSourceRoot, encoding: "utf8" }
    );

    await mkdir(path.join(workspaceRoot, ".taskmaster", "tasks"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".taskmaster", "tasks", "tasks.json"),
      JSON.stringify(
        {
          tasks: [
            {
              id: "TASK-1",
              title: "验证插件 RPC",
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
        name: "plugin-git-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const installResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/install`,
      headers: authHeader,
      payload: {
        sourceType: "git",
        sourceRef: gitSourceRoot
      }
    });
    expect(installResponse.statusCode).toBe(200);
    expect(installResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "git-radar",
        sourceType: "git",
        sourceRef: gitSourceRoot,
        rpcMethods: expect.arrayContaining([
          expect.objectContaining({
            id: "task-board",
            handler: "list_task_board"
          })
        ])
      })
    });

    const rpcResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/plugins/git-radar/rpc/task-board/execute`,
      headers: authHeader,
      payload: {
        inputs: {}
      }
    });
    expect(rpcResponse.statusCode).toBe(200);
    expect(rpcResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "git-radar"
      }),
      execution: expect.objectContaining({
        pluginId: "git-radar",
        rpcMethodId: "task-board",
        success: true,
        result: expect.objectContaining({
          board: expect.objectContaining({
            tasks: expect.arrayContaining([
              expect.objectContaining({ id: "TASK-1" })
            ])
          })
        })
      })
    });

    const historyResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/plugins/git-radar/history`,
      headers: authHeader
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toEqual({
      installation: expect.objectContaining({
        id: "git-radar"
      }),
      history: [
        expect.objectContaining({
          pluginId: "git-radar",
          executionKind: "rpc",
          rpcMethodId: "task-board",
          success: true
        })
      ]
    });

    const auditEvents = await app.db.collections.auditEvents.find({}).toArray();
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "plugin.rpc.executed",
          payload: expect.objectContaining({
            pluginId: "git-radar",
            rpcMethodId: "task-board"
          })
        })
      ])
    );

    await rm(gitSourceRoot, { recursive: true, force: true });
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
