import { useEffect, useMemo, useRef, useState } from "react";
import type { TerminalSessionRecord } from "@shared";
import { api } from "../lib/api";
import { connectTerminal, type TerminalClient, type TerminalEvent } from "../lib/terminal";

interface TerminalWorkspaceProps {
  projectId: string;
  rootPath: string;
  token: string;
}

export function TerminalWorkspace({
  projectId,
  rootPath,
  token
}: TerminalWorkspaceProps): JSX.Element {
  const [session, setSession] = useState<TerminalSessionRecord | null>(null);
  const [terminalClient, setTerminalClient] = useState<TerminalClient | null>(null);
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "exited">("idle");
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);

  const statusLabel = useMemo(() => {
    if (status === "connecting") {
      return "连接中";
    }

    if (status === "connected") {
      return "已连接";
    }

    if (status === "exited") {
      return "已退出";
    }

    return "未连接";
  }, [status]);

  useEffect(() => {
    if (!outputRef.current) {
      return;
    }

    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  useEffect(() => {
    return () => {
      terminalClient?.close();
    };
  }, [terminalClient]);

  async function handleConnect(): Promise<void> {
    setStatus("connecting");
    setError(null);

    try {
      const response = await api.createTerminalSession(token, projectId);
      setSession(response.session);
      terminalClient?.close();

      const client = connectTerminal({
        token,
        sessionId: response.session.id,
        onEvent: (event: TerminalEvent) => {
          if (event.type === "terminal.ready") {
            setOutput(event.payload.backlog);
            setSession(event.payload.session);
            setStatus("connected");
            return;
          }

          if (event.type === "terminal.output") {
            setOutput((current) => `${current}${event.payload.data}`);
            return;
          }

          if (event.type === "terminal.exit") {
            setStatus("exited");
            setOutput(
              (current) =>
                `${current}\n\n[terminal exited] code=${event.payload.exitCode} signal=${event.payload.signal ?? "none"}\n`
            );
            return;
          }

          if (event.type === "terminal.error") {
            setError(event.payload.message);
          }
        }
      });

      client.resize(120, 32);
      setTerminalClient(client);
    } catch (requestError) {
      setStatus("idle");
      setError(requestError instanceof Error ? requestError.message : "创建终端失败");
    }
  }

  function handleSendCommand(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!terminalClient || !command.trim()) {
      return;
    }

    terminalClient.sendInput(`${command}\n`);
    setCommand("");
  }

  function handleCtrlC(): void {
    terminalClient?.sendInput("\u0003");
  }

  return (
    <section className="terminal-panel">
      <div className="chat-header">
        <div>
          <div className="eyebrow">终端工作台</div>
          <h3>{statusLabel}</h3>
          <p className="muted">{session?.cwd ?? rootPath}</p>
        </div>
        <div className="button-row">
          <button className="secondary-button compact" onClick={() => setOutput("")} type="button">
            清屏
          </button>
          <button className="secondary-button compact" disabled={!terminalClient} onClick={handleCtrlC} type="button">
            Ctrl+C
          </button>
          <button className="primary-button" onClick={() => void handleConnect()} type="button">
            {terminalClient ? "重连终端" : "连接终端"}
          </button>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <pre className="terminal-output" ref={outputRef}>
        {output || "终端输出会显示在这里。"}
      </pre>

      <form className="terminal-form" onSubmit={handleSendCommand}>
        <input
          disabled={!terminalClient}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={terminalClient ? "输入命令并回车" : "先连接终端"}
          value={command}
        />
        <button className="primary-button" disabled={!terminalClient || !command.trim()} type="submit">
          发送命令
        </button>
      </form>
    </section>
  );
}
