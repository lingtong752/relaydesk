import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { WebSocketClientMessage } from "@shared";
import { authenticate } from "./auth.js";
import type { Database } from "./db.js";
import { connectDatabase } from "./db.js";
import { env, getAuthEnv, getDatabaseEnv } from "./env.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerGitRoutes } from "./routes/git.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPluginRoutes } from "./routes/plugins.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerTerminalRoutes } from "./routes/terminal.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { LocalCliSessionRunner, type CliSessionRunner } from "./services/cliSessionRunner.js";
import { StreamRegistry } from "./services/mockStreams.js";
import { TerminalManager, TerminalManagerError } from "./services/terminalManager.js";
import { SessionHub } from "./ws/sessionHub.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface CreateAppOptions {
  db?: Database;
  discoveryHomeDir?: string;
  configHomeDir?: string;
  jwtSecret?: string;
  webOrigin?: string;
  logger?: boolean;
  terminalManager?: TerminalManager;
  cliSessionRunner?: CliSessionRunner;
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function expandAllowedOriginAliases(origin: string): string[] {
  try {
    const url = new URL(origin);
    const hostname = normalizeHostname(url.hostname);

    if (!LOOPBACK_HOSTS.has(hostname)) {
      return [url.origin];
    }

    const port = url.port ? `:${url.port}` : "";
    return ["127.0.0.1", "localhost", "[::1]"].map(
      (loopbackHost) => `${url.protocol}//${loopbackHost}${port}`
    );
  } catch {
    return [origin];
  }
}

function createAllowedOriginSet(configuredOrigins: string): Set<string> {
  return new Set(
    configuredOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .flatMap((origin) => expandAllowedOriginAliases(origin))
  );
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  const db = options.db
    ? options.db
    : await (async () => {
        const dbConfig = getDatabaseEnv();
        return connectDatabase(dbConfig.MONGODB_URI, dbConfig.MONGODB_DB);
      })();
  const shouldCloseDb = !options.db;
  const hub = new SessionHub();
  const streamRegistry = new StreamRegistry();
  const terminalManager = options.terminalManager ?? new TerminalManager();
  const cliSessionRunner = options.cliSessionRunner ?? new LocalCliSessionRunner();
  const allowedOrigins = createAllowedOriginSet(options.webOrigin ?? env.WEB_ORIGIN);

  app.decorate("db", db);
  app.decorate("hub", hub);
  app.decorate("cliSessionRunner", cliSessionRunner);
  app.decorate("streamRegistry", streamRegistry);
  app.decorate("terminalManager", terminalManager);
  app.decorate("authenticate", authenticate);

  if (shouldCloseDb) {
    app.addHook("onClose", async () => {
      await db.client.close();
    });
  }

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true
  });

  await app.register(jwt, {
    secret: options.jwtSecret ?? getAuthEnv().JWT_SECRET
  });

  await app.register(websocket);

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerProjectRoutes(app, {
    discoveryHomeDir: options.discoveryHomeDir
  });
  await registerPluginRoutes(app);
  await registerTaskRoutes(app);
  await registerSettingsRoutes(app, {
    configHomeDir: options.configHomeDir
  });
  await registerSessionRoutes(app);
  await registerRunRoutes(app);
  await registerApprovalRoutes(app);
  await registerFileRoutes(app);
  await registerTerminalRoutes(app);
  await registerGitRoutes(app);

  app.get("/ws", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "127.0.0.1"}`);
    const headerToken = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice("Bearer ".length)
      : null;
    const token = url.searchParams.get("token") ?? headerToken;

    if (!token) {
      socket.close();
      return;
    }

    try {
      app.jwt.verify(token);
    } catch {
      socket.close();
      return;
    }

    socket.on("message", (raw: Buffer) => {
      try {
        const parsed = JSON.parse(raw.toString()) as WebSocketClientMessage;
        if (parsed.type === "subscribe") {
          hub.subscribe(parsed.channel, socket as unknown as WebSocket);
          socket.send(
            JSON.stringify({
              type: "session.subscribed",
              payload: { channel: parsed.channel }
            })
          );
        }
      } catch {
        socket.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Invalid websocket payload" }
          })
        );
      }
    });

    socket.on("close", () => {
      hub.unsubscribeSocket(socket as unknown as WebSocket);
    });
  });

  app.get("/terminal", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/terminal", `http://${request.headers.host ?? "127.0.0.1"}`);
    const token = url.searchParams.get("token");
    const sessionId = url.searchParams.get("sessionId");

    if (!token || !sessionId) {
      socket.close();
      return;
    }

    let authUser: { userId: string; email: string };
    try {
      authUser = app.jwt.verify(token) as { userId: string; email: string };
    } catch {
      socket.close();
      return;
    }

    try {
      app.terminalManager.attachSocket(
        sessionId,
        authUser.userId,
        socket as unknown as WebSocket
      );
    } catch {
      socket.close();
      return;
    }

    socket.on("message", (raw: Buffer) => {
      try {
        const parsed = JSON.parse(raw.toString()) as
          | { type: "input"; payload: { data: string } }
          | { type: "resize"; payload: { cols: number; rows: number } };

        if (parsed.type === "input") {
          app.terminalManager.writeInput(sessionId, authUser.userId, parsed.payload.data);
          return;
        }

        if (parsed.type === "resize") {
          app.terminalManager.resize(
            sessionId,
            authUser.userId,
            parsed.payload.cols,
            parsed.payload.rows
          );
        }
      } catch (error) {
        const payload =
          error instanceof TerminalManagerError
            ? { message: error.message }
            : { message: "Invalid terminal payload" };
        socket.send(JSON.stringify({ type: "terminal.error", payload }));
      }
    });

    socket.on("close", () => {
      app.terminalManager.detachSocket(sessionId, socket as unknown as WebSocket);
    });
  });

  return app;
}
