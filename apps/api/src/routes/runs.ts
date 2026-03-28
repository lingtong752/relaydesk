import type { FastifyInstance } from "fastify";
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
  buildPendingApprovalMessage,
  buildResumePendingMessage,
  buildTakeoverMessage
} from "../services/approvalFlow.js";

const createRunSchema = z.object({
  sessionId: z.string().min(1),
  objective: z.string().min(1),
  constraints: z.string().default("")
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
        return reply.code(400).send({ message: "Invalid project id" });
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const run = await app.db.collections.runs.findOne({
        projectId: parsedProjectId,
        status: { $in: ["running", "waiting_human", "paused"] }
      });

      return { run: run ? serializeRun(run) : null };
    }
  );

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
        return reply.code(400).send({ message: "Invalid payload" });
      }

      const project = await app.db.collections.projects.findOne({ _id: parsedProjectId, ownerId });
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
      return reply.code(400).send({ message: "Invalid run id" });
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return reply.code(404).send({ message: "Project not found" });
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
      return reply.code(400).send({ message: "Invalid run id" });
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return reply.code(404).send({ message: "Project not found" });
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
      return reply.code(400).send({ message: "Invalid run id" });
    }

    const run = await app.db.collections.runs.findOne({ _id: parsedRunId });
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    const project = await app.db.collections.projects.findOne({ _id: run.projectId, ownerId });
    if (!project) {
      return reply.code(404).send({ message: "Project not found" });
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
