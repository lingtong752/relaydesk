import { getApiBaseUrl } from "./api";

export interface TerminalEventReady {
  type: "terminal.ready";
  payload: {
    backlog: string;
    session: {
      id: string;
      projectId: string;
      cwd: string;
      shell: string;
      createdAt: string;
    };
  };
}

export interface TerminalEventOutput {
  type: "terminal.output";
  payload: { data: string };
}

export interface TerminalEventExit {
  type: "terminal.exit";
  payload: { exitCode: number; signal?: number };
}

export interface TerminalEventError {
  type: "terminal.error";
  payload: { message: string };
}

export type TerminalEvent =
  | TerminalEventReady
  | TerminalEventOutput
  | TerminalEventExit
  | TerminalEventError;

export interface TerminalClient {
  sendInput(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

export function connectTerminal(input: {
  token: string;
  sessionId: string;
  onEvent: (event: TerminalEvent) => void;
}): TerminalClient {
  const wsUrl = `${getApiBaseUrl().replace(/^http/, "ws")}/terminal?token=${encodeURIComponent(input.token)}&sessionId=${encodeURIComponent(input.sessionId)}`;
  const socket = new WebSocket(wsUrl);
  const pendingMessages: string[] = [];

  socket.addEventListener("message", (event) => {
    try {
      input.onEvent(JSON.parse(event.data) as TerminalEvent);
    } catch {
      input.onEvent({
        type: "terminal.error",
        payload: { message: "Terminal event parse error" }
      });
    }
  });

  socket.addEventListener("open", () => {
    while (pendingMessages.length > 0) {
      socket.send(pendingMessages.shift()!);
    }
  });

  function sendOrQueue(message: string): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      pendingMessages.push(message);
    }
  }

  return {
    sendInput(data: string) {
      sendOrQueue(JSON.stringify({ type: "input", payload: { data } }));
    },
    resize(cols: number, rows: number) {
      sendOrQueue(JSON.stringify({ type: "resize", payload: { cols, rows } }));
    },
    close() {
      socket.close();
    }
  };
}
