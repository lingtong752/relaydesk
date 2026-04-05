import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { serializeApproval, serializeAuditEvent, serializeProject, serializeRun } from "../db.js";
import { discoverLocalProjects } from "../services/projectDiscovery.js";
import {
  findDiscoveredProjectByRoot,
  syncImportedCliSessions
} from "../services/importedCliSessions.js";
import {
  normalizeRequestedProjectRootPath,
  resolveProjectRootPath
} from "../services/projectRoot.js";
import {
  buildSessionCapabilitiesMap,
  linkDiscoveredProjects,
  resolveActiveSessionId
} from "../services/projectRouteState.js";
import { serializeWorkspaceSession } from "../services/sessionRecords.js";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  rootPath: z.string().trim().optional(),
  providerPreferences: z.array(z.enum(["mock", "claude", "codex", "cursor", "gemini"])).optional()
});

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: {
    discoveryHomeDir?: string;
  } = {}
): Promise<void> {
  app.get("/api/projects", { preHandler: app.authenticate }, async (request) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const docs = await app.db.collections.projects
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .toArray();

    const projects = await Promise.all(
      docs.map(async (doc) => ({
        ...serializeProject(doc),
        rootPath: await resolveProjectRootPath(doc.rootPath)
      }))
    );

    return { projects };
  });

  app.get("/api/projects/discovery", { preHandler: app.authenticate }, async (request) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const docs = await app.db.collections.projects
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .toArray();

    const projects = await Promise.all(
      docs.map(async (doc) => ({
        ...serializeProject(doc),
        rootPath: await resolveProjectRootPath(doc.rootPath)
      }))
    );

    const discoveredProjects = await discoverLocalProjects({
      homeDir: options.discoveryHomeDir,
      knownProjectRoots: projects.map((project) => project.rootPath)
    });

    return {
      projects: linkDiscoveredProjects(discoveredProjects, projects)
    };
  });

  app.post("/api/projects", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid payload" });
    }

    const authUser = getAuthUser(request);
    const now = new Date();
    const resolvedRootPath = await resolveProjectRootPath(
      normalizeRequestedProjectRootPath(parsed.data.rootPath)
    );
    const existingProject = await app.db.collections.projects.findOne({
      ownerId: new ObjectId(authUser.userId),
      rootPath: resolvedRootPath
    });
    if (existingProject) {
      return { project: serializeProject(existingProject) };
    }

    const doc = {
      ownerId: new ObjectId(authUser.userId),
      name: parsed.data.name,
      rootPath: resolvedRootPath,
      providerPreferences: parsed.data.providerPreferences ?? ["mock"],
      createdAt: now,
      updatedAt: now
    };

    const result = await app.db.collections.projects.insertOne(doc);
    const created = await app.db.collections.projects.findOne({ _id: result.insertedId });
    if (!created) {
      return reply.code(500).send({ message: "Failed to create project" });
    }

    return { project: serializeProject(created) };
  });

  app.get(
    "/api/projects/:projectId/bootstrap",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = request.params && typeof request.params === "object"
        ? (request.params as { projectId: string }).projectId
        : "";

      const parsedProjectId = ObjectId.isValid(projectId) ? new ObjectId(projectId) : null;
      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const discoveredProject = await findDiscoveredProjectByRoot({
        homeDir: options.discoveryHomeDir,
        projectRootPath: project.rootPath,
        discoverLocalProjects
      });
      if (discoveredProject) {
        await syncImportedCliSessions({
          collections: app.db.collections,
          projectId: project._id!,
          discoveredProject
        });
      }

      const [sessions, activeRun, latestRuns, pendingApprovals] = await Promise.all([
        app.db.collections.sessions.find({ projectId: project._id }).sort({ updatedAt: -1 }).toArray(),
        app.db.collections.runs.findOne({
          projectId: project._id,
          status: { $in: ["running", "waiting_human", "paused"] }
        }),
        app.db.collections.runs.find({ projectId: project._id }).sort({ updatedAt: -1 }).limit(1).toArray(),
        app.db.collections.approvals
          .find({ projectId: project._id, status: "pending" })
          .sort({ createdAt: -1 })
          .toArray()
      ]);
      const workspaceSessions = sessions.map((session) =>
        serializeWorkspaceSession(session, app.cliSessionRunner)
      );
      const activeSessionId = resolveActiveSessionId({
        sessions: workspaceSessions,
        activeRunSessionId: activeRun?.sessionId?.toHexString() ?? null
      });
      const sessionCapabilities = buildSessionCapabilitiesMap(workspaceSessions);
      const recentSessionAuditEvents = activeSessionId
        ? await app.db.collections.auditEvents
            .find({
              projectId: project._id!,
              sessionId: new ObjectId(activeSessionId)
            })
            .sort({ createdAt: -1 })
            .limit(12)
            .toArray()
        : [];

      const resolvedRootPath = await resolveProjectRootPath(project.rootPath);

      return {
        project: {
          ...serializeProject(project),
          rootPath: resolvedRootPath
        },
        sessions: workspaceSessions,
        activeSessionId,
        sessionCapabilities,
        recentSessionAuditEvents: recentSessionAuditEvents.map(serializeAuditEvent),
        activeRun: activeRun ? serializeRun(activeRun) : null,
        latestRun: latestRuns[0] ? serializeRun(latestRuns[0]) : null,
        pendingApprovals: pendingApprovals.map(serializeApproval)
      };
    }
  );
}
