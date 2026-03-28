import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthUser, ProjectRecord } from "@shared";
import { api, authStorage } from "../lib/api";

interface ProjectsPageProps {
  user: AuthUser;
  onLogout(): void;
}

export function ProjectsPage({ user, onLogout }: ProjectsPageProps): JSX.Element {
  const navigate = useNavigate();
  const token = authStorage.getToken();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [name, setName] = useState("RelayDesk Demo");
  const [rootPath, setRootPath] = useState("/workspace/demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      return;
    }

    void api
      .listProjects(token)
      .then((response) => setProjects(response.projects))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }

    setError(null);
    try {
      const response = await api.createProject(token, { name, rootPath });
      setProjects((current) => [response.project, ...current]);
      navigate(`/workspace/${response.project.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建失败");
    }
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">欢迎回来</div>
          <h1>{user.email}</h1>
        </div>
        <button className="secondary-button" onClick={onLogout} type="button">
          退出登录
        </button>
      </header>

      <section className="two-column">
        <form className="panel" onSubmit={handleCreate}>
          <h2>新建项目</h2>
          <label>
            <span>项目名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>工作区路径</span>
            <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" type="submit">
            创建并进入
          </button>
        </form>

        <div className="panel">
          <h2>已有项目</h2>
          {loading ? <p className="muted">加载中...</p> : null}
          {!loading && projects.length === 0 ? <p className="muted">还没有项目，先创建一个。</p> : null}
          <div className="project-list">
            {projects.map((project) => (
              <Link className="project-card" key={project.id} to={`/workspace/${project.id}`}>
                <strong>{project.name}</strong>
                <span>{project.rootPath}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
