import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import type { PluginHostContextRecord } from "@shared";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { parseObjectId, serializePluginInstallation } from "../db.js";
import { findProjectPlugin, listProjectPluginCatalog } from "../services/pluginCatalog.js";
import { executePluginAction, PluginRuntimeError } from "../services/pluginRuntime.js";

const installPluginSchema = z.object({
  pluginId: z.string().trim().min(1)
});

const updatePluginStateSchema = z.object({
  enabled: z.boolean()
});

const executePluginActionSchema = z.object({
  inputs: z.record(z.string(), z.string().max(4000)).default({})
});

async function getOwnedProject(
  app: FastifyInstance,
  ownerId: ObjectId,
  projectId: string
) {
  const parsedProjectId = parseObjectId(projectId);
  if (!parsedProjectId) {
    return {
      project: null,
      parsedProjectId: null
    };
  }

  const project = await app.db.collections.projects.findOne({
    _id: parsedProjectId,
    ownerId
  });

  return {
    project,
    parsedProjectId
  };
}

async function buildPluginHostContext(
  app: FastifyInstance,
  projectId: ObjectId
): Promise<PluginHostContextRecord> {
  const project = await app.db.collections.projects.findOne({ _id: projectId });
  if (!project) {
    throw new Error("Project not found");
  }

  const latestSessions = await app.db.collections.sessions
    .find({ projectId })
    .sort({ updatedAt: -1 })
    .limit(5)
    .toArray();
  const allSessions = await app.db.collections.sessions.find({ projectId }).toArray();
  const activeRun =
    (await app.db.collections.runs
      .find({
        projectId,
        status: {
          $in: ["running", "waiting_human", "paused"]
        }
      })
      .sort({ startedAt: -1 })
      .limit(1)
      .toArray())[0] ?? null;
  const latestRun =
    (await app.db.collections.runs
      .find({ projectId })
      .sort({ startedAt: -1 })
      .limit(1)
      .toArray())[0] ?? null;
  const pendingApprovalCount = (
    await app.db.collections.approvals.find({ projectId, status: "pending" }).toArray()
  ).length;

  return {
    projectId: project._id!.toHexString(),
    projectName: project.name,
    projectRootPath: project.rootPath,
    activeProviders: [...new Set(allSessions.map((session) => session.provider))].sort((left, right) =>
      left.localeCompare(right)
    ),
    sessionCount: allSessions.length,
    importedSessionCount: allSessions.filter((session) => session.origin === "imported_cli").length,
    pendingApprovalCount,
    latestSessions: latestSessions.map((session) => ({
      id: session._id!.toHexString(),
      projectId: session.projectId.toHexString(),
      provider: session.provider,
      title: session.title,
      origin: session.origin,
      externalSessionId: session.externalSessionId,
      sourcePath: session.sourcePath,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      lastMessageAt: session.lastMessageAt?.toISOString()
    })),
    activeRun: activeRun
      ? {
          id: activeRun._id!.toHexString(),
          projectId: activeRun.projectId.toHexString(),
          sessionId: activeRun.sessionId.toHexString(),
          provider: activeRun.provider,
          objective: activeRun.objective,
          constraints: activeRun.constraints,
          status: activeRun.status,
          startedAt: activeRun.startedAt.toISOString(),
          updatedAt: activeRun.updatedAt.toISOString(),
          stoppedAt: activeRun.stoppedAt?.toISOString()
        }
      : null,
    latestRun: latestRun
      ? {
          id: latestRun._id!.toHexString(),
          projectId: latestRun.projectId.toHexString(),
          sessionId: latestRun.sessionId.toHexString(),
          provider: latestRun.provider,
          objective: latestRun.objective,
          constraints: latestRun.constraints,
          status: latestRun.status,
          startedAt: latestRun.startedAt.toISOString(),
          updatedAt: latestRun.updatedAt.toISOString(),
          stoppedAt: latestRun.stoppedAt?.toISOString()
        }
      : null
  };
}

async function recordPluginExecutionAuditEvent(
  app: FastifyInstance,
  input: {
    projectId: ObjectId;
    pluginId: string;
    actionId: string;
    summary: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await app.db.collections.auditEvents.insertOne({
    _id: new ObjectId(),
    projectId: input.projectId,
    eventType: "plugin.action.executed",
    actorType: "user",
    summary: input.summary,
    payload: {
      pluginId: input.pluginId,
      actionId: input.actionId,
      ...input.payload
    },
    createdAt: new Date()
  });
}

export async function registerPluginRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/plugins/catalog",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      return {
        plugins: await listProjectPluginCatalog(project.rootPath)
      };
    }
  );

  app.get(
    "/api/projects/:projectId/plugins",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installations = await app.db.collections.pluginInstallations
        .find({ projectId: parsedProjectId })
        .sort({ updatedAt: -1 })
        .toArray();

      return {
        installations: installations.map(serializePluginInstallation)
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/install",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedBody = installPluginSchema.safeParse(request.body);
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const plugin = await findProjectPlugin(project.rootPath, parsedBody.data.pluginId);
      if (!plugin) {
        return reply.code(404).send({ message: "Plugin not found in project plugin catalog" });
      }

      const now = new Date();
      const existing = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId: plugin.id
      });

      if (existing) {
        await app.db.collections.pluginInstallations.updateOne(
          { _id: existing._id },
          {
            $set: {
              sourceType: plugin.sourceType,
              sourceRef: plugin.sourceRef ?? null,
              name: plugin.name,
              version: plugin.version,
              description: plugin.description,
              capabilities: plugin.capabilities,
              tabTitle: plugin.tabTitle,
              routeSegment: plugin.routeSegment,
              frontendComponent: plugin.frontendComponent,
              backendService: plugin.backendService,
              actions: plugin.actions,
              enabled: true,
              updatedAt: now
            }
          }
        );

        const refreshed = await app.db.collections.pluginInstallations.findOne({ _id: existing._id });
        return {
          installation: serializePluginInstallation(refreshed ?? existing)
        };
      }

      const result = await app.db.collections.pluginInstallations.insertOne({
        projectId: parsedProjectId,
        pluginId: plugin.id,
        sourceType: plugin.sourceType,
        sourceRef: plugin.sourceRef ?? null,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        capabilities: plugin.capabilities,
        tabTitle: plugin.tabTitle,
        routeSegment: plugin.routeSegment,
        frontendComponent: plugin.frontendComponent,
        backendService: plugin.backendService,
        actions: plugin.actions,
        enabled: true,
        createdAt: now,
        updatedAt: now
      });
      const installation = await app.db.collections.pluginInstallations.findOne({
        _id: result.insertedId
      });

      return {
        installation: serializePluginInstallation(installation!)
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/state",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const pluginId = (request.params as { projectId: string; pluginId: string }).pluginId;
      const parsedBody = updatePluginStateSchema.safeParse(request.body);
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      await app.db.collections.pluginInstallations.updateOne(
        { _id: installation._id },
        {
          $set: {
            enabled: parsedBody.data.enabled,
            updatedAt: new Date()
          }
        }
      );
      const refreshed = await app.db.collections.pluginInstallations.findOne({ _id: installation._id });

      return {
        installation: serializePluginInstallation(refreshed ?? installation)
      };
    }
  );

  app.get(
    "/api/projects/:projectId/plugins/:pluginId/context",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const pluginId = (request.params as { projectId: string; pluginId: string }).pluginId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      return {
        installation: serializePluginInstallation(installation),
        context: await buildPluginHostContext(app, parsedProjectId)
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/actions/:actionId/execute",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const { projectId, pluginId, actionId } = request.params as {
        projectId: string;
        pluginId: string;
        actionId: string;
      };
      const parsedBody = executePluginActionSchema.safeParse(request.body ?? {});
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      if (!installation.enabled) {
        return reply.code(409).send({ message: "Plugin is disabled" });
      }

      try {
        const execution = await executePluginAction({
          projectRootPath: project.rootPath,
          plugin: serializePluginInstallation(installation),
          actionId,
          rawInputs: parsedBody.data.inputs
        });

        await recordPluginExecutionAuditEvent(app, {
          projectId: parsedProjectId,
          pluginId,
          actionId,
          summary: `${installation.name} 执行了动作 ${actionId}。`,
          payload: {
            sourceType: installation.sourceType,
            cwd: execution.cwd,
            command: execution.command,
            args: execution.args,
            success: execution.success,
            exitCode: execution.exitCode,
            timedOut: execution.timedOut,
            durationMs: execution.durationMs
          }
        });

        return {
          installation: serializePluginInstallation(installation),
          execution
        };
      } catch (error) {
        if (error instanceof PluginRuntimeError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        request.log.error({ err: error, pluginId, actionId }, "plugin action execution failed");
        return reply.code(500).send({ message: "Plugin action execution failed" });
      }
    }
  );
}
