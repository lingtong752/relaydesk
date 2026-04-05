import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import type { TerminalSessionRecord } from "@shared";
import { getAuthUser } from "../auth.js";
import { parseObjectId } from "../db.js";
import { getProviderTerminalSupport } from "../services/providerCore/index.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import { sendRouteContractError } from "../services/routeContracts.js";
import { serializeWorkspaceSession } from "../services/sessionRecords.js";
import { TerminalManagerError } from "../services/terminalManager.js";

export async function registerTerminalRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/terminal/sessions",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const ownerId = new ObjectId(authUser.userId);
        const projectId = (request.params as { projectId: string }).projectId;
        const parsedProjectId = parseObjectId(projectId);

        if (!parsedProjectId) {
          return sendRouteContractError(reply, "invalidProjectId");
        }

        const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
        if (!project) {
          return sendRouteContractError(reply, "projectNotFound");
        }

        return {
          sessions: app.terminalManager.listSessions(project._id!.toHexString(), authUser.userId)
        };
      } catch (error) {
        if (error instanceof TerminalManagerError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to list terminal sessions" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/terminal/session",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const ownerId = new ObjectId(authUser.userId);
        const projectId = (request.params as { projectId: string }).projectId;
        const body = ((request.body ?? {}) as { sourceSessionId?: string | null }) ?? {};
        const parsedProjectId = parseObjectId(projectId);

        if (!parsedProjectId) {
          return sendRouteContractError(reply, "invalidProjectId");
        }

        const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
        if (!project) {
          return sendRouteContractError(reply, "projectNotFound");
        }

        let sourceSession: TerminalSessionRecord["sourceSession"] | undefined;
        let backend:
          | Partial<
              Pick<
                TerminalSessionRecord,
                "backendType" | "provider" | "attachMode" | "supportsInput" | "supportsResize" | "fallbackReason"
              >
            >
          | undefined;

        if (body.sourceSessionId) {
          const parsedSourceSessionId = parseObjectId(body.sourceSessionId);
          if (!parsedSourceSessionId) {
            return reply.code(400).send({ message: "Invalid source session id" });
          }

          const sourceSessionDoc = await app.db.collections.sessions.findOne({
            _id: parsedSourceSessionId,
            projectId: parsedProjectId
          });
          if (!sourceSessionDoc) {
            return reply.code(404).send({ message: "Source session not found" });
          }

          const workspaceSession = serializeWorkspaceSession(sourceSessionDoc, app.cliSessionRunner);
          if (!workspaceSession.capabilities?.canAttachTerminal) {
            return reply.code(400).send({ message: "This session cannot attach a terminal" });
          }

          const existingSession = app.terminalManager.findSessionBySourceSession(
            project._id!.toHexString(),
            authUser.userId,
            workspaceSession.id
          );
          if (existingSession) {
            return { session: existingSession };
          }

          sourceSession = {
            id: workspaceSession.id,
            title: workspaceSession.title,
            provider: workspaceSession.provider,
            origin: workspaceSession.origin,
            runtimeMode: workspaceSession.runtimeMode
          };

          const terminalSupport = getProviderTerminalSupport({
            provider: workspaceSession.provider,
            origin: workspaceSession.origin,
            runtimeMode: workspaceSession.runtimeMode
          });
          backend = {
            backendType: terminalSupport.backendType,
            provider: workspaceSession.provider,
            attachMode: terminalSupport.attachMode,
            supportsInput: terminalSupport.supportsInput,
            supportsResize: terminalSupport.supportsResize,
            fallbackReason: terminalSupport.fallbackReason ?? null
          };
        }

        const session = await app.terminalManager.createSession({
          ownerId: authUser.userId,
          projectId: project._id!.toHexString(),
          cwd: await resolveProjectRootPath(project.rootPath),
          sourceSession,
          backend
        });

        return { session };
      } catch (error) {
        if (error instanceof TerminalManagerError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to create terminal session" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/terminal/sessions/:sessionId/close",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const ownerId = new ObjectId(authUser.userId);
        const params = request.params as { projectId: string; sessionId: string };
        const parsedProjectId = parseObjectId(params.projectId);

        if (!parsedProjectId) {
          return sendRouteContractError(reply, "invalidProjectId");
        }

        const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
        if (!project) {
          return sendRouteContractError(reply, "projectNotFound");
        }

        app.terminalManager.closeSession(params.sessionId, authUser.userId);
        return { ok: true };
      } catch (error) {
        if (error instanceof TerminalManagerError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to close terminal session" });
      }
    }
  );
}
