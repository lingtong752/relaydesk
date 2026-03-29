import { NavLink, Outlet, Link } from "react-router-dom";
import type { AuthUser } from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

interface ProjectLayoutProps {
  user: AuthUser;
}

function getConnectionStatusLabel(state: ReturnType<typeof useProjectWorkspace>["realtimeState"]): string {
  if (state === "connected") {
    return "实时连接正常";
  }

  if (state === "reconnecting") {
    return "正在恢复实时连接";
  }

  if (state === "connecting") {
    return "正在建立实时连接";
  }

  return "实时连接已断开";
}

export function ProjectLayout({ user }: ProjectLayoutProps): JSX.Element {
  const { loadingProject, projectName, projectRootPath, realtimeState } = useProjectWorkspace();

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-hero">
          <div className="hero-badge-row">
            <span className="hero-tag brand">RelayDesk</span>
            <span className="hero-tag automation">项目工作台</span>
          </div>
          <div className="sidebar-header">
            <div className="eyebrow">项目控制台</div>
            <h2>{projectName}</h2>
            <p className="muted">{user.email}</p>
          </div>
        </div>

        <nav className="sidebar-section project-nav">
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="home">
            首页
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} end to="chat">
            协作
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="agent">
            替身 Agent
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="tasks">
            任务
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="plugins">
            插件
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="settings">
            设置与 MCP
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "project-nav-link active" : "project-nav-link")} to="tools">
            工作区工具
          </NavLink>
        </nav>

        <div className="sidebar-section sidebar-context">
          <div className="eyebrow">工作区路径</div>
          <p className="muted sidebar-path">{projectRootPath || "加载中..."}</p>
        </div>

        <div className="sidebar-footer">
          <Link className="secondary-button compact" to="/projects">
            返回项目列表
          </Link>
        </div>
      </aside>

      <main className="workspace-main">
        <section className="workspace-banner">
          <div className="workspace-banner-main">
            <div className="eyebrow">当前工作区</div>
            <div className="workspace-banner-title-row">
              <h1>{projectName}</h1>
              <div className={`connection-pill state-${realtimeState}`}>
                {getConnectionStatusLabel(realtimeState)}
              </div>
            </div>
            <p className="hero-lead">{projectRootPath || "正在读取项目根路径..."}</p>
          </div>

          <div className="workspace-banner-summary">
            <article className="workspace-banner-item">
              <span>工作区准备度</span>
              <strong>{loadingProject ? "正在准备项目上下文" : "已可直接进入会话、替身与工具"}</strong>
              <p>{loadingProject ? "正在连通会话、替身状态和工作区工具。" : "现在可以从左侧模块直接继续推进，无需再做额外准备。"}</p>
            </article>
          </div>
        </section>

        {loadingProject ? (
          <section className="panel workspace-loading-panel">
            <div className="eyebrow">项目加载中</div>
            <h3>正在准备项目上下文</h3>
            <p className="muted">会话、替身状态和工具工作区即将就绪。</p>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
