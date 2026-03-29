import { NavLink, Outlet } from "react-router-dom";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceToolsPage(): JSX.Element {
  const { projectRootPath, workspaceError } = useProjectWorkspace();

  return (
    <div className="workspace-route-stack workspace-tools-stack">
      <section className="panel tools-layout-panel">
        <div className="chat-header">
          <div>
            <div className="eyebrow">工作区工具</div>
            <h3>文件、终端与 Git</h3>
            <p className="muted">{projectRootPath}</p>
          </div>
        </div>

        <nav className="tools-nav">
          <NavLink className={({ isActive }) => (isActive ? "tools-nav-link active" : "tools-nav-link")} end to="files">
            文件
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "tools-nav-link active" : "tools-nav-link")} to="terminal">
            终端
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "tools-nav-link active" : "tools-nav-link")} to="git">
            Git
          </NavLink>
        </nav>
      </section>

      {workspaceError ? <div className="error-box">{workspaceError}</div> : null}
      <Outlet />
    </div>
  );
}
