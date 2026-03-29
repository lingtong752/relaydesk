import { Link } from "react-router-dom";
import type { RunRecord, SessionRecord } from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { EmptyState } from "../shared/ui/EmptyState";
import { SectionHeader } from "../shared/ui/SectionHeader";

function getRunStatusLabel(run: RunRecord | null): string {
  if (!run) {
    return "当前未运行";
  }

  const statusLabelMap: Record<RunRecord["status"], string> = {
    draft: "草稿",
    running: "运行中",
    waiting_human: "等待人工",
    paused: "已暂停",
    stopped: "已停止",
    completed: "已完成",
    failed: "执行失败"
  };

  return statusLabelMap[run.status];
}

function getRunStatusToneClass(run: RunRecord | null): string {
  if (!run) {
    return "state-idle";
  }

  if (run.status === "running") {
    return "state-running";
  }

  if (run.status === "waiting_human" || run.status === "paused") {
    return "state-warning";
  }

  if (run.status === "failed") {
    return "state-danger";
  }

  return "state-success";
}

function getSessionOriginLabel(session: SessionRecord): string {
  return session.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话";
}

export function WorkspaceHomePage(): JSX.Element {
  const {
    activeRun,
    latestRun,
    pendingApprovals,
    projectId,
    projectRootPath,
    selectedSession,
    selectSession,
    sessions
  } = useProjectWorkspace();

  const recentSessions = sessions.slice(0, 4);
  const importedSessions = sessions.filter((session) => session.origin === "imported_cli").length;
  const activeProviders = [...new Set(sessions.map((session) => session.provider))];
  const currentRun = activeRun ?? latestRun;
  const homeCta =
    pendingApprovals.length > 0
      ? {
          label: "处理待审批项",
          to: `/workspace/${projectId}/agent`
        }
      : sessions.length > 0
        ? {
            label: "继续进入协作",
            to: `/workspace/${projectId}/chat`
          }
        : {
            label: "先创建第一条会话",
            to: `/workspace/${projectId}/chat`
          };

  return (
    <div className="workspace-route-stack workspace-home-stack">
      <section className="panel workspace-home-panel">
        <SectionHeader
          actions={
            <Link className="primary-button" to={homeCta.to}>
              {homeCta.label}
            </Link>
          }
          description="项目首页负责回答三件事：当前状态如何、优先处理什么、下一步去哪个模块。"
          eyebrow="项目首页"
          title="先看状态，再决定下一步动作"
        />

        <div className="home-metric-grid">
          <article className="home-metric-card">
            <span className="home-metric-label">会话总数</span>
            <strong>{sessions.length}</strong>
            <p>当前项目已接入的协作上下文数量。</p>
          </article>
          <article className="home-metric-card">
            <span className="home-metric-label">CLI 历史</span>
            <strong>{importedSessions}</strong>
            <p>来自本机 CLI 的历史会话，可继续接管或查看。</p>
          </article>
          <article className="home-metric-card">
            <span className="home-metric-label">待审批项</span>
            <strong>{pendingApprovals.length}</strong>
            <p>需要人工复核的动作数量，优先在替身 Agent 中处理。</p>
          </article>
          <article className="home-metric-card">
            <span className="home-metric-label">替身状态</span>
            <strong>{getRunStatusLabel(currentRun)}</strong>
            <p>{currentRun ? currentRun.objective : "当前没有进行中的替身运行。"}</p>
          </article>
        </div>
      </section>

      <div className="content-grid workspace-home-grid">
        <section className="panel home-focus-panel">
          <SectionHeader
            eyebrow="当前焦点"
            title="这张工作台现在最值得关注的地方"
            description={projectRootPath}
          />

          <div className="home-focus-list">
            <article className="home-focus-item">
              <div>
                <strong>替身运行</strong>
                <p>{currentRun ? currentRun.objective : "当前没有进行中的替身运行。"}</p>
              </div>
              <span className={`home-state-pill ${getRunStatusToneClass(currentRun)}`}>
                {getRunStatusLabel(currentRun)}
              </span>
            </article>

            <article className="home-focus-item">
              <div>
                <strong>人工审批</strong>
                <p>
                  {pendingApprovals.length > 0
                    ? `当前有 ${pendingApprovals.length} 项待审批动作，建议先进入替身 Agent 页面处理。`
                    : "当前没有待审批动作，系统处于可继续推进状态。"}
                </p>
              </div>
              <span className={`home-state-pill ${pendingApprovals.length > 0 ? "state-warning" : "state-success"}`}>
                {pendingApprovals.length > 0 ? "待处理" : "已清空"}
              </span>
            </article>

            <article className="home-focus-item">
              <div>
                <strong>当前会话</strong>
                <p>
                  {selectedSession
                    ? `${selectedSession.title} · ${selectedSession.provider} · ${getSessionOriginLabel(selectedSession)}`
                    : "还没有选中的会话，进入协作页后可以新建或切换会话。"}
                </p>
              </div>
              <span className="home-state-pill state-idle">
                {selectedSession ? "已就绪" : "待创建"}
              </span>
            </article>
          </div>
        </section>

        <div className="workspace-sidepanels workspace-home-sidepanels">
          <section className="panel home-actions-panel">
            <SectionHeader
              eyebrow="快捷入口"
              title="按模块继续推进"
              description="一级导航放左侧，首页负责把下一步动作指给你。"
            />

            <div className="home-action-grid">
              <Link className="home-action-card" to={`/workspace/${projectId}/chat`}>
                <strong>协作</strong>
                <p>浏览会话、继续提问、接住 CLI 历史上下文。</p>
              </Link>
              <Link className="home-action-card" to={`/workspace/${projectId}/agent`}>
                <strong>替身 Agent</strong>
                <p>查看运行状态、审批队列与执行轨迹。</p>
              </Link>
              <Link className="home-action-card" to={`/workspace/${projectId}/tasks`}>
                <strong>任务</strong>
                <p>查看项目文档基线、TaskMaster 摘要和当前任务状态。</p>
              </Link>
              <Link className="home-action-card" to={`/workspace/${projectId}/settings`}>
                <strong>设置与 MCP</strong>
                <p>校准 Claude、Codex 配置与 MCP server 接入状态。</p>
              </Link>
              <Link className="home-action-card" to={`/workspace/${projectId}/tools/files`}>
                <strong>工作区工具</strong>
                <p>通过顶 tab 进入文件、终端与 Git 工作区。</p>
              </Link>
            </div>
          </section>

          <section className="panel home-providers-panel">
            <SectionHeader
              eyebrow="Provider 视图"
              title="当前项目的上下文来源"
              description="首页只做摘要，不替代具体模块。"
            />

            {activeProviders.length > 0 ? (
              <div className="provider-chip-row">
                {activeProviders.map((provider) => (
                  <span className="provider-chip" key={provider}>
                    {provider}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState message="还没有 provider 会话，先进入协作模块新建一条会话。" />
            )}
          </section>
        </div>
      </div>

      <section className="panel home-sessions-panel">
        <SectionHeader
          eyebrow="最近会话"
          title="从这些上下文继续推进"
          description={sessions.length > 0 ? `优先展示最近的 ${recentSessions.length} 条会话` : "当前项目还没有会话"}
        />

        {recentSessions.length === 0 ? (
          <EmptyState message="还没有会话，进入协作模块后就可以开始建立项目上下文。" />
        ) : (
          <div className="home-session-list">
            {recentSessions.map((session) => (
              <Link
                className="home-session-card"
                key={session.id}
                onClick={() => selectSession(session.id)}
                to={`/workspace/${projectId}/chat`}
              >
                <div className="home-session-title-row">
                  <strong>{session.title}</strong>
                  <span className="provider-chip">{session.provider}</span>
                </div>
                <p>{getSessionOriginLabel(session)}</p>
                <span className="muted">
                  最近更新 {new Date(session.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
