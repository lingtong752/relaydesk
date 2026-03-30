import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { AuthUser } from "@shared";
import { api, authStorage } from "./lib/api";
import { ProjectWorkspaceProvider } from "./features/workspace/ProjectWorkspaceProvider";
import { ProjectLayout } from "./layouts/ProjectLayout";

const LoginPage = lazy(async () => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const ProjectsPage = lazy(async () =>
  import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage }))
);
const WorkspaceAgentPage = lazy(async () =>
  import("./pages/WorkspaceAgentPage").then((module) => ({ default: module.WorkspaceAgentPage }))
);
const WorkspaceChatPage = lazy(async () =>
  import("./pages/WorkspaceChatPage").then((module) => ({ default: module.WorkspaceChatPage }))
);
const WorkspaceFilesToolPage = lazy(async () =>
  import("./pages/WorkspaceFilesToolPage").then((module) => ({ default: module.WorkspaceFilesToolPage }))
);
const WorkspaceGitToolPage = lazy(async () =>
  import("./pages/WorkspaceGitToolPage").then((module) => ({ default: module.WorkspaceGitToolPage }))
);
const WorkspaceHomePage = lazy(async () =>
  import("./pages/WorkspaceHomePage").then((module) => ({ default: module.WorkspaceHomePage }))
);
const WorkspacePluginsPage = lazy(async () =>
  import("./pages/WorkspacePluginsPage").then((module) => ({ default: module.WorkspacePluginsPage }))
);
const WorkspaceSettingsPage = lazy(async () =>
  import("./pages/WorkspaceSettingsPage").then((module) => ({ default: module.WorkspaceSettingsPage }))
);
const WorkspaceTasksPage = lazy(async () =>
  import("./pages/WorkspaceTasksPage").then((module) => ({ default: module.WorkspaceTasksPage }))
);
const WorkspaceTerminalToolPage = lazy(async () =>
  import("./pages/WorkspaceTerminalToolPage").then((module) => ({ default: module.WorkspaceTerminalToolPage }))
);
const WorkspaceToolsPage = lazy(async () =>
  import("./pages/WorkspaceToolsPage").then((module) => ({ default: module.WorkspaceToolsPage }))
);

function RouteLoadingFallback(): JSX.Element {
  return <div className="loading-screen">加载中...</div>;
}

function ProtectedRoute({
  user,
  children
}: {
  user: AuthUser | null;
  children: JSX.Element;
}): JSX.Element {
  if (!user) {
    return <Navigate replace to="/login" />;
  }

  return children;
}

export default function App(): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    void api
      .me(token)
      .then((response) => setUser(response.user))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-screen">加载中...</div>;
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate replace to="/projects" /> : <LoginPage onAuthenticated={setUser} />}
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute user={user}>
              <ProjectsPage
                onLogout={() => {
                  authStorage.clear();
                  setUser(null);
                }}
                user={user!}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace/:projectId"
          element={
            <ProtectedRoute user={user}>
              <ProjectWorkspaceProvider>
                <ProjectLayout user={user!} />
              </ProjectWorkspaceProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate replace to="home" />} />
          <Route path="home" element={<WorkspaceHomePage />} />
          <Route path="chat" element={<WorkspaceChatPage />} />
          <Route path="agent" element={<WorkspaceAgentPage />} />
          <Route path="tasks" element={<WorkspaceTasksPage />} />
          <Route path="plugins" element={<WorkspacePluginsPage />} />
          <Route path="settings" element={<WorkspaceSettingsPage />} />
          <Route path="tools" element={<WorkspaceToolsPage />}>
            <Route index element={<Navigate replace to="files" />} />
            <Route path="files" element={<WorkspaceFilesToolPage />} />
            <Route path="terminal" element={<WorkspaceTerminalToolPage />} />
            <Route path="git" element={<WorkspaceGitToolPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate replace to={user ? "/projects" : "/login"} />} />
      </Routes>
    </Suspense>
  );
}
