import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { AuthUser } from "@shared";
import { api, authStorage } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { WorkspacePage } from "./pages/WorkspacePage";

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
            <WorkspacePage user={user!} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate replace to={user ? "/projects" : "/login"} />} />
    </Routes>
  );
}
