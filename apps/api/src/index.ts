import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import { connectDatabase } from "./db.js";
import { authenticate } from "./auth.js";
import { env } from "./env.js";
import { SessionHub } from "./ws/sessionHub.js";
import { StreamRegistry } from "./services/mockStreams.js";
import { TerminalManager, TerminalManagerError } from "./services/terminalManager.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerTerminalRoutes } from "./routes/terminal.js";
import { registerGitRoutes } from "./routes/git.js";
import type { WebSocketClientMessage } from "@shared";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    hub: SessionHub;
    streamRegistry: StreamRegistry;
    terminalManager: TerminalManager;
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

const app = Fastify({ logger: true });
const db = await connectDatabase(env.MONGODB_URI, env.MONGODB_DB);
const hub = new SessionHub();
const streamRegistry = new StreamRegistry();
const terminalManager = new TerminalManager();

app.decorate("db", db);
app.decorate("hub", hub);
app.decorate("streamRegistry", streamRegistry);
app.decorate("terminalManager", terminalManager);
app.decorate("authenticate", authenticate);

await app.register(cors, {
  origin: env.WEB_ORIGIN,
  credentials: true
});

await app.register(jwt, {
  secret: env.JWT_SECRET
});

await app.register(websocket);

await registerHealthRoutes(app);
await registerAuthRoutes(app);
await registerProjectRoutes(app);
await registerSessionRoutes(app);
await registerRunRoutes(app);
await registerApprovalRoutes(app);
await registerFileRoutes(app);
await registerTerminalRoutes(app);
await registerGitRoutes(app);

app.get("/ws", { websocket: true }, (connection, request) => {
  const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "127.0.0.1"}`);
  const token = url.searchParams.get("token");

  if (!token) {
    connection.socket.close();
    return;
  }

  try {
    app.jwt.verify(token);
  } catch {
    connection.socket.close();
    return;
  }

  connection.socket.on("message", (raw: Buffer) => {
    try {
      const parsed = JSON.parse(raw.toString()) as WebSocketClientMessage;
      if (parsed.type === "subscribe") {
        hub.subscribe(parsed.channel, connection.socket as unknown as WebSocket);
        connection.socket.send(
          JSON.stringify({
            type: "session.subscribed",
            payload: { channel: parsed.channel }
          })
        );
      }
    } catch {
      connection.socket.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Invalid websocket payload" }
        })
      );
    }
  });

  connection.socket.on("close", () => {
    hub.unsubscribeSocket(connection.socket as unknown as WebSocket);
  });
});

app.get("/terminal", { websocket: true }, (connection, request) => {
  const url = new URL(request.url ?? "/terminal", `http://${request.headers.host ?? "127.0.0.1"}`);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId");

  if (!token || !sessionId) {
    connection.socket.close();
    return;
  }

  let authUser: { userId: string; email: string };
  try {
    authUser = app.jwt.verify(token) as { userId: string; email: string };
  } catch {
    connection.socket.close();
    return;
  }

  try {
    app.terminalManager.attachSocket(
      sessionId,
      authUser.userId,
      connection.socket as unknown as WebSocket
    );
  } catch {
    connection.socket.close();
    return;
  }

  connection.socket.on("message", (raw: Buffer) => {
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
      connection.socket.send(JSON.stringify({ type: "terminal.error", payload }));
    }
  });

  connection.socket.on("close", () => {
    app.terminalManager.detachSocket(sessionId, connection.socket as unknown as WebSocket);
  });
});

await app.listen({ host: "0.0.0.0", port: env.PORT });

app.log.info(`API server listening on ${env.PORT}`);
