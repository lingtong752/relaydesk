import { useState } from "react";
import type { AuthUser } from "@shared";
import { api, authStorage } from "../lib/api";

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
    setLoading(true);
    setError(null);

    try {
      const response =
        mode === "login" ? await api.login(email, password) : await api.register(email, password);
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
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="eyebrow">RelayDesk</div>
        <h1>多 Provider AI 协作平台</h1>
        <p className="muted">先用最小骨架打通登录、项目、会话和替身 AI 协作链路。</p>

        <label>
          <span>邮箱</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>

        <label>
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="error-box">{error}</div> : null}

        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
        </button>

        <button
          className="secondary-button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          type="button"
        >
          {mode === "login" ? "没有账号？切换注册" : "已有账号？切换登录"}
        </button>
      </form>
    </div>
  );
}
