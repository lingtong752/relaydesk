import { renderToStaticMarkup } from "react-dom/server";
import type {
  PluginCatalogRecord,
  PluginHostContextRecord,
  PluginInstallationRecord,
  PluginPreviewDiffRecord,
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
      sourceVersion: null,
      name: "Project Pulse",
      version: "0.1.0",
      description: "项目会话和运行摘要。",
      capabilities: ["summary", "sessions"],
      tabTitle: "Project Pulse",
      routeSegment: "pulse",
      frontend: {
        type: "builtin",
        apiVersion: "1.0",
        displayName: "Project Pulse",
        builtinComponent: "project_pulse",
        entry: null
      },
      frontendComponent: "project_pulse",
      backendService: "context_snapshot",
      actions: [],
      rpcMethods: []
    },
    {
      id: "delivery-radar",
      sourceType: "builtin",
      sourceRef: null,
      sourceVersion: null,
      name: "Delivery Radar",
      version: "0.1.0",
      description: "审批与运行节奏看板。",
      capabilities: ["approvals", "activity"],
      tabTitle: "Delivery Radar",
      routeSegment: "radar",
      frontend: {
        type: "builtin",
        apiVersion: "1.0",
        displayName: "Delivery Radar",
        builtinComponent: "delivery_radar",
        entry: null
      },
      frontendComponent: "delivery_radar",
      backendService: "context_snapshot",
      actions: [],
      rpcMethods: []
    }
  ];
}

function createSourcePreview(): PluginCatalogRecord {
  return {
    id: "qa-panel",
    sourceType: "local",
    sourceRef: "/tmp/relaydesk/.relaydesk/plugins/qa-panel.json",
    sourceVersion: null,
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
      entry: "/tmp/relaydesk/.relaydesk/plugins/qa-panel/index.js"
    },
    frontendComponent: "project_pulse",
    backendService: "rpc_bridge",
    actions: [],
    rpcMethods: [
      {
        id: "recent-audit",
        label: "读取最近审计记录",
        description: "读取最近审计事件。",
        handler: "list_recent_audit_events",
        inputs: [],
        permissions: ["read_audit"]
      }
    ]
  };
}

function createSourcePreviewInstallation(): PluginInstallationRecord {
  return {
    installationId: "install-qa",
    projectId: "project-demo",
    id: "qa-panel",
    sourceType: "local",
    sourceRef: "/tmp/relaydesk/.relaydesk/plugins/qa-panel.json",
    sourceVersion: null,
    name: "QA Panel",
    version: "0.1.0",
    description: "旧版 QA 面板。",
    capabilities: ["sessions"],
    tabTitle: "QA Panel",
    routeSegment: "qa-panel",
    frontend: {
      type: "builtin",
      apiVersion: "1.0",
      displayName: "QA Panel",
      builtinComponent: "project_pulse",
      entry: null
    },
    frontendComponent: "project_pulse",
    backendService: "context_snapshot",
    actions: [],
    rpcMethods: [],
    enabled: true,
    installedAt: "2026-03-29T01:00:00.000Z",
    updatedAt: "2026-03-29T01:20:00.000Z"
  };
}

function createInstallations(): PluginInstallationRecord[] {
  return [
    {
      installationId: "install-1",
      projectId: "project-demo",
      id: "project-pulse",
      sourceType: "builtin",
      sourceRef: null,
      sourceVersion: null,
      name: "Project Pulse",
      version: "0.1.0",
      description: "项目会话和运行摘要。",
      capabilities: ["summary", "sessions"],
      tabTitle: "Project Pulse",
      routeSegment: "pulse",
      frontend: {
        type: "builtin",
        apiVersion: "1.0",
        displayName: "Project Pulse",
        builtinComponent: "project_pulse",
        entry: null
      },
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
      rpcMethods: [
        {
          id: "context-snapshot",
          label: "读取宿主快照",
          description: "获取宿主上下文。",
          handler: "get_context_snapshot",
          inputs: [],
          permissions: ["read_host_context"]
        }
      ],
      enabled: true,
      installedAt: "2026-03-29T01:00:00.000Z",
      updatedAt: "2026-03-29T01:20:00.000Z"
    }
  ];
}

function createSourcePreviewDiff(): PluginPreviewDiffRecord {
  return {
    hasChanges: true,
    changedFields: ["version", "backendService"],
    addedCapabilities: ["quality"],
    removedCapabilities: [],
    addedPermissions: ["read_audit"],
    removedPermissions: [],
    addedActions: [],
    removedActions: [],
    changedActions: [],
    addedRpcMethods: ["读取最近审计记录 (recent-audit)"],
    removedRpcMethods: [],
    changedRpcMethods: []
  };
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
        executingRpcKey={null}
        error={null}
        installSourceRef=""
        installSourceType="local"
        installSourceVersion=""
        installations={createInstallations()}
        latestExecution={null}
        latestRpcExecution={null}
        loading={false}
        loadingContext={false}
        loadingSourcePreview={false}
        notice="插件已安装。"
        onActionInputChange={() => undefined}
        onExecuteAction={async () => undefined}
        onInstall={async () => undefined}
        onInstallFromSource={async () => undefined}
        onPreviewSource={async () => undefined}
        onInstallSourceRefChange={() => undefined}
        onInstallSourceTypeChange={() => undefined}
        onInstallSourceVersionChange={() => undefined}
        onExecuteRpc={async () => undefined}
        onRpcInputChange={() => undefined}
        onSelectInstallation={() => undefined}
        onToggle={async () => undefined}
        onUninstall={async () => undefined}
        onUpgrade={async () => undefined}
        pluginHistory={[]}
        pluginContext={createPluginContext()}
        projectId="project-demo"
        projectRootPath="/tmp/relaydesk"
        rpcDrafts={{}}
        realtimeState="connected"
        selectedInstallationId="install-1"
        selectedSession={null}
        sourcePreview={createSourcePreview()}
        sourcePreviewDiff={createSourcePreviewDiff()}
        sourcePreviewInstallation={createSourcePreviewInstallation()}
        token="token-demo"
        onExecuteRuntimeRpc={async () => ({
          pluginId: "project-pulse",
          rpcMethodId: "context-snapshot",
          handler: "get_context_snapshot",
          success: true,
          durationMs: 5,
          executedAt: "2026-03-29T01:30:00.000Z",
          result: {}
        })}
      />
    );

    expect(markup).toContain("插件工作台");
    expect(markup).toContain("Project Pulse");
    expect(markup).toContain("Delivery Radar");
    expect(markup).toContain("内建插件");
    expect(markup).toContain("内建前端");
    expect(markup).toContain("项目会话和运行摘要");
    expect(markup).toContain("活跃 Provider");
    expect(markup).toContain("Imported Claude Session");
    expect(markup).toContain("插件已安装。");
    expect(markup).toContain("从 Source 安装");
    expect(markup).toContain("后端 RPC");
    expect(markup).toContain("插件动作");
    expect(markup).toContain("显示项目根目录");
    expect(markup).toContain("当前插件的权限清单");
    expect(markup).toContain("读项目文件");
    expect(markup).toContain("读宿主上下文");
    expect(markup).toContain("升级");
    expect(markup).toContain("卸载");
    expect(markup).toContain("预览 Source");
    expect(markup).toContain("预览结果");
    expect(markup).toContain("QA Panel");
    expect(markup).toContain("读审计记录");
    expect(markup).toContain("Source Diff");
    expect(markup).toContain("和当前安装版本相比会发生这些变化");
    expect(markup).toContain("新增权限");
    expect(markup).toContain("RPC 变化");
    expect(markup).toContain("读取最近审计记录 (recent-audit)");
  });
});
