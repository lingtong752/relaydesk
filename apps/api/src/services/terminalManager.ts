import path from "node:path";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import type { IPty } from "node-pty";
import type { TerminalSessionRecord } from "@shared";

const SESSION_TTL_MS = 5 * 60 * 1000;
const OUTPUT_BUFFER_LIMIT = 100_000;
const require = createRequire(import.meta.url);

interface NodePtyNativeModule {
  dir: string;
}

interface NodePtyLike {
  spawn(
    file: string,
    args: string[],
    options: {
      name: string;
      cwd: string;
      cols: number;
      rows: number;
      env: NodeJS.ProcessEnv;
    }
  ): IPty;
}

interface NodePtyRuntime {
  pty: NodePtyLike;
  spawnHelperPath: string | null;
}

let nodePtyRuntimePromise: Promise<NodePtyRuntime> | null = null;

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

function resolveNodePtySpawnHelperPath(): string | null {
  if (process.platform === "win32") {
    return null;
  }

  try {
    const { loadNativeModule } = require("node-pty/lib/utils") as {
      loadNativeModule: (name: string) => NodePtyNativeModule;
    };
    const native = loadNativeModule("pty");
    const unixTerminalPath = require.resolve("node-pty/lib/unixTerminal");
    let helperPath = path.resolve(path.dirname(unixTerminalPath), native.dir, "spawn-helper");
    helperPath = helperPath.replace("app.asar", "app.asar.unpacked");
    helperPath = helperPath.replace("node_modules.asar", "node_modules.asar.unpacked");
    return helperPath;
  } catch {
    return null;
  }
}

async function loadNodePtyRuntime(): Promise<NodePtyRuntime> {
  if (!nodePtyRuntimePromise) {
    nodePtyRuntimePromise = (async () => {
      const module = await import("node-pty");
      return {
        pty: module.default as NodePtyLike,
        spawnHelperPath: resolveNodePtySpawnHelperPath()
      };
    })();
  }

  return nodePtyRuntimePromise;
}

export function resetNodePtyRuntimeForTests(): void {
  nodePtyRuntimePromise = null;
}

export async function ensureExecutablePermissions(filePath: string | null): Promise<void> {
  if (!filePath) {
    return;
  }

  try {
    await access(filePath, fsConstants.X_OK);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
  }

  const currentStats = await stat(filePath);
  const nextMode = currentStats.mode | 0o111;
  if (nextMode !== currentStats.mode) {
    await chmod(filePath, nextMode);
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
    let nodePtyRuntime: NodePtyRuntime;
    try {
      nodePtyRuntime = await loadNodePtyRuntime();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown node-pty error";
      throw new TerminalManagerError(
        500,
        `Terminal support is unavailable on this host: ${message}`
      );
    }

    await ensureExecutablePermissions(nodePtyRuntime.spawnHelperPath);

    const shell = process.env.SHELL || "/bin/zsh";
    let terminal: IPty;

    try {
      terminal = nodePtyRuntime.pty.spawn(shell, [], {
        name: "xterm-256color",
        cwd: input.cwd,
        cols: 120,
        rows: 32,
        env: {
          ...process.env,
          TERM: "xterm-256color"
        }
      });
    } catch (error) {
      throw this.toTerminalManagerError(error, shell);
    }

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

  listSessions(projectId: string, ownerId: string): TerminalSessionRecord[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.projectId === projectId && session.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((session) => this.serializeSession(session));
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

  closeSession(sessionId: string, ownerId: string): void {
    this.getSession(sessionId, ownerId);
    this.destroySession(sessionId);
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

  private toTerminalManagerError(error: unknown, shell: string): TerminalManagerError {
    const message = error instanceof Error ? error.message : "Unknown terminal error";
    if (message.includes("posix_spawnp failed")) {
      return new TerminalManagerError(
        500,
        `Failed to launch terminal shell (${shell}). Check node-pty spawn-helper permissions.`
      );
    }

    return new TerminalManagerError(500, `Failed to launch terminal shell (${shell}): ${message}`);
  }
}
