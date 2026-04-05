import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import {
  parseObjectId,
  serializeApproval,
  serializeAuditEvent,
  serializeMessage,
  serializeRunCheckpoint,
  serializeRun,
  type MessageDoc
} from "../db.js";
import {
  buildApprovalReason,
  buildApprovalTitle,
  buildPendingApprovalMessage,
  buildRestorePendingMessage,
  buildResumePendingMessage,
  buildTakeoverMessage
} from "../services/approvalFlow.js";
import {
  listRunAuditEvents,
  listRunCheckpoints,
  recordRunHistory,
  toRunIdentity
} from "../services/runHistory.js";
import { sendRouteContractError } from "../services/routeContracts.js";

const createRunSchema = z.object({
  sessionId: z.string().min(1),
  objective: z.string().min(1),
  constraints: z.string().default("")
});

const runHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const restoreRunSchema = z.object({
  checkpointId: z.string().min(1).optional()
});

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/runs/active",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedProjectId = parseObjectId(projectId);

      if (!parsedProjectId) {
        return sendRouteContractError(reply, "invalidProjectId");
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
      if (!project) {
        return sendRouteContractError(reply, "projectNotFound");
      }

      const run = await app.db.collections.runs.findOne({
        projectId: parsedProjectId,
        status: { $in: ["running", "waiting_human", "paused"] }
      });

      return { run: run ? serializeRun(run) : null };
    }
  );

  app.get("/api/runs/:runId/audit-events", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const runId = (request.params as { runId: string }).runId;
    const parsedRunId = parseObjectId(runId);
    const parsedQuery = runHistoryQuerySchema.safeParse(request.query ?? {});

    if (!parsedRunId || !parsedQuery.success) {
      return reply.code(400).send({ message: "Invalid request" });
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return sendRouteContractError(reply, "runNotFound");
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return sendRouteContractError(reply, "projectNotFound");
    }

    const events = await listRunAuditEvents(app.db.collections, run._id!, parsedQuery.data.limit);
    return { events: events.map(serializeAuditEvent) };
  });

  app.get("/api/runs/:runId/checkpoints", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const runId = (request.params as { runId: string }).runId;
    const parsedRunId = parseObjectId(runId);
    const parsedQuery = runHistoryQuerySchema.safeParse(request.query ?? {});

    if (!parsedRunId || !parsedQuery.success) {
      return reply.code(400).send({ message: "Invalid request" });
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return sendRouteContractError(reply, "runNotFound");
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return sendRouteContractError(reply, "projectNotFound");
    }

    const checkpoints = await listRunCheckpoints(
      app.db.collections,
      run._id!,
      parsedQuery.data.limit
    );
    return { checkpoints: checkpoints.map(serializeRunCheckpoint) };
  });

  app.post("/api/runs/:runId/restore", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const runId = (request.params as { runId: string }).runId;
    const parsedRunId = parseObjectId(runId);
    const parsedBody = restoreRunSchema.safeParse(request.body ?? {});

    if (!parsedRunId || !parsedBody.success) {
      return reply.code(400).send({ message: "Invalid request" });
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return sendRouteContractError(reply, "runNotFound");
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return sendRouteContractError(reply, "projectNotFound");
    }

    if (["running", "waiting_human"].includes(run.status)) {
      return reply.code(409).send({ message: "Only paused, stopped, completed, or failed runs can be restored" });
    }

    const blockingRun = await app.db.collections.runs.findOne({
      projectId: run.projectId,
      status: { $in: ["running", "waiting_human", "paused"] }
    });
    if (blockingRun && !blockingRun._id?.equals(run._id!)) {
      return reply.code(409).send({ message: "Another active run already exists for this project" });
    }

    const existingPendingApproval = await app.db.collections.approvals.findOne({
      runId: run._id,
      status: "pending"
    });
    if (existingPendingApproval) {
      return reply.code(409).send({ message: "A pending approval already exists for this run" });
    }

    const parsedCheckpointId = parsedBody.data.checkpointId
      ? parseObjectId(parsedBody.data.checkpointId)
      : null;
    if (parsedBody.data.checkpointId && !parsedCheckpointId) {
      return reply.code(400).send({ message: "Invalid checkpoint id" });
    }

    const checkpoint =
      parsedBody.data.checkpointId !== undefined
        ? await app.db.collections.runCheckpoints.findOne({
            _id: parsedCheckpointId!,
            runId: run._id
          })
        : (await app.db.collections.runCheckpoints
            .find({ runId: run._id })
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray())[0] ?? null;

    if (!checkpoint) {
      return reply.code(404).send({ message: "Checkpoint not found" });
    }

    const updatedAt = new Date();
    await app.db.collections.runs.updateOne(
      { _id: run._id },
      {
        $set: { status: "waiting_human", updatedAt },
        $unset: { stoppedAt: "" }
      }
    );

    const approvalDoc = {
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run._id!,
      title: buildApprovalTitle(run.objective),
      reason: `${buildApprovalReason(run.objective, run.constraints)} 恢复来源：${checkpoint.summary}`,
      status: "pending" as const,
      createdAt: updatedAt,
      updatedAt
    };
    const approvalResult = await app.db.collections.approvals.insertOne(approvalDoc);
    const approval = await app.db.collections.approvals.findOne({ _id: approvalResult.insertedId });

    const restoreMessage: MessageDoc = {
      _id: new ObjectId(),
      sessionId: run.sessionId,
      projectId: run.projectId,
      role: "system",
      senderType: "system",
      provider: run.provider,
      content: buildRestorePendingMessage(run.objective, checkpoint.summary),
      status: "completed",
      createdAt: updatedAt,
      updatedAt
    };
    await app.db.collections.messages.insertOne(restoreMessage);
    await recordRunHistory({
      collections: app.db.collections,
      run: toRunIdentity(run),
      eventType: "run.restored",
      actorType: "user",
      summary: "已从检查点恢复替身运行，当前重新进入人工审批。",
      payload: {
        checkpointId: checkpoint._id?.toHexString(),
        checkpointSource: checkpoint.source,
        checkpointStatus: checkpoint.runStatus
      },
      checkpointStatus: "waiting_human",
      checkpointSource: "run.restored",
      messageId: restoreMessage._id,
      metadata: {
        approvalId: approval?._id?.toHexString(),
        restoredFromCheckpointId: checkpoint._id?.toHexString(),
        restoredFromStatus: checkpoint.runStatus,
        restoredFromSource: checkpoint.source
      },
      createdAt: updatedAt
    });

    const updatedRun = await app.db.collections.runs.findOne({ _id: run._id });

    app.hub.publish(`session:${run.sessionId.toHexString()}`, {
      type: "message.created",
      payload: { message: serializeMessage(restoreMessage) }
    });

    if (approval) {
      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "approval.updated",
        payload: { approval: serializeApproval(approval) }
      });
    }

    if (updatedRun) {
      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "run.updated",
        payload: { run: serializeRun(updatedRun) }
      });
    }

    return {
      run: updatedRun ? serializeRun(updatedRun) : null,
      approval: approval ? serializeApproval(approval) : null,
      checkpoint: serializeRunCheckpoint(checkpoint)
    };
  });

  app.post(
    "/api/projects/:projectId/runs",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedProjectId = parseObjectId(projectId);
      const parsedBody = createRunSchema.safeParse(request.body);

      if (!parsedProjectId || !parsedBody.success) {
        return sendRouteContractError(reply, "invalidPayload");
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
      if (!project) {
        return sendRouteContractError(reply, "projectNotFound");
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
        return sendRouteContractError(reply, "invalidSessionId");
      }

      const session = await app.db.collections.sessions.findOne({ _id: sessionId, projectId: parsedProjectId });
      if (!session) {
        return sendRouteContractError(reply, "sessionNotFound");
      }

      if (session.origin === "imported_cli" && !app.cliSessionRunner.supportsImportedSession(session.provider)) {
        return reply.code(409).send({
          message: `Imported ${session.provider} sessions cannot start surrogate runs via local CLI yet`
        });
      }

      const now = new Date();
      const doc = {
        projectId: parsedProjectId,
        sessionId: session._id,
        provider: session.provider,
        objective: parsedBody.data.objective,
        constraints: parsedBody.data.constraints,
        status: "waiting_human" as const,
        startedAt: now,
        updatedAt: now
      };

      const result = await app.db.collections.runs.insertOne(doc);
      const run = await app.db.collections.runs.findOne({ _id: result.insertedId });
      if (!run) {
        return reply.code(500).send({ message: "Failed to create run" });
      }

      const approvalDoc = {
        projectId: parsedProjectId,
        sessionId: session._id,
        runId: run._id!,
        title: buildApprovalTitle(parsedBody.data.objective),
        reason: buildApprovalReason(parsedBody.data.objective, parsedBody.data.constraints),
        status: "pending" as const,
        createdAt: now,
        updatedAt: now
      };
      const approvalResult = await app.db.collections.approvals.insertOne(approvalDoc);
      const approval = await app.db.collections.approvals.findOne({ _id: approvalResult.insertedId });

      const pendingMessage: MessageDoc = {
        _id: new ObjectId(),
        sessionId: session._id,
        projectId: parsedProjectId,
        role: "system",
        senderType: "system",
        provider: session.provider,
        content: buildPendingApprovalMessage(parsedBody.data.objective),
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
        summary: "已创建替身运行，当前正在等待人工审批。",
        payload: {
          objective: parsedBody.data.objective,
          constraints: parsedBody.data.constraints,
          provider: session.provider
        },
        checkpointStatus: "waiting_human",
        checkpointSource: "run.created",
        messageId: pendingMessage._id,
        metadata: {
          approvalId: approval?._id?.toHexString()
        },
        createdAt: now
      });
      app.hub.publish(`session:${session._id.toHexString()}`, {
        type: "message.created",
        payload: { message: serializeMessage(pendingMessage) }
      });

      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "run.updated",
        payload: { run: serializeRun(run) }
      });

      if (approval) {
        app.hub.publish(`project:${project._id.toHexString()}`, {
          type: "approval.updated",
          payload: { approval: serializeApproval(approval) }
        });
      }

      return {
        run: serializeRun(run),
        approval: approval ? serializeApproval(approval) : null
      };
    }
  );

  app.post("/api/runs/:runId/stop", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const runId = (request.params as { runId: string }).runId;
    const parsedRunId = parseObjectId(runId);

    if (!parsedRunId) {
      return sendRouteContractError(reply, "invalidRunId");
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return sendRouteContractError(reply, "runNotFound");
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return sendRouteContractError(reply, "projectNotFound");
    }

    app.streamRegistry.stopRun(run._id.toHexString());
    const updatedAt = new Date();
    await Promise.all([
      app.db.collections.runs.updateOne(
        { _id: run._id },
        { $set: { status: "stopped", stoppedAt: updatedAt, updatedAt } }
      ),
      app.db.collections.approvals.updateMany(
        { runId: run._id, status: "pending" },
        { $set: { status: "rejected", updatedAt, resolvedAt: updatedAt } }
      )
    ]);
    await recordRunHistory({
      collections: app.db.collections,
      run: toRunIdentity(run),
      eventType: "run.stopped",
      actorType: "user",
      summary: "真实用户停止了当前替身运行。",
      checkpointStatus: "stopped",
      checkpointSource: "run.stopped",
      createdAt: updatedAt
    });

    const [updatedRun, approvals] = await Promise.all([
      app.db.collections.runs.findOne({ _id: run._id }),
      app.db.collections.approvals.find({ runId: run._id }).toArray()
    ]);

    if (updatedRun) {
      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "run.updated",
        payload: { run: serializeRun(updatedRun) }
      });
    }

    for (const approval of approvals) {
      if (approval.status === "rejected") {
        app.hub.publish(`project:${project._id.toHexString()}`, {
          type: "approval.updated",
          payload: { approval: serializeApproval(approval) }
        });
      }
    }

    return { ok: true };
  });

  app.post("/api/runs/:runId/takeover", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const runId = (request.params as { runId: string }).runId;
    const parsedRunId = parseObjectId(runId);

    if (!parsedRunId) {
      return sendRouteContractError(reply, "invalidRunId");
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return sendRouteContractError(reply, "runNotFound");
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return sendRouteContractError(reply, "projectNotFound");
    }

    if (!["running", "waiting_human"].includes(run.status)) {
      return reply.code(409).send({ message: "Only running or waiting runs can be taken over" });
    }

    app.streamRegistry.stopRun(run._id.toHexString());
    const updatedAt = new Date();

    await Promise.all([
      app.db.collections.runs.updateOne(
        { _id: run._id },
        { $set: { status: "paused", updatedAt } }
      ),
      app.db.collections.approvals.updateMany(
        { runId: run._id, status: "pending" },
        { $set: { status: "rejected", updatedAt, resolvedAt: updatedAt } }
      )
    ]);

    const takeoverMessage: MessageDoc = {
      _id: new ObjectId(),
      sessionId: run.sessionId,
      projectId: run.projectId,
      role: "system",
      senderType: "system",
      provider: run.provider,
      content: buildTakeoverMessage(),
      status: "completed",
      createdAt: updatedAt,
      updatedAt
    };
    await app.db.collections.messages.insertOne(takeoverMessage);
    await recordRunHistory({
      collections: app.db.collections,
      run: toRunIdentity(run),
      eventType: "run.taken_over",
      actorType: "user",
      summary: "真实用户已人工接管当前运行。",
      checkpointStatus: "paused",
      checkpointSource: "run.taken_over",
      messageId: takeoverMessage._id,
      createdAt: updatedAt
    });

    const [updatedRun, approvals] = await Promise.all([
      app.db.collections.runs.findOne({ _id: run._id }),
      app.db.collections.approvals.find({ runId: run._id }).toArray()
    ]);

    app.hub.publish(`session:${run.sessionId.toHexString()}`, {
      type: "message.created",
      payload: { message: serializeMessage(takeoverMessage) }
    });

    if (updatedRun) {
      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "run.updated",
        payload: { run: serializeRun(updatedRun) }
      });
    }

    for (const approval of approvals) {
      if (approval.status === "rejected") {
        app.hub.publish(`project:${project._id.toHexString()}`, {
          type: "approval.updated",
          payload: { approval: serializeApproval(approval) }
        });
      }
    }

    return { run: updatedRun ? serializeRun(updatedRun) : null };
  });

  app.post("/api/runs/:runId/resume", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const ownerId = new ObjectId(authUser.userId);
    const runId = (request.params as { runId: string }).runId;
    const parsedRunId = parseObjectId(runId);

    if (!parsedRunId) {
      return sendRouteContractError(reply, "invalidRunId");
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return sendRouteContractError(reply, "runNotFound");
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return sendRouteContractError(reply, "projectNotFound");
    }

    if (run.status !== "paused") {
      return reply.code(409).send({ message: "Only paused runs can be resumed" });
    }

    const existingPendingApproval = await app.db.collections.approvals.findOne({
      runId: run._id,
      status: "pending"
    });
    if (existingPendingApproval) {
      return reply.code(409).send({ message: "A pending approval already exists for this run" });
    }

    const updatedAt = new Date();
    await app.db.collections.runs.updateOne(
      { _id: run._id },
      { $set: { status: "waiting_human", updatedAt } }
    );

    const approvalDoc = {
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run._id!,
      title: buildApprovalTitle(run.objective),
      reason: buildApprovalReason(run.objective, run.constraints),
      status: "pending" as const,
      createdAt: updatedAt,
      updatedAt
    };
    const approvalResult = await app.db.collections.approvals.insertOne(approvalDoc);
    const approval = await app.db.collections.approvals.findOne({ _id: approvalResult.insertedId });

    const resumeMessage: MessageDoc = {
      _id: new ObjectId(),
      sessionId: run.sessionId,
      projectId: run.projectId,
      role: "system",
      senderType: "system",
      provider: run.provider,
      content: buildResumePendingMessage(run.objective),
      status: "completed",
      createdAt: updatedAt,
      updatedAt
    };
    await app.db.collections.messages.insertOne(resumeMessage);
    await recordRunHistory({
      collections: app.db.collections,
      run: toRunIdentity(run),
      eventType: "run.resume_requested",
      actorType: "user",
      summary: "已请求恢复替身运行，当前重新进入人工审批。",
      checkpointStatus: "waiting_human",
      checkpointSource: "run.resume_requested",
      messageId: resumeMessage._id,
      metadata: {
        approvalId: approval?._id?.toHexString()
      },
      createdAt: updatedAt
    });

    const updatedRun = await app.db.collections.runs.findOne({ _id: run._id });

    app.hub.publish(`session:${run.sessionId.toHexString()}`, {
      type: "message.created",
      payload: { message: serializeMessage(resumeMessage) }
    });

    if (approval) {
      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "approval.updated",
        payload: { approval: serializeApproval(approval) }
      });
    }

    if (updatedRun) {
      app.hub.publish(`project:${project._id.toHexString()}`, {
        type: "run.updated",
        payload: { run: serializeRun(updatedRun) }
      });
    }

    return {
      run: updatedRun ? serializeRun(updatedRun) : null,
      approval: approval ? serializeApproval(approval) : null
    };
  });
}
