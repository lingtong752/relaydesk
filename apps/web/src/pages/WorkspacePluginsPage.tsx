import { useEffect, useMemo, useState } from "react";
import type {
  PluginActionExecutionRecord,
  PluginActionPermission,
  PluginCatalogRecord,
  PluginExecutionHistoryRecord,
  PluginHostContextRecord,
  PluginInstallationRecord,
  PluginPreviewDiffRecord,
  PluginRpcExecutionRecord,
  SessionRecord
} from "@shared";
import { PluginHostRuntime } from "../features/plugins/PluginHostRuntime";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { api } from "../lib/api";
import { EmptyState } from "../shared/ui/EmptyState";
import { SectionHeader } from "../shared/ui/SectionHeader";

interface ProjectPluginsOverviewProps {
  projectId: string;
  projectRootPath: string;
  token: string | null;
  catalog: PluginCatalogRecord[];
  installations: PluginInstallationRecord[];
  selectedInstallationId: string;
  loading: boolean;
  loadingContext: boolean;
  error: string | null;
  notice: string | null;
  activeActionPluginId: string | null;
  activeActionType: "install" | "install_source" | "toggle" | "upgrade" | "uninstall" | null;
  actionDrafts: Record<string, Record<string, string>>;
  executingActionKey: string | null;
  latestExecution: PluginActionExecutionRecord | null;
  rpcDrafts: Record<string, Record<string, string>>;
  executingRpcKey: string | null;
  latestRpcExecution: PluginRpcExecutionRecord | null;
  pluginHistory: PluginExecutionHistoryRecord[];
  installSourceType: "local" | "git";
  installSourceRef: string;
  installSourceVersion: string;
  sourcePreview: PluginCatalogRecord | null;
  sourcePreviewInstallation: PluginInstallationRecord | null;
  sourcePreviewDiff: PluginPreviewDiffRecord | null;
  loadingSourcePreview: boolean;
  pluginContext: PluginHostContextRecord | null;
  realtimeState: string;
  selectedSession: SessionRecord | null;
  onInstall(pluginId: string): Promise<void>;
  onInstallFromSource(): Promise<void>;
  onPreviewSource(): Promise<void>;
  onInstallSourceTypeChange(value: "local" | "git"): void;
  onInstallSourceRefChange(value: string): void;
  onInstallSourceVersionChange(value: string): void;
  onSelectInstallation(pluginId: string): void;
  onToggle(pluginId: string, enabled: boolean): Promise<void>;
  onUpgrade(pluginId: string): Promise<void>;
  onUninstall(pluginId: string): Promise<void>;
  onActionInputChange(
    installationId: string,
    actionId: string,
    inputName: string,
    value: string
  ): void;
  onExecuteAction(installation: PluginInstallationRecord, actionId: string): Promise<void>;
  onRpcInputChange(
    installationId: string,
    rpcMethodId: string,
    inputName: string,
    value: string
  ): void;
  onExecuteRpc(installation: PluginInstallationRecord, rpcMethodId: string): Promise<void>;
  onExecuteRuntimeRpc(
    installation: PluginInstallationRecord,
    rpcMethodId: string,
    inputs?: Record<string, string>
  ): Promise<PluginRpcExecutionRecord | null>;
}

const realtimeStateLabelMap: Record<string, string> = {
  connected: "实时连接正常",
  reconnecting: "正在恢复连接",
  connecting: "正在建立连接",
  disconnected: "实时连接已断开"
};

function getRealtimeStateLabel(state: string): string {
  return realtimeStateLabelMap[state] ?? "连接状态未知";
}

function getNextActionLabel(context: PluginHostContextRecord | null): string {
  if (!context) {
    return "先安装并打开一个插件。";
  }

  if (context.pendingApprovalCount > 0) {
    return `优先处理 ${context.pendingApprovalCount} 个待审批动作。`;
  }

  if (context.activeRun) {
    return "先回到替身 Agent 页面继续当前运行。";
  }

  if (context.latestSessions.length > 0) {
    return "继续最近会话，或者切到工具页处理代码与终端。";
  }

  return "先创建或导入一条会话，再让插件消费宿主上下文。";
}

function getActionDraftKey(installationId: string, actionId: string): string {
  return `${installationId}:${actionId}`;
}

function renderCommandPreview(installation: PluginInstallationRecord, actionId: string): string {
  const action = installation.actions.find((item) => item.id === actionId);
  if (!action) {
    return "";
  }

  const previewArgs = action.args.length > 0 ? ` ${action.args.join(" ")}` : "";
  return `${action.command}${previewArgs}`;
}

const highRiskPermissions = new Set<PluginActionPermission>([
  "write_project",
  "execute_command",
  "manage_git",
  "read_audit"
]);

const permissionMetaMap: Record<
  PluginActionPermission,
  {
    label: string;
    description: string;
    tone: "neutral" | "caution" | "danger";
  }
> = {
  read_project: {
    label: "读项目文件",
    description: "允许读取项目目录内的文件与任务信息。",
    tone: "neutral"
  },
  write_project: {
    label: "写项目文件",
    description: "允许改写项目文件，执行前建议确认插件来源可信。",
    tone: "danger"
  },
  execute_command: {
    label: "执行命令",
    description: "允许在项目根目录执行命令，风险最高。",
    tone: "danger"
  },
  read_host_context: {
    label: "读宿主上下文",
    description: "允许读取会话、运行与审批等宿主工作区上下文。",
    tone: "neutral"
  },
  read_audit: {
    label: "读审计记录",
    description: "允许读取项目审计事件与最近操作痕迹。",
    tone: "caution"
  },
  manage_git: {
    label: "管理 Git",
    description: "允许执行写入型 Git 操作，例如切换、提交或回滚。",
    tone: "danger"
  }
};

const pluginPreviewFieldLabelMap: Record<PluginPreviewDiffRecord["changedFields"][number], string> = {
  name: "名称",
  version: "版本",
  description: "描述",
  tabTitle: "Tab 标题",
  routeSegment: "路由标识",
  frontendComponent: "前端视图",
  backendService: "后端服务",
  sourceType: "安装源类型",
  sourceRef: "安装源路径 / 地址",
  sourceVersion: "安装源版本"
};

function getPluginSourceLabel(sourceType: PluginCatalogRecord["sourceType"]): string {
  if (sourceType === "local") {
    return "本地插件";
  }

  if (sourceType === "git") {
    return "Git 插件";
  }

  return "内建插件";
}

function getBackendServiceLabel(
  backendService: PluginCatalogRecord["backendService"]
): string {
  if (backendService === "rpc_bridge") {
    return "后端 RPC";
  }

  if (backendService === "context_snapshot") {
    return "宿主上下文";
  }

  return "无后端服务";
}

function getPluginFrontendLabel(plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "frontend">): string {
  if (plugin.frontend.type === "builtin") {
    return "内建前端";
  }

  if (plugin.frontend.type === "git_bundle") {
    return "Git 前端包";
  }

  return "本地前端包";
}

function getPermissionToneClass(permission: PluginActionPermission): string {
  const tone = permissionMetaMap[permission].tone;
  if (tone === "danger") {
    return "plugin-permission-badge danger";
  }

  if (tone === "caution") {
    return "plugin-permission-badge caution";
  }

  return "plugin-permission-badge";
}

function getPluginPermissions(
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "actions" | "rpcMethods">
): PluginActionPermission[] {
  const ordered: PluginActionPermission[] = [];
  const seen = new Set<PluginActionPermission>();

  for (const action of plugin.actions) {
    for (const permission of action.permissions) {
      if (!seen.has(permission)) {
        seen.add(permission);
        ordered.push(permission);
      }
    }
  }

  for (const method of plugin.rpcMethods) {
    for (const permission of method.permissions) {
      if (!seen.has(permission)) {
        seen.add(permission);
        ordered.push(permission);
      }
    }
  }

  return ordered;
}

function getHighRiskPermissions(permissions: PluginActionPermission[]): PluginActionPermission[] {
  return permissions.filter((permission) => highRiskPermissions.has(permission));
}

function renderDiffBadgeList(
  values: string[],
  emptyMessage: string,
  badgeClassName = "plugin-badge"
): JSX.Element {
  if (values.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="plugin-badge-row">
      {values.map((value) => (
        <span className={badgeClassName} key={value}>
          {value}
        </span>
      ))}
    </div>
  );
}

function buildPermissionConfirmMessage(
  label: string,
  permissions: PluginActionPermission[],
  mode: "action" | "rpc" | "install" | "source_install" | "upgrade" | "uninstall"
): string {
  const riskSummary = permissions.map((permission) => `- ${permissionMetaMap[permission].label}`).join("\n");

  if (mode === "install") {
    return `即将安装插件“${label}”。\n\n它声明了以下高风险权限：\n${riskSummary}\n\n请确认插件来源可信，再继续安装。`;
  }

  if (mode === "source_install") {
    return `即将从外部 Source 安装插件。\n\n外部插件可能请求写文件、执行命令或管理 Git 等高风险权限。\n请确认路径或仓库可信，再继续安装。`;
  }

  if (mode === "upgrade") {
    return `即将刷新插件“${label}”的定义。\n\n升级后的插件仍可能使用这些高风险权限：\n${riskSummary}\n\n请确认来源可信，再继续升级。`;
  }

  if (mode === "uninstall") {
    return `确定要卸载插件“${label}”吗？\n\n插件执行历史和审计记录会保留，但当前项目中的安装记录会被移除。`;
  }

  if (mode === "rpc") {
    return `即将调用插件 RPC“${label}”。\n\n它需要以下高风险权限：\n${riskSummary}\n\n确认后继续。`;
  }

  return `即将执行插件动作“${label}”。\n\n它需要以下高风险权限：\n${riskSummary}\n\n确认后继续。`;
}

function confirmPluginAction(message: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.confirm(message);
}

function PluginPermissionSummary({
  plugin,
  title = "权限摘要",
  description
}: {
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "actions" | "rpcMethods">;
  title?: string;
  description?: string;
}): JSX.Element {
  const permissions = getPluginPermissions(plugin);
  const highRisk = getHighRiskPermissions(permissions);

  return (
    <section className="plugin-runtime-card">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">权限模型</div>
          <h4>{title}</h4>
        </div>
        <span className="muted">{permissions.length} 项权限</span>
      </div>
      {description ? <p className="muted">{description}</p> : null}
      {permissions.length === 0 ? (
        <EmptyState message="当前插件没有声明额外权限，主要依赖宿主上下文与内建视图。" />
      ) : (
        <>
          <div className="plugin-permission-list">
            {permissions.map((permission) => (
              <article className="plugin-permission-card" key={permission}>
                <div className="section-title-row">
                  <strong>{permissionMetaMap[permission].label}</strong>
                  <span className={getPermissionToneClass(permission)}>{permission}</span>
                </div>
                <p className="muted">{permissionMetaMap[permission].description}</p>
              </article>
            ))}
          </div>
          {highRisk.length > 0 ? (
            <div className="warning-box plugin-warning-box">
              这个插件包含 {highRisk.length} 项高风险权限。执行动作、调用 RPC、升级或从 Source 安装时，RelayDesk 会再次提醒确认。
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PluginSourcePreviewCard({
  plugin,
  installation,
  diff
}: {
  plugin: PluginCatalogRecord;
  installation: PluginInstallationRecord | null;
  diff: PluginPreviewDiffRecord | null;
}): JSX.Element {
  const permissions = getPluginPermissions(plugin);
  const highRisk = getHighRiskPermissions(permissions);
  const changedFieldLabels = diff?.changedFields.map((field) => pluginPreviewFieldLabelMap[field]) ?? [];

  return (
    <article className="plugins-catalog-card">
      <div className="section-title-row">
        <div>
          <strong>{plugin.name}</strong>
          <p className="muted">{plugin.description}</p>
        </div>
        <span className="plugin-badge">预览结果</span>
      </div>
      <div className="plugin-badge-row">
        <span className="plugin-badge">{getPluginSourceLabel(plugin.sourceType)}</span>
        <span className="plugin-badge">v{plugin.version}</span>
        <span className="plugin-badge">{getPluginFrontendLabel(plugin)}</span>
        <span className="plugin-badge">{getBackendServiceLabel(plugin.backendService)}</span>
      </div>
      {plugin.sourceRef ? <p className="muted">{plugin.sourceRef}</p> : null}
      {installation ? (
        <div className="info-box">
          当前项目已经安装了这个插件。继续安装会刷新现有安装记录，而不是创建第二份副本。
        </div>
      ) : null}
      {installation && diff ? (
        diff.hasChanges ? (
          <section className="plugin-runtime-card">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">Source Diff</div>
                <h4>和当前安装版本相比会发生这些变化</h4>
              </div>
              <span className="muted">安装前预览</span>
            </div>
            <div className="plugin-permission-list">
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>元信息变化</strong>
                  <span className="muted">{changedFieldLabels.length} 项</span>
                </div>
                {renderDiffBadgeList(changedFieldLabels, "名称、版本、来源和前后端形态都没有变化。")}
              </article>
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>新增能力</strong>
                  <span className="muted">{diff.addedCapabilities.length} 项</span>
                </div>
                {renderDiffBadgeList(diff.addedCapabilities, "没有新增 capability。")}
              </article>
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>移除能力</strong>
                  <span className="muted">{diff.removedCapabilities.length} 项</span>
                </div>
                {renderDiffBadgeList(diff.removedCapabilities, "没有移除 capability。")}
              </article>
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>新增权限</strong>
                  <span className="muted">{diff.addedPermissions.length} 项</span>
                </div>
                {renderDiffBadgeList(
                  diff.addedPermissions.map((permission) => permissionMetaMap[permission].label),
                  "没有新增权限。"
                )}
              </article>
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>移除权限</strong>
                  <span className="muted">{diff.removedPermissions.length} 项</span>
                </div>
                {renderDiffBadgeList(
                  diff.removedPermissions.map((permission) => permissionMetaMap[permission].label),
                  "没有移除权限。"
                )}
              </article>
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>动作变化</strong>
                  <span className="muted">
                    +{diff.addedActions.length} / -{diff.removedActions.length} / ~{diff.changedActions.length}
                  </span>
                </div>
                <p className="muted">新增</p>
                {renderDiffBadgeList(diff.addedActions, "没有新增动作。")}
                <p className="muted">移除</p>
                {renderDiffBadgeList(diff.removedActions, "没有移除动作。")}
                <p className="muted">定义变更</p>
                {renderDiffBadgeList(diff.changedActions, "没有动作定义变化。")}
              </article>
              <article className="plugin-permission-card">
                <div className="section-title-row">
                  <strong>RPC 变化</strong>
                  <span className="muted">
                    +{diff.addedRpcMethods.length} / -{diff.removedRpcMethods.length} / ~{diff.changedRpcMethods.length}
                  </span>
                </div>
                <p className="muted">新增</p>
                {renderDiffBadgeList(diff.addedRpcMethods, "没有新增 RPC。")}
                <p className="muted">移除</p>
                {renderDiffBadgeList(diff.removedRpcMethods, "没有移除 RPC。")}
                <p className="muted">定义变更</p>
                {renderDiffBadgeList(diff.changedRpcMethods, "没有 RPC 定义变化。")}
              </article>
            </div>
          </section>
        ) : (
          <div className="info-box">
            预览中的插件定义和当前安装版本一致。继续安装只会刷新安装记录，不会带来实质能力变化。
          </div>
        )
      ) : null}
      {permissions.length > 0 ? (
        <div className="plugin-badge-row">
          {permissions.map((permission) => (
            <span className={getPermissionToneClass(permission)} key={permission}>
              {permissionMetaMap[permission].label}
            </span>
          ))}
        </div>
      ) : null}
      {highRisk.length > 0 ? (
        <div className="warning-box plugin-warning-box">
          预览发现高风险权限：{highRisk
            .map((permission) => permissionMetaMap[permission].label)
            .join(" · ")}
          。安装时会再次要求确认。
        </div>
      ) : null}
    </article>
  );
}

function renderPluginView(
  installation: PluginInstallationRecord,
  pluginContext: PluginHostContextRecord | null,
  realtimeState: string,
  selectedSession: SessionRecord | null,
  runtimeProps: {
    token: string | null;
    projectId: string;
    projectRootPath: string;
    onExecuteRuntimeRpc(
      installation: PluginInstallationRecord,
      rpcMethodId: string,
      inputs?: Record<string, string>
    ): Promise<PluginRpcExecutionRecord | null>;
  }
): JSX.Element {
  if (!pluginContext) {
    return <div className="muted">正在准备插件上下文...</div>;
  }

  if (installation.frontend.type !== "builtin") {
    return (
      <PluginHostRuntime
        installation={installation}
        onExecuteRpc={runtimeProps.onExecuteRuntimeRpc}
        pluginContext={pluginContext}
        projectId={runtimeProps.projectId}
        projectRootPath={runtimeProps.projectRootPath}
        realtimeState={realtimeState}
        selectedSession={selectedSession}
        token={runtimeProps.token}
      />
    );
  }

  if (installation.frontend.builtinComponent === "delivery_radar") {
    return (
      <DeliveryRadarPluginView
        pluginContext={pluginContext}
        realtimeState={realtimeState}
        selectedSession={selectedSession}
      />
    );
  }

  return (
    <ProjectPulsePluginView
      pluginContext={pluginContext}
      realtimeState={realtimeState}
      selectedSession={selectedSession}
    />
  );
}

function ProjectPulsePluginView({
  pluginContext,
  realtimeState,
  selectedSession
}: {
  pluginContext: PluginHostContextRecord;
  realtimeState: string;
  selectedSession: SessionRecord | null;
}): JSX.Element {
  return (
    <div className="plugin-runtime-stack">
      <div className="plugin-metric-grid">
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">活跃 Provider</span>
          <strong>{pluginContext.activeProviders.length}</strong>
          <p>{pluginContext.activeProviders.join(" · ") || "当前还没有会话来源。"}</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">会话总数</span>
          <strong>{pluginContext.sessionCount}</strong>
          <p>其中 CLI 历史 {pluginContext.importedSessionCount} 条。</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">实时状态</span>
          <strong>{getRealtimeStateLabel(realtimeState)}</strong>
          <p>插件视图会跟随工作区上下文同步刷新。</p>
        </article>
      </div>

      <div className="plugin-runtime-grid">
        <section className="plugin-runtime-card">
          <div className="eyebrow">当前焦点</div>
          <h4>{selectedSession?.title ?? pluginContext.latestSessions[0]?.title ?? "还没有聚焦会话"}</h4>
          <p className="muted">
            {selectedSession
              ? `${selectedSession.provider} · ${selectedSession.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"}`
              : "当前未在宿主工作区选中会话，插件默认展示最近上下文。"}
          </p>
        </section>

        <section className="plugin-runtime-card">
          <div className="eyebrow">运行概览</div>
          <h4>{pluginContext.activeRun ? pluginContext.activeRun.objective : "当前未运行替身"}</h4>
          <p className="muted">
            {pluginContext.activeRun
              ? `状态 ${pluginContext.activeRun.status} · provider ${pluginContext.activeRun.provider}`
              : "插件页会直接消费当前项目的运行状态和最近会话。"}
          </p>
        </section>
      </div>

      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>最近会话</strong>
          <span className="muted">{pluginContext.latestSessions.length} 条上下文</span>
        </div>
        {pluginContext.latestSessions.length === 0 ? (
          <EmptyState message="项目里还没有会话，插件会在会话建立后自动获得宿主上下文。" />
        ) : (
          <div className="plugin-session-list">
            {pluginContext.latestSessions.map((session) => (
              <article className="plugin-session-card" key={session.id}>
                <div className="section-title-row">
                  <strong>{session.title}</strong>
                  <span className="plugin-badge">{session.provider}</span>
                </div>
                <p className="muted">
                  {session.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"} · 最近更新{" "}
                  {new Date(session.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeliveryRadarPluginView({
  pluginContext,
  realtimeState,
  selectedSession
}: {
  pluginContext: PluginHostContextRecord;
  realtimeState: string;
  selectedSession: SessionRecord | null;
}): JSX.Element {
  return (
    <div className="plugin-runtime-stack">
      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Delivery Radar</div>
            <h4>下一步建议</h4>
          </div>
          <span className="plugin-badge">{getRealtimeStateLabel(realtimeState)}</span>
        </div>
        <p className="muted">{getNextActionLabel(pluginContext)}</p>
      </section>

      <div className="plugin-metric-grid">
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">待审批项</span>
          <strong>{pluginContext.pendingApprovalCount}</strong>
          <p>插件可以直接消费审批积压状态。</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">活动运行</span>
          <strong>{pluginContext.activeRun ? pluginContext.activeRun.status : "无"}</strong>
          <p>{pluginContext.activeRun?.objective ?? "当前没有进行中的替身运行。"}</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">当前会话</span>
          <strong>{selectedSession?.provider ?? pluginContext.latestSessions[0]?.provider ?? "无"}</strong>
          <p>{selectedSession?.title ?? pluginContext.latestSessions[0]?.title ?? "还没有会话上下文。"}</p>
        </article>
      </div>

      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>交付节奏</strong>
          <span className="muted">最新 5 条会话</span>
        </div>
        {pluginContext.latestSessions.length === 0 ? (
          <EmptyState message="暂无会话活动，Delivery Radar 会在项目开始推进后形成节奏面板。" />
        ) : (
          <div className="plugin-activity-list">
            {pluginContext.latestSessions.map((session) => (
              <article className="plugin-activity-card" key={session.id}>
                <strong>{session.title}</strong>
                <p className="muted">
                  {session.provider} · {session.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PluginActionPanel({
  actionDrafts,
  executingActionKey,
  installation,
  latestExecution,
  onActionInputChange,
  onExecuteAction
}: {
  actionDrafts: Record<string, Record<string, string>>;
  executingActionKey: string | null;
  installation: PluginInstallationRecord;
  latestExecution: PluginActionExecutionRecord | null;
  onActionInputChange(
    installationId: string,
    actionId: string,
    inputName: string,
    value: string
  ): void;
  onExecuteAction(installation: PluginInstallationRecord, actionId: string): Promise<void>;
}): JSX.Element {
  if (installation.actions.length === 0) {
    return (
      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>插件动作</strong>
          <span className="muted">当前插件未声明本地动作。</span>
        </div>
        <EmptyState message="第一版运行时已经支持插件动作，但这个插件暂时只消费宿主上下文。" />
      </section>
    );
  }

  return (
    <section className="plugin-runtime-card">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">插件动作</div>
          <h4>受控命令执行</h4>
        </div>
        <span className="muted">{installation.actions.length} 个动作</span>
      </div>
      <div className="plugin-action-list">
        {installation.actions.map((action) => {
          const actionKey = getActionDraftKey(installation.installationId, action.id);
          const actionDraft = actionDrafts[actionKey] ?? {};
          const isRunning = executingActionKey === actionKey;
          const execution =
            latestExecution?.pluginId === installation.id && latestExecution.actionId === action.id
              ? latestExecution
              : null;
          return (
            <article className="plugin-action-card" key={action.id}>
              <div className="section-title-row">
                <div>
                  <strong>{action.label}</strong>
                  <p className="muted">{action.description}</p>
                </div>
                <span className="muted">{action.permissions.length} 项权限</span>
              </div>
              <div className="plugin-badge-row">
                {action.permissions.map((permission) => (
                  <span className={getPermissionToneClass(permission)} key={permission}>
                    {permissionMetaMap[permission].label}
                  </span>
                ))}
              </div>
              {getHighRiskPermissions(action.permissions).length > 0 ? (
                <div className="warning-box plugin-warning-box">
                  这个动作会触发高风险权限：{getHighRiskPermissions(action.permissions)
                    .map((permission) => permissionMetaMap[permission].label)
                    .join(" · ")}
                </div>
              ) : null}
              {action.inputs.length > 0 ? (
                <div className="plugin-action-form">
                  {action.inputs.map((input) => (
                    <label className="field-label" key={input.name}>
                      <span>{input.label}</span>
                      <input
                        className="text-input"
                        onChange={(event) =>
                          onActionInputChange(
                            installation.installationId,
                            action.id,
                            input.name,
                            event.target.value
                          )
                        }
                        placeholder={input.placeholder}
                        required={input.required}
                        type="text"
                        value={actionDraft[input.name] ?? input.defaultValue ?? ""}
                      />
                      {input.description ? <small className="muted">{input.description}</small> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted">这个动作不需要额外参数。</p>
              )}
              <div className="plugin-command-preview">
                <strong>命令预览</strong>
                <code>{renderCommandPreview(installation, action.id)}</code>
              </div>
              <div className="plugins-card-actions">
                <button
                  className="primary-button compact"
                  disabled={isRunning}
                  onClick={() => void onExecuteAction(installation, action.id)}
                  type="button"
                >
                  {isRunning ? "执行中..." : "执行动作"}
                </button>
                <span className="muted">
                  超时 {(action.timeoutMs ?? 15000) / 1000}s · 工作目录固定为项目根目录
                </span>
              </div>
              {execution ? (
                <div className={`plugin-execution-result ${execution.success ? "success" : "failure"}`}>
                  <div className="section-title-row">
                    <strong>最近结果</strong>
                    <span className="muted">
                      exit {execution.exitCode ?? "n/a"} · {execution.durationMs}ms
                    </span>
                  </div>
                  {execution.stdout ? (
                    <div>
                      <div className="eyebrow">stdout</div>
                      <pre>{execution.stdout}</pre>
                    </div>
                  ) : null}
                  {execution.stderr ? (
                    <div>
                      <div className="eyebrow">stderr</div>
                      <pre>{execution.stderr}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PluginRpcPanel({
  installation,
  rpcDrafts,
  executingRpcKey,
  latestRpcExecution,
  onRpcInputChange,
  onExecuteRpc
}: {
  installation: PluginInstallationRecord;
  rpcDrafts: Record<string, Record<string, string>>;
  executingRpcKey: string | null;
  latestRpcExecution: PluginRpcExecutionRecord | null;
  onRpcInputChange(
    installationId: string,
    rpcMethodId: string,
    inputName: string,
    value: string
  ): void;
  onExecuteRpc(installation: PluginInstallationRecord, rpcMethodId: string): Promise<void>;
}): JSX.Element {
  if (installation.rpcMethods.length === 0) {
    return (
      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>后端 RPC</strong>
          <span className="muted">当前插件未声明后端 RPC。</span>
        </div>
        <EmptyState message="后续可以通过 manifest 声明 rpcMethods，把插件前端和宿主后端能力接起来。" />
      </section>
    );
  }

  return (
    <section className="plugin-runtime-card">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">后端 RPC</div>
          <h4>插件后端能力</h4>
        </div>
        <span className="muted">{installation.rpcMethods.length} 个方法</span>
      </div>
      <div className="plugin-action-list">
        {installation.rpcMethods.map((method) => {
          const rpcKey = getActionDraftKey(installation.installationId, method.id);
          const rpcDraft = rpcDrafts[rpcKey] ?? {};
          const isRunning = executingRpcKey === rpcKey;
          const execution =
            latestRpcExecution?.pluginId === installation.id &&
            latestRpcExecution.rpcMethodId === method.id
              ? latestRpcExecution
              : null;

          return (
            <article className="plugin-action-card" key={method.id}>
              <div className="section-title-row">
                <div>
                  <strong>{method.label}</strong>
                  <p className="muted">{method.description}</p>
                </div>
                <span className="plugin-badge">{method.handler}</span>
              </div>
              <div className="plugin-badge-row">
                {method.permissions.map((permission) => (
                  <span className={getPermissionToneClass(permission)} key={permission}>
                    {permissionMetaMap[permission].label}
                  </span>
                ))}
              </div>
              {getHighRiskPermissions(method.permissions).length > 0 ? (
                <div className="warning-box plugin-warning-box">
                  这个 RPC 会触发高风险权限：{getHighRiskPermissions(method.permissions)
                    .map((permission) => permissionMetaMap[permission].label)
                    .join(" · ")}
                </div>
              ) : null}
              {method.inputs.length > 0 ? (
                <div className="plugin-action-form">
                  {method.inputs.map((input) => (
                    <label className="field-label" key={input.name}>
                      <span>{input.label}</span>
                      <input
                        className="text-input"
                        onChange={(event) =>
                          onRpcInputChange(
                            installation.installationId,
                            method.id,
                            input.name,
                            event.target.value
                          )
                        }
                        placeholder={input.placeholder}
                        required={input.required}
                        type="text"
                        value={rpcDraft[input.name] ?? input.defaultValue ?? ""}
                      />
                      {input.description ? <small className="muted">{input.description}</small> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted">这个 RPC 不需要额外输入。</p>
              )}
              <div className="plugins-card-actions">
                <button
                  className="primary-button compact"
                  disabled={isRunning}
                  onClick={() => void onExecuteRpc(installation, method.id)}
                  type="button"
                >
                  {isRunning ? "调用中..." : "调用 RPC"}
                </button>
                <span className="muted">
                  {method.permissions.map((permission) => permissionMetaMap[permission].label).join(" · ")}
                </span>
              </div>
              {execution ? (
                <div className={`plugin-execution-result ${execution.success ? "success" : "failure"}`}>
                  <div className="section-title-row">
                    <strong>最近结果</strong>
                    <span className="muted">{execution.durationMs}ms</span>
                  </div>
                  {execution.error ? (
                    <div>
                      <div className="eyebrow">error</div>
                      <pre>{execution.error}</pre>
                    </div>
                  ) : null}
                  {execution.result ? (
                    <div>
                      <div className="eyebrow">result</div>
                      <pre>{JSON.stringify(execution.result, null, 2)}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PluginHistoryPanel({
  history
}: {
  history: PluginExecutionHistoryRecord[];
}): JSX.Element {
  return (
    <section className="plugin-runtime-card">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">执行历史</div>
          <h4>最近插件调用</h4>
        </div>
        <span className="muted">{history.length} 条记录</span>
      </div>
      {history.length === 0 ? (
        <EmptyState message="插件一旦执行动作或 RPC，这里会保留最近历史和结果摘要。" />
      ) : (
        <div className="plugin-activity-list">
          {history.map((entry) => (
            <article className="plugin-activity-card" key={entry.id}>
              <div className="section-title-row">
                <strong>{entry.title}</strong>
                <span className={`plugin-status-pill ${entry.success ? "enabled" : "disabled"}`}>
                  {entry.success ? "成功" : "失败"}
                </span>
              </div>
              <p className="muted">
                {entry.executionKind} · {entry.summary}
              </p>
              <p className="muted">
                {new Date(entry.executedAt).toLocaleString("zh-CN", { hour12: false })} ·{" "}
                {entry.durationMs}ms
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectPluginsOverview({
  projectId,
  projectRootPath,
  token,
  catalog,
  installations,
  selectedInstallationId,
  loading,
  loadingContext,
  error,
  notice,
  activeActionPluginId,
  activeActionType,
  actionDrafts,
  executingActionKey,
  latestExecution,
  rpcDrafts,
  executingRpcKey,
  latestRpcExecution,
  pluginHistory,
  installSourceType,
  installSourceRef,
  installSourceVersion,
  sourcePreview,
  sourcePreviewInstallation,
  sourcePreviewDiff,
  loadingSourcePreview,
  pluginContext,
  realtimeState,
  selectedSession,
  onInstall,
  onInstallFromSource,
  onPreviewSource,
  onInstallSourceTypeChange,
  onInstallSourceRefChange,
  onInstallSourceVersionChange,
  onSelectInstallation,
  onToggle,
  onUpgrade,
  onUninstall,
  onActionInputChange,
  onExecuteAction,
  onRpcInputChange,
  onExecuteRpc,
  onExecuteRuntimeRpc
}: ProjectPluginsOverviewProps): JSX.Element {
  const installedPluginIds = useMemo(
    () => new Set(installations.map((installation) => installation.id)),
    [installations]
  );
  const enabledInstallations = useMemo(
    () => installations.filter((installation) => installation.enabled),
    [installations]
  );
  const selectedInstallation =
    installations.find((installation) => installation.installationId === selectedInstallationId) ?? null;

  return (
    <div className="workspace-route-stack plugins-layout">
      <section className="panel plugins-hero-panel">
        <SectionHeader
          description={projectRootPath}
          eyebrow="插件工作台"
          title="先让插件挂进工作区，再扩展更多宿主能力"
        />
        <div className="plugins-summary-strip">
          <span>已安装 {installations.length} 个插件</span>
          <span>已启用 {enabledInstallations.length} 个插件</span>
          <span>内建目录 {catalog.length} 个插件</span>
        </div>
        {loading ? <p className="muted">正在读取插件目录与安装记录...</p> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="success-box">{notice}</div> : null}
      </section>

      <div className="plugins-grid">
        <section className="panel plugins-installed-panel">
          <SectionHeader
            eyebrow="已安装"
            title="项目内插件"
            description="这里管理安装记录、启停状态和当前打开的插件。"
          />
          {installations.length === 0 ? (
            <EmptyState message="当前项目还没有安装插件，先从右侧目录安装一个。" />
          ) : (
            <div className="plugins-installed-list">
              {installations.map((installation) => {
                const actionBusy = activeActionPluginId === installation.id;
                const selected = installation.installationId === selectedInstallationId;
                return (
                  <article
                    className={`plugins-installed-card ${selected ? "active" : ""}`}
                    key={installation.installationId}
                  >
                    <div className="section-title-row">
                      <div>
                        <strong>{installation.name}</strong>
                        <p className="muted">{installation.description}</p>
                      </div>
                      <span className={`plugin-status-pill ${installation.enabled ? "enabled" : "disabled"}`}>
                        {installation.enabled ? "已启用" : "已停用"}
                      </span>
                    </div>
                  <div className="plugin-badge-row">
                      <span className="plugin-badge">
                        {getPluginSourceLabel(installation.sourceType)}
                      </span>
                      <span className="plugin-badge">v{installation.version}</span>
                      <span className="plugin-badge">{getPluginFrontendLabel(installation)}</span>
                      {installation.capabilities.map((capability) => (
                        <span className="plugin-badge" key={capability}>
                          {capability}
                        </span>
                      ))}
                    </div>
                    {getPluginPermissions(installation).length > 0 ? (
                      <div className="plugin-badge-row">
                        {getPluginPermissions(installation).map((permission) => (
                          <span className={getPermissionToneClass(permission)} key={permission}>
                            {permissionMetaMap[permission].label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {installation.sourceRef ? <p className="muted">{installation.sourceRef}</p> : null}
                    <div className="plugins-card-actions">
                      <button
                        className="secondary-button compact"
                        onClick={() => onSelectInstallation(installation.installationId)}
                        type="button"
                      >
                        打开
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={actionBusy}
                        onClick={() => void onToggle(installation.id, !installation.enabled)}
                        type="button"
                      >
                        {actionBusy && activeActionType === "toggle"
                          ? "处理中..."
                          : installation.enabled
                            ? "停用"
                            : "启用"}
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={actionBusy}
                        onClick={() => void onUpgrade(installation.id)}
                        type="button"
                      >
                        {actionBusy && activeActionType === "upgrade" ? "升级中..." : "升级"}
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={actionBusy}
                        onClick={() => void onUninstall(installation.id)}
                        type="button"
                      >
                        {actionBusy && activeActionType === "uninstall" ? "卸载中..." : "卸载"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel plugins-catalog-panel">
          <SectionHeader
            eyebrow="内建目录"
            title="可以立刻安装的插件"
            description={`项目 ${projectId} 当前同时支持 built-in、local path 和 git repo 三种安装源。`}
          />
          <article className="plugins-catalog-card">
            <div className="section-title-row">
              <div>
                <strong>从 Source 安装</strong>
                <p className="muted">输入本地 manifest 路径，或者 git repo 地址 / 本地 git 仓库路径。</p>
              </div>
              <span className="plugin-badge">扩展安装</span>
            </div>
            <div className="settings-inline-grid">
              <label>
                Source Type
                <select
                  onChange={(event) =>
                    onInstallSourceTypeChange(event.target.value as "local" | "git")
                  }
                  value={installSourceType}
                >
                  <option value="local">local</option>
                  <option value="git">git</option>
                </select>
              </label>
              <label>
                Ref / Branch
                <input
                  onChange={(event) => onInstallSourceVersionChange(event.target.value)}
                  placeholder="可选，例如 main / v0.1.0"
                  value={installSourceVersion}
                />
              </label>
            </div>
            <label className="field-label">
              <span>{installSourceType === "local" ? "本地路径" : "Git 仓库地址"}</span>
              <input
                className="text-input"
                onChange={(event) => onInstallSourceRefChange(event.target.value)}
                placeholder={
                  installSourceType === "local"
                    ? "/path/to/plugin.json 或 /path/to/plugin-directory"
                    : "https://... / git@... / /path/to/local-git-repo"
                }
                type="text"
                value={installSourceRef}
              />
            </label>
            <div className="plugins-card-actions">
              <button
                className="secondary-button compact"
                disabled={!installSourceRef.trim() || loadingSourcePreview}
                onClick={() => void onPreviewSource()}
                type="button"
              >
                {loadingSourcePreview ? "预览中..." : "预览 Source"}
              </button>
              <button
                className="primary-button compact"
                disabled={!installSourceRef.trim() || activeActionType === "install_source"}
                onClick={() => void onInstallFromSource()}
                type="button"
              >
                {activeActionType === "install_source" ? "安装中..." : "从 Source 安装"}
              </button>
            </div>
            <div className="warning-box plugin-warning-box">
              Local / Git Source 安装适合可信插件。外部 Source 可能声明写文件、执行命令或管理 Git 等高风险权限，安装前请确认来源。
            </div>
            {sourcePreview ? (
              <PluginSourcePreviewCard
                diff={sourcePreviewDiff}
                installation={sourcePreviewInstallation}
                plugin={sourcePreview}
              />
            ) : null}
          </article>
          <div className="plugins-catalog-list">
            {catalog.map((plugin) => {
              const installed = installedPluginIds.has(plugin.id);
              const actionBusy = activeActionPluginId === plugin.id;
              return (
                <article className="plugins-catalog-card" key={plugin.id}>
                  <div className="section-title-row">
                    <div>
                      <strong>{plugin.name}</strong>
                      <p className="muted">{plugin.description}</p>
                    </div>
                    <span className="plugin-badge">v{plugin.version}</span>
                  </div>
                  <div className="plugin-badge-row">
                    <span className="plugin-badge">{getPluginSourceLabel(plugin.sourceType)}</span>
                    <span className="plugin-badge">{getPluginFrontendLabel(plugin)}</span>
                    {plugin.capabilities.map((capability) => (
                      <span className="plugin-badge" key={capability}>
                        {capability}
                      </span>
                    ))}
                  </div>
                  {getPluginPermissions(plugin).length > 0 ? (
                    <div className="plugin-badge-row">
                      {getPluginPermissions(plugin).map((permission) => (
                        <span className={getPermissionToneClass(permission)} key={permission}>
                          {permissionMetaMap[permission].label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {plugin.sourceRef ? <p className="muted">{plugin.sourceRef}</p> : null}
                  {getHighRiskPermissions(getPluginPermissions(plugin)).length > 0 ? (
                    <div className="warning-box plugin-warning-box">
                      安装后会启用高风险权限：
                      {" "}
                      {getHighRiskPermissions(getPluginPermissions(plugin))
                        .map((permission) => permissionMetaMap[permission].label)
                        .join(" · ")}
                    </div>
                  ) : null}
                  <div className="plugins-card-actions">
                    <button
                      className="primary-button compact"
                      disabled={installed || actionBusy}
                      onClick={() => void onInstall(plugin.id)}
                      type="button"
                    >
                      {installed ? "已安装" : actionBusy && activeActionType === "install" ? "安装中..." : "安装插件"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className="panel plugins-runtime-panel">
        <SectionHeader
          eyebrow="插件运行区"
          title={selectedInstallation ? selectedInstallation.tabTitle : "先安装并启用一个插件"}
          description={
            selectedInstallation
              ? `${selectedInstallation.name} · ${
                  selectedInstallation.backendService === "context_snapshot"
                    ? "已接通宿主上下文"
                    : selectedInstallation.backendService === "rpc_bridge"
                      ? "已接通插件 RPC"
                      : "无后端服务"
                }`
              : "插件框架现已支持前端 tab、宿主上下文、后端 RPC 和执行历史。"
          }
        />

        {enabledInstallations.length > 1 ? (
          <div className="plugin-tab-strip" role="tablist" aria-label="插件标签页">
            {enabledInstallations.map((installation) => (
              <button
                className={
                  installation.installationId === selectedInstallationId ? "plugin-tab active" : "plugin-tab"
                }
                key={installation.installationId}
                onClick={() => onSelectInstallation(installation.installationId)}
                type="button"
              >
                <strong>{installation.tabTitle}</strong>
                <span className="muted">{installation.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!selectedInstallation ? (
          <EmptyState message="安装任意一个插件后，这里会直接显示它消费宿主上下文后的页面。" />
        ) : !selectedInstallation.enabled ? (
          <div className="info-box">当前插件已安装但处于停用状态，启用后会重新挂载到运行区。</div>
        ) : loadingContext ? (
          <p className="muted">正在准备插件宿主上下文...</p>
        ) : (
          <>
            {renderPluginView(selectedInstallation, pluginContext, realtimeState, selectedSession, {
              token,
              projectId,
              projectRootPath,
              onExecuteRuntimeRpc
            })}
            <PluginPermissionSummary
              description="这里会汇总当前插件声明过的动作权限和 RPC 权限，高风险项会在执行前再次确认。"
              plugin={selectedInstallation}
              title="当前插件的权限清单"
            />
            <PluginRpcPanel
              executingRpcKey={executingRpcKey}
              installation={selectedInstallation}
              latestRpcExecution={latestRpcExecution}
              onExecuteRpc={onExecuteRpc}
              onRpcInputChange={onRpcInputChange}
              rpcDrafts={rpcDrafts}
            />
            <PluginActionPanel
              actionDrafts={actionDrafts}
              executingActionKey={executingActionKey}
              installation={selectedInstallation}
              latestExecution={latestExecution}
              onActionInputChange={onActionInputChange}
              onExecuteAction={onExecuteAction}
            />
            <PluginHistoryPanel history={pluginHistory} />
          </>
        )}
      </section>
    </div>
  );
}

export function WorkspacePluginsPage(): JSX.Element {
  const { projectId, projectRootPath, realtimeState, selectedSession, token } = useProjectWorkspace();
  const [catalog, setCatalog] = useState<PluginCatalogRecord[]>([]);
  const [installations, setInstallations] = useState<PluginInstallationRecord[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState("");
  const [pluginContext, setPluginContext] = useState<PluginHostContextRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeActionPluginId, setActiveActionPluginId] = useState<string | null>(null);
  const [activeActionType, setActiveActionType] = useState<
    "install" | "install_source" | "toggle" | "upgrade" | "uninstall" | null
  >(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, Record<string, string>>>({});
  const [executingActionKey, setExecutingActionKey] = useState<string | null>(null);
  const [latestExecution, setLatestExecution] = useState<PluginActionExecutionRecord | null>(null);
  const [rpcDrafts, setRpcDrafts] = useState<Record<string, Record<string, string>>>({});
  const [executingRpcKey, setExecutingRpcKey] = useState<string | null>(null);
  const [latestRpcExecution, setLatestRpcExecution] = useState<PluginRpcExecutionRecord | null>(null);
  const [pluginHistory, setPluginHistory] = useState<PluginExecutionHistoryRecord[]>([]);
  const [installSourceType, setInstallSourceType] = useState<"local" | "git">("local");
  const [installSourceRef, setInstallSourceRef] = useState("");
  const [installSourceVersion, setInstallSourceVersion] = useState("");
  const [sourcePreview, setSourcePreview] = useState<PluginCatalogRecord | null>(null);
  const [sourcePreviewInstallation, setSourcePreviewInstallation] = useState<PluginInstallationRecord | null>(null);
  const [sourcePreviewDiff, setSourcePreviewDiff] = useState<PluginPreviewDiffRecord | null>(null);
  const [loadingSourcePreview, setLoadingSourcePreview] = useState(false);

  const sortedInstallations = useMemo(
    () =>
      [...installations].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [installations]
  );

  useEffect(() => {
    if (!token || !projectId) {
      setLoading(false);
      setError("缺少项目上下文，暂时无法读取插件信息。");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([api.listPluginCatalog(token, projectId), api.listProjectPlugins(token, projectId)])
      .then(([catalogResponse, installationsResponse]) => {
        if (cancelled) {
          return;
        }

        setCatalog(catalogResponse.plugins);
        setInstallations(installationsResponse.installations);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "读取插件工作台失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, token]);

  useEffect(() => {
    const installed = sortedInstallations.find((installation) => installation.installationId === selectedInstallationId);
    if (installed) {
      return;
    }

    setSelectedInstallationId(sortedInstallations.find((installation) => installation.enabled)?.installationId ?? sortedInstallations[0]?.installationId ?? "");
  }, [selectedInstallationId, sortedInstallations]);

  useEffect(() => {
    setLatestExecution(null);
    setLatestRpcExecution(null);
  }, [selectedInstallationId]);

  useEffect(() => {
    setSourcePreview(null);
    setSourcePreviewInstallation(null);
    setSourcePreviewDiff(null);
  }, [installSourceType, installSourceRef, installSourceVersion]);

  useEffect(() => {
    if (!token || !projectId || !selectedInstallationId) {
      setPluginContext(null);
      setPluginHistory([]);
      setLoadingContext(false);
      return;
    }

    const selectedInstallation = sortedInstallations.find(
      (installation) => installation.installationId === selectedInstallationId
    );
    if (!selectedInstallation?.enabled) {
      setPluginContext(null);
      setPluginHistory([]);
      setLoadingContext(false);
      return;
    }

    let cancelled = false;
    setLoadingContext(true);
    void Promise.all([
      api.getProjectPluginContext(token, projectId, selectedInstallation.id),
      api.getProjectPluginHistory(token, projectId, selectedInstallation.id)
    ])
      .then(([contextResponse, historyResponse]) => {
        if (!cancelled) {
          setPluginContext(contextResponse.context);
          setPluginHistory(historyResponse.history);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "读取插件上下文失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedInstallationId, sortedInstallations, token]);

  async function handleInstall(pluginId: string): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    const plugin = catalog.find((item) => item.id === pluginId);
    const highRisk = plugin ? getHighRiskPermissions(getPluginPermissions(plugin)) : [];
    if (
      plugin &&
      highRisk.length > 0 &&
      !confirmPluginAction(buildPermissionConfirmMessage(plugin.name, highRisk, "install"))
    ) {
      return;
    }

    try {
      setActiveActionPluginId(pluginId);
      setActiveActionType("install");
      setNotice(null);
      setError(null);
      const response = await api.installProjectPlugin(token, projectId, { pluginId });
      setInstallations((current) => {
        const filtered = current.filter((installation) => installation.id !== response.installation.id);
        return [response.installation, ...filtered];
      });
      setSelectedInstallationId(response.installation.installationId);
      setNotice(`${response.installation.name} 已安装并启用。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "安装插件失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  async function handleInstallFromSource(): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    const previewHighRisk = sourcePreview ? getHighRiskPermissions(getPluginPermissions(sourcePreview)) : [];
    const shouldContinue =
      sourcePreview && previewHighRisk.length > 0
        ? confirmPluginAction(buildPermissionConfirmMessage(sourcePreview.name, previewHighRisk, "install"))
        : confirmPluginAction(buildPermissionConfirmMessage("source", [], "source_install"));
    if (!shouldContinue) {
      return;
    }

    try {
      setActiveActionPluginId(installSourceRef.trim() || installSourceType);
      setActiveActionType("install_source");
      setNotice(null);
      setError(null);
      const response = await api.installProjectPlugin(token, projectId, {
        sourceType: installSourceType,
        sourceRef: installSourceRef.trim(),
        sourceVersion: installSourceVersion.trim() || null
      });
      setInstallations((current) => {
        const filtered = current.filter((installation) => installation.id !== response.installation.id);
        return [response.installation, ...filtered];
      });
      setSelectedInstallationId(response.installation.installationId);
      setInstallSourceRef("");
      setInstallSourceVersion("");
      setSourcePreview(null);
      setSourcePreviewInstallation(null);
      setSourcePreviewDiff(null);
      setNotice(`${response.installation.name} 已从 ${installSourceType} source 安装并启用。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "从 source 安装插件失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  async function handleToggle(pluginId: string, enabled: boolean): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setActiveActionPluginId(pluginId);
      setActiveActionType("toggle");
      setNotice(null);
      setError(null);
      const response = await api.updateProjectPluginState(token, projectId, pluginId, enabled);
      setInstallations((current) =>
        current.map((installation) =>
          installation.id === pluginId ? response.installation : installation
        )
      );
      if (!enabled && selectedInstallationId === response.installation.installationId) {
        const nextSelected = sortedInstallations.find(
          (installation) =>
            installation.installationId !== response.installation.installationId && installation.enabled
        );
        setSelectedInstallationId(nextSelected?.installationId ?? response.installation.installationId);
      }
      setNotice(`${response.installation.name} 已${enabled ? "启用" : "停用"}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新插件状态失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  async function handlePreviewSource(): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setLoadingSourcePreview(true);
      setError(null);
      setNotice(null);
      const response = await api.previewProjectPlugin(token, projectId, {
        sourceType: installSourceType,
        sourceRef: installSourceRef.trim(),
        sourceVersion: installSourceVersion.trim() || null
      });
      setSourcePreview(response.plugin);
      setSourcePreviewInstallation(response.installation);
      setSourcePreviewDiff(response.diff);
      setNotice(`${response.plugin.name} 预览成功，可以先确认权限与来源再安装。`);
    } catch (requestError) {
      setSourcePreview(null);
      setSourcePreviewInstallation(null);
      setSourcePreviewDiff(null);
      setError(requestError instanceof Error ? requestError.message : "预览插件 source 失败");
    } finally {
      setLoadingSourcePreview(false);
    }
  }

  async function handleUpgrade(pluginId: string): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    const installation = sortedInstallations.find((item) => item.id === pluginId);
    if (!installation) {
      return;
    }

    const highRisk = getHighRiskPermissions(getPluginPermissions(installation));
    if (
      highRisk.length > 0 &&
      !confirmPluginAction(buildPermissionConfirmMessage(installation.name, highRisk, "upgrade"))
    ) {
      return;
    }

    try {
      setActiveActionPluginId(pluginId);
      setActiveActionType("upgrade");
      setNotice(null);
      setError(null);
      const response = await api.upgradeProjectPlugin(token, projectId, pluginId);
      setInstallations((current) =>
        current.map((item) => (item.id === pluginId ? response.installation : item))
      );
      setNotice(`${response.installation.name} 已刷新到最新插件定义。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "升级插件失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  async function handleUninstall(pluginId: string): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    const installation = sortedInstallations.find((item) => item.id === pluginId);
    if (!installation) {
      return;
    }

    if (!confirmPluginAction(buildPermissionConfirmMessage(installation.name, [], "uninstall"))) {
      return;
    }

    try {
      setActiveActionPluginId(pluginId);
      setActiveActionType("uninstall");
      setNotice(null);
      setError(null);
      const response = await api.uninstallProjectPlugin(token, projectId, pluginId);
      setInstallations((current) => current.filter((item) => item.id !== pluginId));
      if (selectedInstallationId === response.installation.installationId) {
        const nextSelected = sortedInstallations.find(
          (item) => item.installationId !== response.installation.installationId
        );
        setSelectedInstallationId(nextSelected?.installationId ?? "");
      }
      setNotice(
        `${response.installation.name} 已卸载，保留 ${response.retainedHistoryCount} 条执行历史用于审计。`
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "卸载插件失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  function handleActionInputChange(
    installationId: string,
    actionId: string,
    inputName: string,
    value: string
  ): void {
    const actionKey = getActionDraftKey(installationId, actionId);
    setActionDrafts((current) => ({
      ...current,
      [actionKey]: {
        ...(current[actionKey] ?? {}),
        [inputName]: value
      }
    }));
  }

  function handleRpcInputChange(
    installationId: string,
    rpcMethodId: string,
    inputName: string,
    value: string
  ): void {
    const rpcKey = getActionDraftKey(installationId, rpcMethodId);
    setRpcDrafts((current) => ({
      ...current,
      [rpcKey]: {
        ...(current[rpcKey] ?? {}),
        [inputName]: value
      }
    }));
  }

  async function handleExecuteAction(
    installation: PluginInstallationRecord,
    actionId: string
  ): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    const actionKey = getActionDraftKey(installation.installationId, actionId);
    const action = installation.actions.find((item) => item.id === actionId);
    const highRisk = getHighRiskPermissions(action?.permissions ?? []);

    if (
      action &&
      highRisk.length > 0 &&
      !confirmPluginAction(buildPermissionConfirmMessage(action.label, highRisk, "action"))
    ) {
      return;
    }

    try {
      setExecutingActionKey(actionKey);
      setError(null);
      setNotice(null);
      const response = await api.executeProjectPluginAction(token, projectId, installation.id, actionId, {
        inputs: actionDrafts[actionKey] ?? {}
      });
      setLatestExecution(response.execution);
      const historyResponse = await api.getProjectPluginHistory(token, projectId, installation.id);
      setPluginHistory(historyResponse.history);
      setNotice(`${installation.name} 已执行动作 ${actionId}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "执行插件动作失败");
    } finally {
      setExecutingActionKey(null);
    }
  }

  async function handleExecuteRpc(
    installation: PluginInstallationRecord,
    rpcMethodId: string
  ): Promise<void> {
    await executePluginRpcRequest(installation, rpcMethodId);
  }

  async function executePluginRpcRequest(
    installation: PluginInstallationRecord,
    rpcMethodId: string,
    inputs?: Record<string, string>
  ): Promise<PluginRpcExecutionRecord | null> {
    if (!token || !projectId) {
      throw new Error("Missing project context");
    }

    const rpcKey = getActionDraftKey(installation.installationId, rpcMethodId);
    const method = installation.rpcMethods.find((item) => item.id === rpcMethodId);
    const highRisk = getHighRiskPermissions(method?.permissions ?? []);

    if (
      method &&
      highRisk.length > 0 &&
      !confirmPluginAction(buildPermissionConfirmMessage(method.label, highRisk, "rpc"))
    ) {
      return null;
    }

    try {
      setExecutingRpcKey(rpcKey);
      setError(null);
      setNotice(null);
      const response = await api.executeProjectPluginRpc(token, projectId, installation.id, rpcMethodId, {
        inputs: inputs ?? rpcDrafts[rpcKey] ?? {}
      });
      setLatestRpcExecution(response.execution);
      const historyResponse = await api.getProjectPluginHistory(token, projectId, installation.id);
      setPluginHistory(historyResponse.history);
      setNotice(`${installation.name} 已调用 RPC ${rpcMethodId}。`);
      return response.execution;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "调用插件 RPC 失败");
      throw requestError;
    } finally {
      setExecutingRpcKey(null);
    }
  }

  return (
    <ProjectPluginsOverview
      activeActionPluginId={activeActionPluginId}
      activeActionType={activeActionType}
      actionDrafts={actionDrafts}
      catalog={catalog}
      executingActionKey={executingActionKey}
      executingRpcKey={executingRpcKey}
      error={error}
      installSourceRef={installSourceRef}
      installSourceType={installSourceType}
      installSourceVersion={installSourceVersion}
      installations={sortedInstallations}
      latestExecution={latestExecution}
      latestRpcExecution={latestRpcExecution}
      loading={loading}
      loadingContext={loadingContext}
      loadingSourcePreview={loadingSourcePreview}
      notice={notice}
      onActionInputChange={handleActionInputChange}
      onExecuteAction={handleExecuteAction}
      onInstall={handleInstall}
      onInstallFromSource={handleInstallFromSource}
      onPreviewSource={handlePreviewSource}
      onInstallSourceRefChange={setInstallSourceRef}
      onInstallSourceTypeChange={setInstallSourceType}
      onInstallSourceVersionChange={setInstallSourceVersion}
      onExecuteRpc={handleExecuteRpc}
      onRpcInputChange={handleRpcInputChange}
      onSelectInstallation={setSelectedInstallationId}
      onToggle={handleToggle}
      onUninstall={handleUninstall}
      onUpgrade={handleUpgrade}
      pluginHistory={pluginHistory}
      pluginContext={pluginContext}
      projectId={projectId}
      projectRootPath={projectRootPath}
      rpcDrafts={rpcDrafts}
      realtimeState={realtimeState}
      selectedInstallationId={selectedInstallationId}
      selectedSession={selectedSession}
      sourcePreview={sourcePreview}
      sourcePreviewDiff={sourcePreviewDiff}
      sourcePreviewInstallation={sourcePreviewInstallation}
      token={token}
      onExecuteRuntimeRpc={executePluginRpcRequest}
    />
  );
}
