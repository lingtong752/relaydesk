import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { parseObjectId } from "../db.js";
import { getAuthUser } from "../auth.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import { buildProjectTaskBoard } from "../services/projectTasks.js";

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/tasks",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedProjectId = parseObjectId(projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      const project = await app.db.collections.projects.findOne({
        _id: parsedProjectId,
        ownerId
      });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      return {
        board: await buildProjectTaskBoard({
          projectId: project._id!.toHexString(),
          projectRootPath: await resolveProjectRootPath(project.rootPath)
        })
      };
    }
  );
}
