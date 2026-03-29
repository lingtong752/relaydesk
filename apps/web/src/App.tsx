import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { AuthUser } from "@shared";
import { api, authStorage } from "./lib/api";
import { ProjectWorkspaceProvider } from "./features/workspace/ProjectWorkspaceProvider";
import { ProjectLayout } from "./layouts/ProjectLayout";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { WorkspaceAgentPage } from "./pages/WorkspaceAgentPage";
import { WorkspaceChatPage } from "./pages/WorkspaceChatPage";
import { WorkspaceFilesToolPage } from "./pages/WorkspaceFilesToolPage";
import { WorkspaceGitToolPage } from "./pages/WorkspaceGitToolPage";
import { WorkspaceHomePage } from "./pages/WorkspaceHomePage";
import { WorkspacePluginsPage } from "./pages/WorkspacePluginsPage";
import { WorkspaceSettingsPage } from "./pages/WorkspaceSettingsPage";
import { WorkspaceTasksPage } from "./pages/WorkspaceTasksPage";
import { WorkspaceTerminalToolPage } from "./pages/WorkspaceTerminalToolPage";
import { WorkspaceToolsPage } from "./pages/WorkspaceToolsPage";

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
  );
}
