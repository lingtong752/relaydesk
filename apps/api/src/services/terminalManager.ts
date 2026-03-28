import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pty, { type IPty } from "node-pty";
import type { TerminalSessionRecord } from "@shared";

const SESSION_TTL_MS = 5 * 60 * 1000;
const OUTPUT_BUFFER_LIMIT = 100_000;

interface TerminalSession {
  id: string;
  projectId: string;
  ownerId: string;
  cwd: string;
  shell: string;
  createdAt: Date;
  pty: IPty;
  sockets: Set<WebSocket>;
  buffer: string;
  cleanupTimer?: NodeJS.Timeout;
}

export class TerminalManagerError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  async createSession(input: {
    ownerId: string;
    projectId: string;
    cwd: string;
  }): Promise<TerminalSessionRecord> {
    await mkdir(input.cwd, { recursive: true });

    const shell = process.env.SHELL || "/bin/zsh";
    const terminal = pty.spawn(shell, [], {
      name: "xterm-256color",
      cwd: input.cwd,
      cols: 120,
      rows: 32,
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
    });

    const session: TerminalSession = {
      id: randomUUID(),
      projectId: input.projectId,
      ownerId: input.ownerId,
      cwd: input.cwd,
      shell,
      createdAt: new Date(),
      pty: terminal,
      sockets: new Set(),
      buffer: ""
    };

    terminal.onData((chunk) => {
      session.buffer = `${session.buffer}${chunk}`;
      if (session.buffer.length > OUTPUT_BUFFER_LIMIT) {
        session.buffer = session.buffer.slice(-OUTPUT_BUFFER_LIMIT);
      }

      const payload = JSON.stringify({
        type: "terminal.output",
        payload: { data: chunk }
      });

      for (const socket of session.sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
        }
      }
    });

    terminal.onExit(({ exitCode, signal }) => {
      const payload = JSON.stringify({
        type: "terminal.exit",
        payload: { exitCode, signal }
      });

      for (const socket of session.sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
        }
      }

      this.destroySession(session.id);
    });

    this.sessions.set(session.id, session);
    return this.serializeSession(session);
  }

  getSession(sessionId: string, ownerId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) {
      throw new TerminalManagerError(404, "Terminal session not found");
    }

    return session;
  }

  attachSocket(sessionId: string, ownerId: string, socket: WebSocket): TerminalSession {
    const session = this.getSession(sessionId, ownerId);
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = undefined;
    }

    session.sockets.add(socket);

    socket.send(
      JSON.stringify({
        type: "terminal.ready",
        payload: { session: this.serializeSession(session), backlog: session.buffer }
      })
    );

    return session;
  }

  detachSocket(sessionId: string, socket: WebSocket): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.sockets.delete(socket);
    if (session.sockets.size === 0) {
      session.cleanupTimer = setTimeout(() => {
        this.destroySession(session.id);
      }, SESSION_TTL_MS);
    }
  }

  writeInput(sessionId: string, ownerId: string, input: string): void {
    const session = this.getSession(sessionId, ownerId);
    session.pty.write(input);
  }

  resize(sessionId: string, ownerId: string, cols: number, rows: number): void {
    const session = this.getSession(sessionId, ownerId);
    session.pty.resize(Math.max(20, cols), Math.max(8, rows));
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
    }

    try {
      session.pty.kill();
    } catch {
      // Ignore errors during cleanup.
    }

    for (const socket of session.sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.close();
      }
    }

    this.sessions.delete(sessionId);
  }

  private serializeSession(session: TerminalSession): TerminalSessionRecord {
    return {
      id: session.id,
      projectId: session.projectId,
      cwd: session.cwd,
      shell: session.shell,
      createdAt: session.createdAt.toISOString()
    };
  }
}
