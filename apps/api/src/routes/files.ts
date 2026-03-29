import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { parseObjectId } from "../db.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import {
  WorkspaceFileError,
  listWorkspaceFiles,
  readWorkspaceFile,
  searchWorkspaceFiles,
  saveWorkspaceFile
} from "../services/workspaceFiles.js";

const filePathQuerySchema = z.object({
  path: z.string().optional()
});

const fileSearchQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const saveFileSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

async function getOwnedProject(
  app: FastifyInstance,
  userId: string,
  projectId: string
) {
  const ownerId = new ObjectId(userId);
  const parsedProjectId = parseObjectId(projectId);

  if (!parsedProjectId) {
    throw new WorkspaceFileError(400, "Invalid project id");
  }

  const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
  if (!project) {
    throw new WorkspaceFileError(404, "Project not found");
  }

  return project;
}

function handleWorkspaceFileError(error: unknown): WorkspaceFileError {
  if (error instanceof WorkspaceFileError) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  ) {
    return new WorkspaceFileError(404, "Workspace path not found");
  }

  return new WorkspaceFileError(500, "Unexpected file workspace error");
}

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/files",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedQuery = filePathQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: "Invalid query" });
        }

        const resolvedRootPath = await resolveProjectRootPath(project.rootPath);
        const result = await listWorkspaceFiles(resolvedRootPath, parsedQuery.data.path);
        return { ...result, rootPath: resolvedRootPath };
      } catch (error) {
        const handled = handleWorkspaceFileError(error);
        return reply.code(handled.statusCode).send({ message: handled.message });
      }
    }
  );

  app.get(
    "/api/projects/:projectId/files/content",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedQuery = filePathQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: "Invalid query" });
        }

        return {
          file: await readWorkspaceFile(
            await resolveProjectRootPath(project.rootPath),
            parsedQuery.data.path
          )
        };
      } catch (error) {
        const handled = handleWorkspaceFileError(error);
        return reply.code(handled.statusCode).send({ message: handled.message });
      }
    }
  );

  app.get(
    "/api/projects/:projectId/files/search",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedQuery = fileSearchQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: "Invalid query" });
        }

        return {
          entries: await searchWorkspaceFiles({
            rootPath: await resolveProjectRootPath(project.rootPath),
            query: parsedQuery.data.query ?? "",
            limit: parsedQuery.data.limit
          })
        };
      } catch (error) {
        const handled = handleWorkspaceFileError(error);
        return reply.code(handled.statusCode).send({ message: handled.message });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/files/save",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = saveFileSchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "Invalid payload" });
        }

        return {
          file: await saveWorkspaceFile({
            rootPath: await resolveProjectRootPath(project.rootPath),
            relativePath: parsedBody.data.path,
            content: parsedBody.data.content
          })
        };
      } catch (error) {
        const handled = handleWorkspaceFileError(error);
        return reply.code(handled.statusCode).send({ message: handled.message });
      }
    }
  );
}
