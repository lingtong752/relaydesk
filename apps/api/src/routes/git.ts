import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { parseObjectId } from "../db.js";
import { GitWorkspaceError, readGitDiff, readGitStatus } from "../services/gitWorkspace.js";

const gitDiffQuerySchema = z.object({
  path: z.string().optional()
});

async function getOwnedProject(
  app: FastifyInstance,
  userId: string,
  projectId: string
) {
  const ownerId = new ObjectId(userId);
  const parsedProjectId = parseObjectId(projectId);
  if (!parsedProjectId) {
    throw new GitWorkspaceError(400, "Invalid project id");
  }

  const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
  if (!project) {
    throw new GitWorkspaceError(404, "Project not found");
  }

  return project;
}

export async function registerGitRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/git/status",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );

        return { status: await readGitStatus(project.rootPath) };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to read Git status" });
      }
    }
  );

  app.get(
    "/api/projects/:projectId/git/diff",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedQuery = gitDiffQuerySchema.safeParse(request.query);
        if (!parsedQuery.success || !parsedQuery.data.path) {
          return reply.code(400).send({ message: "File path is required" });
        }

        return { diff: await readGitDiff(project.rootPath, parsedQuery.data.path) };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to read Git diff" });
      }
    }
  );
}
