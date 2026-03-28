import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { getAuthUser } from "../auth.js";
import { parseObjectId } from "../db.js";
import { TerminalManagerError } from "../services/terminalManager.js";

export async function registerTerminalRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/projects/:projectId/terminal/session",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
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

        const session = await app.terminalManager.createSession({
          ownerId: authUser.userId,
          projectId: project._id!.toHexString(),
          cwd: project.rootPath
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
}
