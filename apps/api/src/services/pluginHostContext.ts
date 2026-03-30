import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import type { PluginHostContextRecord } from "@shared";
import { resolveProjectRootPath } from "./projectRoot.js";
import { buildProjectTaskBoard } from "./projectTasks.js";
import { serializeWorkspaceSession } from "./sessionRecords.js";

export async function buildPluginHostContext(
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
    latestSessions: latestSessions.map((session) => serializeWorkspaceSession(session, app.cliSessionRunner)),
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

export async function buildPluginTaskBoard(
  app: FastifyInstance,
  input: {
    projectId: string;
    projectRootPath: string;
  }
) {
  return buildProjectTaskBoard({
    projectId: input.projectId,
    projectRootPath: await resolveProjectRootPath(input.projectRootPath)
  });
}
