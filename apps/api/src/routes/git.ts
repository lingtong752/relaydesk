import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { parseObjectId } from "../db.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import {
  checkoutGitBranch,
  commitGitChanges,
  fetchGitRemote,
  GitWorkspaceError,
  listGitBranches,
  listGitRemotes,
  pullGitBranch,
  pushGitBranch,
  readGitDiff,
  readGitStatus,
  stageGitFiles,
  unstageGitFiles
} from "../services/gitWorkspace.js";

const gitDiffQuerySchema = z.object({
  path: z.string().optional()
});

const gitPathsBodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1)
});

const gitCommitBodySchema = z.object({
  message: z.string().min(1)
});

const gitCheckoutBodySchema = z.object({
  name: z.string().min(1),
  create: z.boolean().default(false)
});

const gitRemoteBodySchema = z.object({
  remote: z.string().min(1)
});

const gitRemoteBranchBodySchema = z.object({
  remote: z.string().min(1),
  branch: z.string().min(1)
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
        const resolvedRootPath = await resolveProjectRootPath(project.rootPath);

        return { status: await readGitStatus(resolvedRootPath) };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to read Git status" });
      }
    }
  );

  app.get(
    "/api/projects/:projectId/git/branches",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const resolvedRootPath = await resolveProjectRootPath(project.rootPath);

        return { branches: await listGitBranches(resolvedRootPath) };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to read Git branches" });
      }
    }
  );

  app.get(
    "/api/projects/:projectId/git/remotes",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const resolvedRootPath = await resolveProjectRootPath(project.rootPath);

        return { remotes: await listGitRemotes(resolvedRootPath) };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to read Git remotes" });
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

        return {
          diff: await readGitDiff(
            await resolveProjectRootPath(project.rootPath),
            parsedQuery.data.path
          )
        };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to read Git diff" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/stage",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitPathsBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "At least one file path is required" });
        }

        await stageGitFiles(await resolveProjectRootPath(project.rootPath), parsedBody.data.paths);
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to stage Git changes" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/unstage",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitPathsBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "At least one file path is required" });
        }

        await unstageGitFiles(await resolveProjectRootPath(project.rootPath), parsedBody.data.paths);
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to unstage Git changes" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/commit",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitCommitBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "Commit message is required" });
        }

        await commitGitChanges(
          await resolveProjectRootPath(project.rootPath),
          parsedBody.data.message
        );
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to commit Git changes" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/checkout",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitCheckoutBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "Branch name is required" });
        }

        await checkoutGitBranch({
          rootPath: await resolveProjectRootPath(project.rootPath),
          branchName: parsedBody.data.name,
          create: parsedBody.data.create
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to switch Git branch" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/fetch",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitRemoteBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "Remote name is required" });
        }

        await fetchGitRemote({
          rootPath: await resolveProjectRootPath(project.rootPath),
          remoteName: parsedBody.data.remote
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to fetch Git remote" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/pull",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitRemoteBranchBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "Remote name and branch are required" });
        }

        await pullGitBranch({
          rootPath: await resolveProjectRootPath(project.rootPath),
          remoteName: parsedBody.data.remote,
          branchName: parsedBody.data.branch
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to pull Git changes" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/git/push",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const authUser = getAuthUser(request);
        const project = await getOwnedProject(
          app,
          authUser.userId,
          (request.params as { projectId: string }).projectId
        );
        const parsedBody = gitRemoteBranchBodySchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.code(400).send({ message: "Remote name and branch are required" });
        }

        await pushGitBranch({
          rootPath: await resolveProjectRootPath(project.rootPath),
          remoteName: parsedBody.data.remote,
          branchName: parsedBody.data.branch
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to push Git changes" });
      }
    }
  );
}
