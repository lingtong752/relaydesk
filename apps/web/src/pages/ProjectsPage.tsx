import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthUser, DiscoveredProjectRecord, ProjectRecord } from "@shared";
import { api, authStorage } from "../lib/api";

interface ProjectsPageProps {
  user: AuthUser;
  onLogout(): void;
}

export function ProjectsPage({ user, onLogout }: ProjectsPageProps): JSX.Element {
  const navigate = useNavigate();
  const token = authStorage.getToken();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProjectRecord[]>([]);
  const [name, setName] = useState("RelayDesk Demo");
  const [rootPath, setRootPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingDiscovery, setRefreshingDiscovery] = useState(false);
  const [importingProjectId, setImportingProjectId] = useState<string | null>(null);
  const linkedDiscoveredCount = discoveredProjects.filter((project) => project.linkedProjectId).length;
  const discoveredSessionCount = discoveredProjects.reduce(
    (count, project) => count + project.sessionCount,
    0
  );

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    void Promise.allSettled([loadProjectsList(), loadDiscoveredProjectsList()]).finally(() =>
      setLoading(false)
    );
  }, [token]);

  async function loadProjectsList(): Promise<void> {
    if (!token) {
      return;
    }

    try {
      const response = await api.listProjects(token);
      setProjects(response.projects);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载失败");
    }
  }

  async function loadDiscoveredProjectsList(): Promise<void> {
    if (!token) {
      return;
    }

    try {
      const response = await api.listDiscoveredProjects(token);
      setDiscoveredProjects(response.projects);
      setDiscoveryError(null);
    } catch (requestError) {
      setDiscoveryError(requestError instanceof Error ? requestError.message : "发现本机项目失败");
    }
  }

  function upsertProject(nextProject: ProjectRecord): void {
    setProjects((current) => {
      const existingIndex = current.findIndex((project) => project.id === nextProject.id);
      if (existingIndex === -1) {
        return [nextProject, ...current];
      }

      const nextProjects = [...current];
      nextProjects[existingIndex] = nextProject;
      return nextProjects;
    });
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }

    setError(null);
    try {
      const response = await api.createProject(token, { name, rootPath: rootPath.trim() });
      upsertProject(response.project);
      navigate(`/workspace/${response.project.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建失败");
    }
  }

  async function handleRefreshDiscovery(): Promise<void> {
    setRefreshingDiscovery(true);
    await loadDiscoveredProjectsList();
    setRefreshingDiscovery(false);
  }

  async function handleImportDiscoveredProject(project: DiscoveredProjectRecord): Promise<void> {
    if (!token) {
      return;
    }

    setImportingProjectId(project.id);
    setError(null);
    try {
      const response = await api.createProject(token, {
        name: project.name,
        rootPath: project.rootPath
      });
      upsertProject(response.project);
      setDiscoveredProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? {
                ...item,
                linkedProjectId: response.project.id,
                linkedProjectName: response.project.name
              }
            : item
        )
      );
      navigate(`/workspace/${response.project.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "导入失败");
    } finally {
      setImportingProjectId(null);
    }
  }

  return (
    <div className="page-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero-main">
          <div className="hero-badge-row">
            <span className="hero-tag brand">项目控制台</span>
            <span className="hero-tag automation">CLI 兼容层</span>
            <span className="hero-tag knowledge">工作区映射</span>
          </div>
          <div className="eyebrow">欢迎回来</div>
          <h1>把多 Provider 项目、CLI 历史会话和当前工作区统一到一张运营台里。</h1>
          <p className="hero-lead">
            当前登录账号 {user.email}。从这里创建新的 RelayDesk 项目，或继续接管本机已经发现到的历史上下文。
          </p>
          <div className="hero-action-row">
            <button className="secondary-button" onClick={onLogout} type="button">
              退出登录
            </button>
          </div>
        </div>

        <div className="dashboard-hero-side">
          <div className="hero-summary-grid compact">
            <article className="hero-summary-item">
              <span className="hero-summary-label">已接入项目</span>
              <strong>{projects.length}</strong>
              <p>已经纳入 RelayDesk 的项目工作区。</p>
            </article>
            <article className="hero-summary-item">
              <span className="hero-summary-label">发现结果</span>
              <strong>{discoveredProjects.length}</strong>
              <p>本机扫描到的可导入项目，其中 {linkedDiscoveredCount} 个已建立映射。</p>
            </article>
            <article className="hero-summary-item">
              <span className="hero-summary-label">历史会话</span>
              <strong>{discoveredSessionCount}</strong>
              <p>可用于继续接管的 CLI 历史会话总数。</p>
            </article>
          </div>
        </div>
      </section>

      <section className="two-column">
        <form className="panel" onSubmit={handleCreate}>
          <div className="section-title-row">
            <div>
              <div className="eyebrow">新建项目</div>
              <h2>创建新的 RelayDesk 工作区</h2>
              <p className="field-hint">建议填写真实项目路径，便于工作区工具与会话自动对齐。</p>
            </div>
          </div>
          <label>
            <span>项目名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>工作区路径</span>
            <input
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="留空则使用当前 API 工作目录"
              value={rootPath}
            />
          </label>
          <p className="field-hint">建议填写项目真实路径；留空时会自动使用当前 RelayDesk 服务所在目录。</p>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" type="submit">
            创建并进入
          </button>
        </form>

        <div className="panel">
          <div className="section-title-row">
            <div>
              <div className="eyebrow">已接入项目</div>
              <h2>继续已有工作区</h2>
              <p className="field-hint">优先展示已经完成接入、可以直接进入协作与工具页的项目。</p>
            </div>
          </div>
          {loading ? <p className="muted">加载中...</p> : null}
          {!loading && projects.length === 0 ? <p className="muted">还没有项目，先创建一个。</p> : null}
          <div className="project-list">
            {projects.map((project) => (
              <Link className="project-card" key={project.id} to={`/workspace/${project.id}`}>
                <strong>{project.name}</strong>
                <span>{project.rootPath}</span>
                <div className="project-card-foot">
                  <span className="project-card-status">进入项目</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="panel discovered-projects-panel">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">CLI 兼容层</div>
            <h2>发现到的本机项目</h2>
            <p className="field-hint">扫描本机已有的 Claude、Codex 和 Gemini 项目与历史会话。</p>
          </div>
          <button
            className="secondary-button compact"
            disabled={refreshingDiscovery}
            onClick={() => void handleRefreshDiscovery()}
            type="button"
          >
            {refreshingDiscovery ? "刷新中..." : "刷新发现"}
          </button>
        </div>

        {discoveryError ? <div className="error-box">{discoveryError}</div> : null}
        {!loading && discoveredProjects.length === 0 && !discoveryError ? (
          <p className="muted">还没有发现本机历史项目，后续接入更多 provider 后这里会继续扩展。</p>
        ) : null}

        <div className="project-list">
          {discoveredProjects.map((project) => (
            <article className="project-card discovered-project-card" key={project.id}>
              <div className="project-card-header">
                <div className="project-card-meta">
                  <strong>{project.name}</strong>
                  <span>{project.rootPath}</span>
                  <span className="muted">
                    已发现 {project.sessionCount} 条历史会话
                    {project.lastActivity
                      ? ` · 最近活动 ${new Date(project.lastActivity).toLocaleString()}`
                      : ""}
                  </span>
                </div>

                <div className="project-card-actions">
                  {project.linkedProjectId ? (
                    <Link className="secondary-button compact" to={`/workspace/${project.linkedProjectId}`}>
                      打开项目
                    </Link>
                  ) : (
                    <button
                      className="primary-button compact"
                      disabled={importingProjectId === project.id}
                      onClick={() => void handleImportDiscoveredProject(project)}
                      type="button"
                    >
                      {importingProjectId === project.id ? "导入中..." : "导入并进入"}
                    </button>
                  )}
                </div>
              </div>

              <div className="provider-chip-row">
                {project.providers.map((provider) => (
                  <span className="provider-chip" key={`${project.id}-${provider}`}>
                    {provider}
                  </span>
                ))}
              </div>

              <p className="field-hint">
                {project.linkedProjectName
                  ? `已映射到 RelayDesk 项目：${project.linkedProjectName}`
                  : "尚未导入到 RelayDesk，当前仅展示发现结果。"}
              </p>

              <div className="project-session-preview">
                {project.sessions.map((session) => (
                  <div className="project-session-row" key={`${project.id}-${session.provider}-${session.id}`}>
                    <strong>{session.provider}</strong>
                    <span>{session.summary}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
