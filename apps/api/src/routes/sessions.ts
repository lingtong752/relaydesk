import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import {
  parseObjectId,
  serializeMessage,
} from "../db.js";
import { listImportedCliConversationMessages } from "../services/importedCliSessions.js";
import { serializeWorkspaceSession } from "../services/sessionRecords.js";
import {
  streamImportedCliSessionMessage,
  streamProviderMessage
} from "../services/mockStreams.js";

const createSessionSchema = z.object({
  title: z.string().min(1),
  provider: z.enum(["mock", "claude", "codex", "cursor", "gemini"]).default("mock")
});

const createMessageSchema = z.object({
  content: z.string().min(1)
});

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/sessions",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedProjectId = parseObjectId(projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const sessions = await app.db.collections.sessions
        .find({ projectId: parsedProjectId })
        .sort({ updatedAt: -1 })
        .toArray();

      return {
        sessions: sessions.map((session) => serializeWorkspaceSession(session, app.cliSessionRunner))
      };
    }
  );

  app.post(
    "/api/projects/:projectId/sessions",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedProjectId = parseObjectId(projectId);
      const parsedBody = createSessionSchema.safeParse(request.body);

      if (!parsedProjectId || !parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const now = new Date();
      const doc = {
        projectId: parsedProjectId,
        provider: parsedBody.data.provider,
        title: parsedBody.data.title,
        origin: "relaydesk" as const,
        runtimeMode: "api_mode" as const,
        status: "idle" as const,
        createdAt: now,
        updatedAt: now
      };

      const result = await app.db.collections.sessions.insertOne(doc);
      const created = await app.db.collections.sessions.findOne({ _id: result.insertedId });
      if (!created) {
        return reply.code(500).send({ message: "Failed to create session" });
      }

      return { session: serializeWorkspaceSession(created, app.cliSessionRunner) };
    }
  );

  app.get(
    "/api/sessions/:sessionId/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const sessionId = (request.params as { sessionId: string }).sessionId;
      const parsedSessionId = parseObjectId(sessionId);

      if (!parsedSessionId) {
        return reply.code(400).send({ message: "Invalid session id" });
      }

      const session = await app.db.collections.sessions.findOne({ _id: parsedSessionId });
      if (!session) {
        return reply.code(404).send({ message: "Session not found" });
      }

      const project = await app.db.collections.projects.findOne({ _id: session.projectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      if (session.origin === "imported_cli") {
        const overlayMessages = await app.db.collections.messages
          .find({ sessionId: parsedSessionId })
          .sort({ createdAt: 1 })
          .toArray();

        return {
          messages: await listImportedCliConversationMessages({
            session,
            overlayMessages: overlayMessages.map(serializeMessage)
          })
        };
      }

      const messages = await app.db.collections.messages
        .find({ sessionId: parsedSessionId })
        .sort({ createdAt: 1 })
        .toArray();

      return { messages: messages.map(serializeMessage) };
    }
  );

  app.post(
    "/api/sessions/:sessionId/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const sessionId = (request.params as { sessionId: string }).sessionId;
      const parsedSessionId = parseObjectId(sessionId);
      const parsedBody = createMessageSchema.safeParse(request.body);

      if (!parsedSessionId || !parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      const session = await app.db.collections.sessions.findOne({ _id: parsedSessionId });
      if (!session) {
        return reply.code(404).send({ message: "Session not found" });
      }

      const project = await app.db.collections.projects.findOne({ _id: session.projectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      if (session.origin === "imported_cli") {
        if (!app.cliSessionRunner.supportsImportedSession(session.provider)) {
          return reply.code(409).send({
            message: `Imported ${session.provider} sessions cannot continue via local CLI yet`
          });
        }
      }

      const now = new Date();
      const userMessage = {
        sessionId: session._id,
        projectId: session.projectId,
        role: "human" as const,
        senderType: "user" as const,
        provider: session.provider,
        content: parsedBody.data.content,
        status: "completed" as const,
        createdAt: now,
        updatedAt: now
      };

      const inserted = await app.db.collections.messages.insertOne(userMessage);
      const created = await app.db.collections.messages.findOne({ _id: inserted.insertedId });
      if (!created) {
        return reply.code(500).send({ message: "Failed to create message" });
      }

      await app.db.collections.sessions.updateOne(
        { _id: session._id },
        { $set: { status: "running", updatedAt: now, lastMessageAt: now } }
      );

      app.hub.publish(`session:${session._id.toHexString()}`, {
        type: "message.created",
        payload: { message: serializeMessage(created) }
      });

      if (session.origin === "imported_cli") {
        void streamImportedCliSessionMessage({
          cliSessionRunner: app.cliSessionRunner,
          collections: app.db.collections,
          hub: app.hub,
          registry: app.streamRegistry,
          session,
          projectRootPath: project.rootPath,
          prompt: parsedBody.data.content
        });

        return { message: serializeMessage(created) };
      }

      void streamProviderMessage({
        collections: app.db.collections,
        hub: app.hub,
        registry: app.streamRegistry,
        sessionId: session._id,
        projectId: session.projectId,
        provider: session.provider,
        prompt: parsedBody.data.content
      });

      return { message: serializeMessage(created) };
    }
  );

  app.post(
    "/api/sessions/:sessionId/stop",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const sessionId = (request.params as { sessionId: string }).sessionId;
      const parsedSessionId = parseObjectId(sessionId);

      if (!parsedSessionId) {
        return reply.code(400).send({ message: "Invalid session id" });
      }

      const session = await app.db.collections.sessions.findOne({ _id: parsedSessionId });
      if (!session) {
        return reply.code(404).send({ message: "Session not found" });
      }

      const project = await app.db.collections.projects.findOne({ _id: session.projectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      app.streamRegistry.stopSession(session._id.toHexString());
      await app.db.collections.sessions.updateOne(
        { _id: session._id },
        { $set: { status: "stopped", updatedAt: new Date() } }
      );

      return { ok: true };
    }
  );
}
