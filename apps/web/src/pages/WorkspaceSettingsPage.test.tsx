import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectSettingsSummary } from "@shared";
import { describe, expect, it } from "vitest";
import { ProjectSettingsOverview } from "./WorkspaceSettingsPage";

function createSettingsSummary(): ProjectSettingsSummary {
  return {
    projectId: "project-demo",
    projectRootPath: "/tmp/relaydesk",
    collectedAt: "2026-03-28T12:30:00.000Z",
    providers: [
      {
        provider: "codex",
        status: "configured",
        summary: "model=gpt-5.4 · reasoning=xhigh · 2 个 MCP server",
        sources: [
          {
            label: "Codex 全局配置",
            path: "/Users/test/.codex/config.toml",
            scope: "global",
            exists: true
          }
        ],
        model: "gpt-5.4",
        reasoningEffort: "xhigh",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        toolPermissionMode: "approval=on-request · sandbox=workspace-write",
        allowedTools: [],
        disallowedTools: [],
        mcpServers: [
          {
            provider: "codex",
            name: "playwright",
            scope: "global",
            sourcePath: "/Users/test/.codex/config.toml",
            transport: "stdio",
            command: "npx"
          }
        ],
        notes: ["项目级 `.codex/config.toml` 的同名配置会覆盖全局设置。"]
      },
      {
        provider: "claude",
        status: "partial",
        summary: "已发现 1 个配置源，等待后续同步写回。",
        sources: [
          {
            label: "Claude settings.json",
            path: "/Users/test/.claude/settings.json",
            scope: "global",
            exists: true
          },
          {
            label: "Claude 项目 MCP",
            path: "/tmp/relaydesk/.mcp.json",
            scope: "project",
            exists: false
          }
        ],
        model: null,
        reasoningEffort: null,
        approvalPolicy: null,
        sandboxMode: null,
        toolPermissionMode: null,
        allowedTools: ["Bash"],
        disallowedTools: [],
        mcpServers: [],
        notes: ["未在 `~/.claude.json` 中找到当前工作区的项目级条目。"]
      },
      {
        provider: "cursor",
        status: "configured",
        summary: "发现 1 个 MCP server，暂未开放写回。",
        sources: [
          {
            label: "Cursor MCP",
            path: "/Users/test/.cursor/mcp.json",
            scope: "global",
            exists: true
          }
        ],
        model: null,
        reasoningEffort: null,
        approvalPolicy: null,
        sandboxMode: null,
        toolPermissionMode: null,
        allowedTools: [],
        disallowedTools: [],
        mcpServers: [
          {
            provider: "cursor",
            name: "browser",
            scope: "global",
            sourcePath: "/Users/test/.cursor/mcp.json",
            transport: "stdio",
            command: "cursor-browser-mcp"
          }
        ],
        notes: []
      },
      {
        provider: "gemini",
        status: "configured",
        summary: "model=gemini-2.5-pro · reasoning=medium · approval=on-request · 1 个允许工具",
        sources: [
          {
            label: "Gemini 全局 settings",
            path: "/Users/test/.gemini/settings.json",
            scope: "global",
            exists: true
          }
        ],
        model: "gemini-2.5-pro",
        reasoningEffort: "medium",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        toolPermissionMode: "approval=on-request · sandbox=workspace-write",
        allowedTools: ["ReadFile"],
        disallowedTools: [],
        mcpServers: [],
        notes: []
      }
    ]
  };
}

describe("ProjectSettingsOverview", () => {
  it("renders provider summaries, sources, and MCP state", () => {
    const markup = renderToStaticMarkup(
      <ProjectSettingsOverview
        error={null}
        fallbackRootPath="/tmp/relaydesk"
        loading={false}
        onSaveProvider={async () => undefined}
        saveNotice={null}
        savingProvider={null}
        settings={createSettingsSummary()}
      />
    );

    expect(markup).toContain("CLI 兼容层控制面板");
    expect(markup).toContain("Codex");
    expect(markup).toContain("Claude");
    expect(markup).toContain("Cursor");
    expect(markup).toContain("Gemini");
    expect(markup).toContain("playwright");
    expect(markup).toContain("browser");
    expect(markup).toContain("保存到本地 CLI");
    expect(markup).toContain("当前 provider 仍是只读摘要");
    expect(markup).toContain("Claude / Codex / Gemini 已支持写回本地配置");
    expect(markup).toContain("项目级 `.codex/config.toml` 的同名配置会覆盖全局设置。");
  });
});
