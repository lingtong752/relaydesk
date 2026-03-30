import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { parseObjectId } from "../db.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import { readProjectSettingsSummary } from "../services/settingsSummary.js";
import { SettingsSyncError, saveProjectSettings } from "../services/settingsSync.js";

const saveSettingsSchema = z.object({
  model: z.string().trim().nullable().optional(),
  reasoningEffort: z.string().trim().nullable().optional(),
  approvalPolicy: z.string().trim().nullable().optional(),
  sandboxMode: z.string().trim().nullable().optional(),
  allowedTools: z.array(z.string().trim()).optional(),
  disallowedTools: z.array(z.string().trim()).optional(),
  mcpServers: z.array(
    z.object({
      provider: z.enum(["mock", "claude", "codex", "cursor", "gemini"]),
      name: z.string().trim().min(1),
      scope: z.enum(["global", "project"]),
      sourcePath: z.string(),
      transport: z.enum(["stdio", "http", "sse", "unknown"]),
      command: z.string().optional(),
      url: z.string().optional(),
      enabled: z.boolean().optional()
    })
  ).optional()
});

export async function registerSettingsRoutes(
  app: FastifyInstance,
  options: {
    configHomeDir?: string;
  } = {}
): Promise<void> {
  app.get(
    "/api/projects/:projectId/settings",
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
        settings: await readProjectSettingsSummary({
          projectId: project._id!.toHexString(),
          projectRootPath: await resolveProjectRootPath(project.rootPath),
          homeDir: options.configHomeDir
        })
      };
    }
  );

  app.post(
    "/api/projects/:projectId/settings/providers/:provider",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const provider = (request.params as { provider: string }).provider;
      const parsedProjectId = parseObjectId(projectId);
      const parsedBody = saveSettingsSchema.safeParse(request.body);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (provider !== "claude" && provider !== "codex" && provider !== "gemini") {
        return reply.code(400).send({ message: `Saving settings for ${provider} is not supported yet` });
      }

      const project = await app.db.collections.projects.findOne({
        _id: parsedProjectId,
        ownerId
      });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      try {
        return {
          settings: await saveProjectSettings({
            projectId: project._id!.toHexString(),
            projectRootPath: await resolveProjectRootPath(project.rootPath),
            homeDir: options.configHomeDir,
            update: {
              provider,
              ...parsedBody.data
            }
          })
        };
      } catch (error) {
        if (error instanceof SettingsSyncError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        return reply.code(500).send({ message: "Failed to save settings" });
      }
    }
  );
}
