import { renderToStaticMarkup } from "react-dom/server";
import type {
  PluginCatalogRecord,
  PluginHostContextRecord,
  PluginInstallationRecord,
  SessionRecord
} from "@shared";
import { describe, expect, it } from "vitest";
import { ProjectPluginsOverview } from "./WorkspacePluginsPage";

function createCatalog(): PluginCatalogRecord[] {
  return [
    {
      id: "project-pulse",
      sourceType: "builtin",
      sourceRef: null,
      name: "Project Pulse",
      version: "0.1.0",
      description: "项目会话和运行摘要。",
      capabilities: ["summary", "sessions"],
      tabTitle: "Project Pulse",
      routeSegment: "pulse",
      frontendComponent: "project_pulse",
      backendService: "context_snapshot",
      actions: []
    },
    {
      id: "delivery-radar",
      sourceType: "builtin",
      sourceRef: null,
      name: "Delivery Radar",
      version: "0.1.0",
      description: "审批与运行节奏看板。",
      capabilities: ["approvals", "activity"],
      tabTitle: "Delivery Radar",
      routeSegment: "radar",
      frontendComponent: "delivery_radar",
      backendService: "context_snapshot",
      actions: []
    }
  ];
}

function createInstallations(): PluginInstallationRecord[] {
  return [
    {
      installationId: "install-1",
      projectId: "project-demo",
      id: "project-pulse",
      sourceType: "builtin",
      sourceRef: null,
      name: "Project Pulse",
      version: "0.1.0",
      description: "项目会话和运行摘要。",
      capabilities: ["summary", "sessions"],
      tabTitle: "Project Pulse",
      routeSegment: "pulse",
      frontendComponent: "project_pulse",
      backendService: "context_snapshot",
      actions: [
        {
          id: "show-project-root",
          label: "显示项目根目录",
          description: "读取当前项目根目录路径。",
          command: "pwd",
          args: [],
          inputs: [],
          permissions: ["read_project"],
          timeoutMs: 1000
        }
      ],
      enabled: true,
      installedAt: "2026-03-29T01:00:00.000Z",
      updatedAt: "2026-03-29T01:20:00.000Z"
    }
  ];
}

function createPluginContext(): PluginHostContextRecord {
  return {
    projectId: "project-demo",
    projectName: "RelayDesk Demo",
    projectRootPath: "/tmp/relaydesk",
    activeProviders: ["claude", "codex"],
    sessionCount: 4,
    importedSessionCount: 2,
    pendingApprovalCount: 1,
    latestSessions: [
      {
        id: "session-1",
        projectId: "project-demo",
        provider: "claude",
        title: "Imported Claude Session",
        origin: "imported_cli",
        status: "idle",
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:30:00.000Z"
      }
    ] as SessionRecord[],
    activeRun: null,
    latestRun: null
  };
}

describe("ProjectPluginsOverview", () => {
  it("renders installed plugins, catalog entries, and plugin host context", () => {
    const markup = renderToStaticMarkup(
      <ProjectPluginsOverview
        activeActionPluginId={null}
        activeActionType={null}
        actionDrafts={{}}
        catalog={createCatalog()}
        executingActionKey={null}
        error={null}
        installations={createInstallations()}
        latestExecution={null}
        loading={false}
        loadingContext={false}
        notice="插件已安装。"
        onActionInputChange={() => undefined}
        onExecuteAction={async () => undefined}
        onInstall={async () => undefined}
        onSelectInstallation={() => undefined}
        onToggle={async () => undefined}
        pluginContext={createPluginContext()}
        projectId="project-demo"
        projectRootPath="/tmp/relaydesk"
        realtimeState="connected"
        selectedInstallationId="install-1"
        selectedSession={null}
      />
    );

    expect(markup).toContain("插件工作台");
    expect(markup).toContain("Project Pulse");
    expect(markup).toContain("Delivery Radar");
    expect(markup).toContain("内建插件");
    expect(markup).toContain("项目会话和运行摘要");
    expect(markup).toContain("活跃 Provider");
    expect(markup).toContain("Imported Claude Session");
    expect(markup).toContain("插件已安装。");
    expect(markup).toContain("插件动作");
    expect(markup).toContain("显示项目根目录");
  });
});
