import { NavLink, Outlet } from "react-router-dom";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

let preloadFilesToolPromise: Promise<unknown> | null = null;
let preloadTerminalToolPromise: Promise<unknown> | null = null;
let preloadGitToolPromise: Promise<unknown> | null = null;

function preloadFilesTool(): void {
  if (!preloadFilesToolPromise) {
    preloadFilesToolPromise = Promise.all([
      import("./WorkspaceFilesToolPage"),
      import("../features/tools/files/components/CodeEditor")
    ]);
  }
}

function preloadTerminalTool(): void {
  if (!preloadTerminalToolPromise) {
    preloadTerminalToolPromise = import("./WorkspaceTerminalToolPage");
  }
}

function preloadGitTool(): void {
  if (!preloadGitToolPromise) {
    preloadGitToolPromise = import("./WorkspaceGitToolPage");
  }
}

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
          <NavLink
            className={({ isActive }) => (isActive ? "tools-nav-link active" : "tools-nav-link")}
            end
            onFocus={preloadFilesTool}
            onMouseEnter={preloadFilesTool}
            to="files"
          >
            文件
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "tools-nav-link active" : "tools-nav-link")}
            onFocus={preloadTerminalTool}
            onMouseEnter={preloadTerminalTool}
            to="terminal"
          >
            终端
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "tools-nav-link active" : "tools-nav-link")}
            onFocus={preloadGitTool}
            onMouseEnter={preloadGitTool}
            to="git"
          >
            Git
          </NavLink>
        </nav>
      </section>

      {workspaceError ? <div className="error-box">{workspaceError}</div> : null}
      <Outlet />
    </div>
  );
}
