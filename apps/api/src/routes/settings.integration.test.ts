import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("settings routes integration", () => {
  let app: FastifyInstance;
  let configHomeDir: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    configHomeDir = await mkdtemp(path.join(os.tmpdir(), "relaydesk-settings-home-"));
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "relaydesk-settings-workspace-"));
    await seedSettingsFixtures(configHomeDir, workspaceRoot);

    app = await createApp({
      db: createInMemoryDatabase(),
      configHomeDir,
      jwtSecret: "settings-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(configHomeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("returns a read-only summary of local CLI settings for the current project", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "relaydesk",
        rootPath: workspaceRoot
      }
    });
    const projectBody = projectResponse.json() as { project: { id: string } };

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${projectBody.project.id}/settings`,
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      settings: {
        projectRootPath: string;
        providers: Array<{
          provider: string;
          status: string;
          model?: string | null;
          reasoningEffort?: string | null;
          allowedTools: string[];
          mcpServers: Array<{ name: string; scope: string; transport: string; enabled?: boolean }>;
          sources: Array<{ label: string; exists: boolean }>;
        }>;
      };
    };

    expect(body.settings.projectRootPath).toBe(workspaceRoot);

    const codex = body.settings.providers.find((provider) => provider.provider === "codex");
    expect(codex).toEqual(
      expect.objectContaining({
        status: "configured",
        model: "gpt-5.4",
        reasoningEffort: "xhigh"
      })
    );
    expect(codex?.mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "playwright", scope: "global", transport: "stdio" }),
        expect.objectContaining({ name: "localdocs", scope: "project", transport: "sse" })
      ])
    );

    const claude = body.settings.providers.find((provider) => provider.provider === "claude");
    expect(claude).toEqual(
      expect.objectContaining({
        status: "configured",
        model: "claude-3-7-sonnet-latest",
        reasoningEffort: "claude-opus-4-1",
        allowedTools: ["Bash", "Edit"]
      })
    );
    expect(claude?.mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "linear", scope: "project", transport: "stdio" }),
        expect.objectContaining({ name: "design", scope: "project", transport: "sse", enabled: false })
      ])
    );

    const cursor = body.settings.providers.find((provider) => provider.provider === "cursor");
    expect(cursor).toEqual(
      expect.objectContaining({
        status: "configured"
      })
    );
    expect(cursor?.mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "browser", scope: "global", transport: "stdio" })
      ])
    );

    const gemini = body.settings.providers.find((provider) => provider.provider === "gemini");
    expect(gemini).toEqual(
      expect.objectContaining({
        status: "configured",
        model: "gemini-2.5-pro"
      })
    );
    expect(gemini?.mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "workspace", scope: "global", transport: "stdio" })
      ])
    );
  });

  it("writes Claude provider settings back to local CLI config files", async () => {
    const { projectId, authHeader } = await createProjectAndAuth(app, workspaceRoot);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/settings/providers/claude`,
      headers: authHeader,
      payload: {
        model: "claude-4-sonnet",
        reasoningEffort: "claude-opus-4-1",
        allowedTools: ["Bash", "Edit", "LS"],
        disallowedTools: ["WebSearch"],
        mcpServers: [
          {
            provider: "claude",
            name: "linear",
            scope: "project",
            sourcePath: path.join(configHomeDir, ".claude.json"),
            transport: "stdio",
            command: "npx linear-mcp",
            enabled: true
          },
          {
            provider: "claude",
            name: "design",
            scope: "project",
            sourcePath: path.join(workspaceRoot, ".mcp.json"),
            transport: "sse",
            url: "http://127.0.0.1:3100/sse",
            enabled: true
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      settings: {
        providers: Array<{ provider: string; model?: string | null; allowedTools: string[] }>;
      };
    };
    const claude = body.settings.providers.find((provider) => provider.provider === "claude");
    expect(claude).toEqual(
      expect.objectContaining({
        model: "claude-4-sonnet",
        allowedTools: ["Bash", "Edit", "LS"]
      })
    );

    const localSettings = JSON.parse(
      await readFile(path.join(workspaceRoot, ".claude", "settings.local.json"), "utf8")
    ) as {
      env?: Record<string, string>;
      permissions?: { allow?: string[]; deny?: string[] };
      enabledMcpjsonServers?: string[];
    };
    expect(localSettings.env?.ANTHROPIC_MODEL).toBe("claude-4-sonnet");
    expect(localSettings.permissions?.allow).toEqual(["Bash", "Edit", "LS"]);
    expect(localSettings.permissions?.deny).toEqual(["WebSearch"]);
    expect(localSettings.enabledMcpjsonServers).toEqual(["design"]);

    const projectMcp = JSON.parse(
      await readFile(path.join(workspaceRoot, ".mcp.json"), "utf8")
    ) as {
      mcpServers?: Record<string, { url?: string }>;
    };
    expect(projectMcp.mcpServers?.design?.url).toBe("http://127.0.0.1:3100/sse");
  });

  it("writes Codex provider settings back to config.toml files", async () => {
    const { projectId, authHeader } = await createProjectAndAuth(app, workspaceRoot);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/settings/providers/codex`,
      headers: authHeader,
      payload: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        mcpServers: [
          {
            provider: "codex",
            name: "playwright",
            scope: "global",
            sourcePath: path.join(configHomeDir, ".codex", "config.toml"),
            transport: "stdio",
            command: "npx playwright-mcp",
            enabled: true
          },
          {
            provider: "codex",
            name: "localdocs",
            scope: "project",
            sourcePath: path.join(workspaceRoot, ".codex", "config.toml"),
            transport: "sse",
            url: "http://127.0.0.1:4444/sse",
            enabled: true
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const projectToml = await readFile(path.join(workspaceRoot, ".codex", "config.toml"), "utf8");
    expect(projectToml).toContain('model = "gpt-5.4"');
    expect(projectToml).toContain('model_reasoning_effort = "high"');
    expect(projectToml).toContain('approval_policy = "on-request"');
    expect(projectToml).toContain('sandbox_mode = "workspace-write"');
    expect(projectToml).toContain('[mcp_servers.localdocs]');
    expect(projectToml).toContain('url = "http://127.0.0.1:4444/sse"');

    const globalToml = await readFile(path.join(configHomeDir, ".codex", "config.toml"), "utf8");
    expect(globalToml).toContain('[mcp_servers.playwright]');
    expect(globalToml).toContain('command = "npx playwright-mcp"');
    expect(globalToml).not.toContain('model_reasoning_effort = "high"');
  });
});

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "settings@example.com",
      password: "password123"
    }
  });

  const registerBody = registerResponse.json() as { token: string };
  return { authorization: `Bearer ${registerBody.token}` };
}

async function createProjectAndAuth(
  app: FastifyInstance,
  workspaceRoot: string
): Promise<{ projectId: string; authHeader: { authorization: string } }> {
  const authHeader = await registerAndAuthenticate(app);
  const projectResponse = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: authHeader,
    payload: {
      name: "relaydesk",
      rootPath: workspaceRoot
    }
  });
  const projectBody = projectResponse.json() as { project: { id: string } };
  return {
    projectId: projectBody.project.id,
    authHeader
  };
}

async function seedSettingsFixtures(homeDir: string, workspaceRoot: string): Promise<void> {
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await writeFile(
    path.join(homeDir, ".codex", "config.toml"),
    [
      'model = "gpt-5.4"',
      'model_reasoning_effort = "xhigh"',
      "",
      '[mcp_servers.playwright]',
      'command = "npx"'
    ].join("\n"),
    "utf8"
  );

  await mkdir(path.join(workspaceRoot, ".codex"), { recursive: true });
  await writeFile(
    path.join(workspaceRoot, ".codex", "config.toml"),
    [
      '[mcp_servers.localdocs]',
      'url = "http://127.0.0.1:7777/sse"'
    ].join("\n"),
    "utf8"
  );

  await mkdir(path.join(homeDir, ".claude"), { recursive: true });
  await mkdir(path.join(workspaceRoot, ".claude"), { recursive: true });
  await writeFile(
    path.join(homeDir, ".claude", "settings.json"),
    JSON.stringify(
      {
        env: {
          ANTHROPIC_MODEL: "claude-3-7-sonnet-latest",
          ANTHROPIC_REASONING_MODEL: "claude-opus-4-1"
        },
        language: "zh-CN"
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(workspaceRoot, ".claude", "settings.json"),
    JSON.stringify(
      {
        language: "zh-CN"
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(homeDir, ".claude.json"),
    JSON.stringify(
      {
        projects: {
          [path.resolve(workspaceRoot)]: {
            allowedTools: ["Bash", "Edit"],
            mcpServers: {
              linear: {
                command: "npx",
                transportType: "stdio"
              }
            },
            disabledMcpjsonServers: ["design"]
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(workspaceRoot, ".mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          design: {
            url: "http://127.0.0.1:3001/sse"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await writeFile(
    path.join(homeDir, ".cursor", "argv.json"),
    '{\n  // keep comments to verify JSONC parsing\n  "enable-crash-reporter": true\n}\n',
    "utf8"
  );
  await writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          browser: {
            command: "cursor-browser-mcp"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await mkdir(path.join(homeDir, ".gemini"), { recursive: true });
  await writeFile(
    path.join(homeDir, ".gemini", "settings.json"),
    JSON.stringify(
      {
        model: "gemini-2.5-pro",
        mcpServers: {
          workspace: {
            command: "gemini-workspace-mcp"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
}
