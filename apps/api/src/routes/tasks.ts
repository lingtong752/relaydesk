import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import {
  parseObjectId,
  serializeApproval,
  serializeMessage,
  serializeRun,
  type MessageDoc
} from "../db.js";
import {
  buildApprovalReason,
  buildApprovalTitle,
  buildPendingApprovalMessage
} from "../services/approvalFlow.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import {
  buildProjectTaskBoard,
  TaskMasterSyncConflictError,
  updateTaskMasterTask,
  type TaskMutationInput
} from "../services/projectTasks.js";
import {
  recordRunHistory,
  toRunIdentity
} from "../services/runHistory.js";

const updateTaskSchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "blocked", "unknown"]).optional(),
  summary: z.string().trim().nullable().optional(),
  assignee: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  blockedReason: z.string().trim().nullable().optional(),
  boundSessionId: z.string().trim().nullable().optional(),
  boundRunId: z.string().trim().nullable().optional(),
  expectedSyncToken: z.string().trim().nullable().optional(),
  forceOverwrite: z.boolean().optional()
});

const startTaskRunSchema = z.object({
  sessionId: z.string().trim().min(1),
  objective: z.string().trim().optional(),
  constraints: z.string().default(""),
  expectedSyncToken: z.string().trim().nullable().optional(),
  forceOverwrite: z.boolean().optional()
});

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/tasks",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const project = await getOwnedProjectForTasks(app, request, reply);
      if (!project) {
        return;
      }

      return {
        board: await buildProjectTaskBoard({
          projectId: project._id!.toHexString(),
          projectRootPath: await resolveProjectRootPath(project.rootPath)
        })
      };
    }
  );

  app.patch(
    "/api/projects/:projectId/tasks/:taskId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const project = await getOwnedProjectForTasks(app, request, reply);
      const parsedBody = updateTaskSchema.safeParse(request.body ?? {});
      const taskId = (request.params as { taskId: string }).taskId;

      if (!project) {
        return;
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      const projectRootPath = await resolveProjectRootPath(project.rootPath);

      try {
        await updateTaskMasterTask(projectRootPath, taskId, {
          status: parsedBody.data.status,
          summary: parsedBody.data.summary,
          assignee: parsedBody.data.assignee,
          notes: parsedBody.data.notes,
          blockedReason: parsedBody.data.blockedReason,
          boundSessionId: parsedBody.data.boundSessionId,
          boundRunId: parsedBody.data.boundRunId,
          timelineEvent: buildTaskTimelineEvent(parsedBody.data)
        }, {
          expectedSyncToken: parsedBody.data.expectedSyncToken ?? null,
          forceOverwrite: parsedBody.data.forceOverwrite ?? false
        });
      } catch (error) {
        if (error instanceof TaskMasterSyncConflictError) {
          return reply.code(409).send({
            message: "TaskMaster 文件已在外部更新，请先显式同步后再保存。",
            board: await buildProjectTaskBoard({
              projectId: project._id!.toHexString(),
              projectRootPath
            }),
            conflict: {
              sourcePath: error.sourcePath,
              sourceUpdatedAt: error.sourceUpdatedAt,
              currentSyncToken: error.currentSyncToken,
              expectedSyncToken: parsedBody.data.expectedSyncToken ?? null
            }
          });
        }

        return reply.code(404).send({
          message: error instanceof Error ? error.message : "Task update failed"
        });
      }

      const board = await buildProjectTaskBoard({
        projectId: project._id!.toHexString(),
        projectRootPath
      });

      return {
        board,
        task: board.tasks.find((task) => task.id === taskId) ?? null
      };
    }
  );

  app.post(
    "/api/projects/:projectId/tasks/sync",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const project = await getOwnedProjectForTasks(app, request, reply);
      if (!project) {
        return;
      }

      return {
        board: await buildProjectTaskBoard({
          projectId: project._id!.toHexString(),
          projectRootPath: await resolveProjectRootPath(project.rootPath)
        })
      };
    }
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/start-run",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const { projectId, taskId } = request.params as { projectId: string; taskId: string };
      const parsedProjectId = parseObjectId(projectId);
      const parsedBody = startTaskRunSchema.safeParse(request.body ?? {});

      if (!parsedProjectId || !parsedBody.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const project = await app.db.collections.projects.findOne({
        _id: parsedProjectId,
        ownerId
      });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const existingRun = await app.db.collections.runs.findOne({
        projectId: parsedProjectId,
        status: { $in: ["running", "waiting_human", "paused"] }
      });
      if (existingRun) {
        return reply.code(409).send({ message: "An active run already exists for this project" });
      }

      const sessionId = parseObjectId(parsedBody.data.sessionId);
      if (!sessionId) {
        return reply.code(400).send({ message: "Invalid session id" });
      }

      const session = await app.db.collections.sessions.findOne({ _id: sessionId, projectId: parsedProjectId });
      if (!session) {
        return reply.code(404).send({ message: "Session not found" });
      }

      if (session.origin === "imported_cli" && !app.cliSessionRunner.supportsImportedSession(session.provider)) {
        return reply.code(409).send({
          message: `Imported ${session.provider} sessions cannot start surrogate runs via local CLI yet`
        });
      }

      const projectRootPath = await resolveProjectRootPath(project.rootPath);
      const board = await buildProjectTaskBoard({
        projectId: project._id!.toHexString(),
        projectRootPath
      });

      if (
        !parsedBody.data.forceOverwrite &&
        parsedBody.data.expectedSyncToken &&
        board.taskMaster.syncToken &&
        parsedBody.data.expectedSyncToken !== board.taskMaster.syncToken
      ) {
        return reply.code(409).send({
          message: "TaskMaster 文件已在外部更新，请先显式同步后再发起运行。",
          board,
          conflict: {
            sourcePath: board.taskMaster.sourcePath ?? null,
            sourceUpdatedAt: board.taskMaster.sourceUpdatedAt ?? null,
            currentSyncToken: board.taskMaster.syncToken,
            expectedSyncToken: parsedBody.data.expectedSyncToken
          }
        });
      }

      const task = board.tasks.find((item) => item.id === taskId);
      if (!task) {
        return reply.code(404).send({ message: "Task not found" });
      }

      const now = new Date();
      const objective = parsedBody.data.objective?.trim() || `推进任务：${task.title}`;
      const constraints = parsedBody.data.constraints;
      const runDoc = {
        projectId: parsedProjectId,
        sessionId: session._id!,
        provider: session.provider,
        objective,
        constraints,
        status: "waiting_human" as const,
        startedAt: now,
        updatedAt: now
      };

      const result = await app.db.collections.runs.insertOne(runDoc);
      const run = await app.db.collections.runs.findOne({ _id: result.insertedId });
      if (!run) {
        return reply.code(500).send({ message: "Failed to create run" });
      }

      const approvalDoc = {
        projectId: parsedProjectId,
        sessionId: session._id!,
        runId: run._id!,
        title: buildApprovalTitle(objective),
        reason: buildApprovalReason(objective, constraints),
        status: "pending" as const,
        createdAt: now,
        updatedAt: now
      };
      const approvalResult = await app.db.collections.approvals.insertOne(approvalDoc);
      const approval = await app.db.collections.approvals.findOne({ _id: approvalResult.insertedId });

      const pendingMessage: MessageDoc = {
        _id: new ObjectId(),
        sessionId: session._id!,
        projectId: parsedProjectId,
        role: "system",
        senderType: "system",
        provider: session.provider,
        content: buildPendingApprovalMessage(objective),
        status: "completed",
        createdAt: now,
        updatedAt: now
      };
      await app.db.collections.messages.insertOne(pendingMessage);
      await recordRunHistory({
        collections: app.db.collections,
        run: toRunIdentity(run),
        eventType: "run.created",
        actorType: "user",
        summary: "已从任务工作台创建替身运行，当前正在等待人工审批。",
        payload: {
          objective,
          constraints,
          provider: session.provider,
          taskId
        },
        checkpointStatus: "waiting_human",
        checkpointSource: "task.run.created",
        messageId: pendingMessage._id,
        metadata: {
          approvalId: approval?._id?.toHexString(),
          taskId
        },
        createdAt: now
      });

      try {
        await updateTaskMasterTask(projectRootPath, taskId, {
          boundSessionId: session._id!.toHexString(),
          boundRunId: run._id!.toHexString(),
          timelineEvent: {
            type: "run_started",
            summary: "已从任务面板发起替身运行。",
            detail: objective,
            createdAt: now.toISOString()
          }
        }, {
          forceOverwrite: parsedBody.data.forceOverwrite ?? false
        });
      } catch (error) {
        return reply.code(500).send({
          message: error instanceof Error ? error.message : "Task run binding failed"
        });
      }

      app.hub.publish(`session:${session._id!.toHexString()}`, {
        type: "message.created",
        payload: { message: serializeMessage(pendingMessage) }
      });
      app.hub.publish(`project:${project._id!.toHexString()}`, {
        type: "run.updated",
        payload: { run: serializeRun(run) }
      });

      if (approval) {
        app.hub.publish(`project:${project._id!.toHexString()}`, {
          type: "approval.updated",
          payload: { approval: serializeApproval(approval) }
        });
      }

      const refreshedBoard = await buildProjectTaskBoard({
        projectId: project._id!.toHexString(),
        projectRootPath
      });

      return {
        board: refreshedBoard,
        task: refreshedBoard.tasks.find((item) => item.id === taskId) ?? null,
        run: serializeRun(run),
        approval: approval ? serializeApproval(approval) : null
      };
    }
  );
}

async function getOwnedProjectForTasks(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authUser = getAuthUser(request);
  const ownerId = new ObjectId(authUser.userId);
  const projectId = (request.params as { projectId: string }).projectId;
  const parsedProjectId = parseObjectId(projectId);

  if (!parsedProjectId) {
    await reply.code(400).send({ message: "Invalid project id" });
    return null;
  }

  const project = await app.db.collections.projects.findOne({
    _id: parsedProjectId,
    ownerId
  });
  if (!project) {
    await reply.code(404).send({ message: "Project not found" });
    return null;
  }

  return project;
}

function buildTaskTimelineEvent(input: z.infer<typeof updateTaskSchema>): TaskMutationInput["timelineEvent"] {
  if (input.status) {
    return {
      type: "status_changed",
      summary: `任务状态已更新为 ${input.status}。`
    };
  }

  if (input.notes !== undefined) {
    return {
      type: "note_updated",
      summary: "任务备注已更新。"
    };
  }

  if (input.blockedReason !== undefined) {
    return {
      type: "blocked_reason_updated",
      summary: "阻塞原因已更新。"
    };
  }

  if (input.assignee !== undefined) {
    return {
      type: "assignee_updated",
      summary: "负责人已更新。"
    };
  }

  if (input.boundSessionId !== undefined) {
    return {
      type: "session_bound",
      summary: "任务已重新绑定当前会话。"
    };
  }

  return {
    type: "synced",
    summary: "任务内容已同步到本地 TaskMaster 文件。"
  };
}
