import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import { serializeApproval, serializeProject, serializeRun, serializeSession } from "../db.js";

const createProjectSchema = z.object({
  name: z.string().min(1),
  rootPath: z.string().min(1),
  providerPreferences: z.array(z.enum(["mock", "claude", "codex", "cursor", "gemini"])).optional()
});

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects", { preHandler: app.authenticate }, async (request) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const docs = await app.db.collections.projects
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .toArray();

    return { projects: docs.map(serializeProject) };
  });

  app.post("/api/projects", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid payload" });
    }

    const authUser = getAuthUser(request);
    const now = new Date();
    const doc = {
      ownerId: new ObjectId(authUser.userId),
      name: parsed.data.name,
      rootPath: parsed.data.rootPath,
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

      const [sessions, activeRun, pendingApprovals] = await Promise.all([
        app.db.collections.sessions.find({ projectId: project._id }).sort({ updatedAt: -1 }).toArray(),
        app.db.collections.runs.findOne({
          projectId: project._id,
          status: { $in: ["running", "waiting_human", "paused"] }
        }),
        app.db.collections.approvals
          .find({ projectId: project._id, status: "pending" })
          .sort({ createdAt: -1 })
          .toArray()
      ]);

      return {
        project: serializeProject(project),
        sessions: sessions.map(serializeSession),
        activeRun: activeRun ? serializeRun(activeRun) : null,
        pendingApprovals: pendingApprovals.map(serializeApproval)
      };
    }
  );
}
