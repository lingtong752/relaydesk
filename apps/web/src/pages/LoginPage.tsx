import { useState } from "react";
import type { AuthUser } from "@shared";
import { api, authStorage } from "../lib/api";
import { normalizeEmail, validateCredentials } from "../lib/authValidation";

interface LoginPageProps {
  onAuthenticated(user: AuthUser): void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps): JSX.Element {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    const validationMessage = validateCredentials(normalizedEmail, password);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response =
        mode === "login"
          ? await api.login(normalizedEmail, password)
          : await api.register(normalizedEmail, password);
      authStorage.setToken(response.token);
      onAuthenticated(response.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <section className="auth-hero-panel">
          <div className="hero-badge-row">
            <span className="hero-tag brand">RelayDesk</span>
            <span className="hero-tag automation">多 Provider</span>
            <span className="hero-tag manual">工作区协作</span>
          </div>

          <div>
            <div className="eyebrow">智能运营控制台</div>
            <h1>让项目、会话与替身协作像一张可判断的作战台。</h1>
            <p className="hero-lead">
              兼容 Claude、Codex 与 Gemini 的项目上下文、CLI 历史会话和本地工作区工具，把状态、操作与审计放进同一个浅色运营台里。
            </p>
          </div>

          <div className="hero-summary-grid">
            <article className="hero-summary-item">
              <span className="hero-summary-label">项目接入</span>
              <strong>统一工作区入口</strong>
              <p>登录后直接进入项目控制台，集中查看路径、状态和后续动作。</p>
            </article>
            <article className="hero-summary-item">
              <span className="hero-summary-label">会话衔接</span>
              <strong>兼容 CLI 历史会话</strong>
              <p>把本机已有上下文迁入 RelayDesk，而不是重新开始一套对话。</p>
            </article>
            <article className="hero-summary-item">
              <span className="hero-summary-label">替身执行</span>
              <strong>状态先于操作</strong>
              <p>先判断运行状态、审批和风险，再决定是否继续交给替身 Agent。</p>
            </article>
          </div>
        </section>

        <form className="auth-card" noValidate onSubmit={handleSubmit}>
          <div className="eyebrow">账号入口</div>
          <h2>登录到多 Provider AI 协作平台</h2>
          <p className="muted">使用邮箱地址登录或注册，进入 RelayDesk 项目控制台。</p>
          <div className="info-box">默认示例账号已填充，方便你直接联调登录、项目与会话链路。</div>

          <label>
            <span>邮箱</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              placeholder="demo@example.com"
              type="email"
              value={email}
            />
          </label>

          <label>
            <span>密码</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              placeholder="至少 6 位"
              type="password"
              value={password}
            />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>

          <button
            className="secondary-button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            type="button"
          >
            {mode === "login" ? "没有账号？切换注册" : "已有账号？切换登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
