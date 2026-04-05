import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuthUser } from "../auth.js";
import {
  parseObjectId,
  serializeApproval,
  serializeMessage,
  serializeRun,
  type ApprovalDoc,
  type MessageDoc,
  type ProjectDoc,
  type RunDoc
} from "../db.js";
import { buildRejectedRunMessage } from "../services/approvalFlow.js";
import { streamSurrogateRun } from "../services/mockStreams.js";
import { sendRouteContractError } from "../services/routeContracts.js";
import { recordRunHistory, toRunIdentity } from "../services/runHistory.js";

const resolveApprovalSchema = z.object({
  note: z.string().trim().max(300).optional()
});

interface ApprovalContext {
  approval: ApprovalDoc;
  run: RunDoc;
  project: ProjectDoc;
}

async function getOwnedApprovalContext(
  app: FastifyInstance,
  userId: string,
  approvalId: string
): Promise<ApprovalContext> {
  const parsedApprovalId = parseObjectId(approvalId);
  if (!parsedApprovalId) {
    throw new Error("Invalid approval id");
  }

  const approval = await app.db.collections.approvals.findOne({ _id: parsedApprovalId });
  if (!approval) {
    throw new Error("Approval not found");
  }

  const run = await app.db.collections.runs.findOne({ _id: approval.runId });
  if (!run) {
    throw new Error("Run not found");
  }

  const project = await app.db.collections.projects.findOne({
    _id: run.projectId,
    ownerId: new ObjectId(userId)
  });
  if (!project) {
    throw new Error("Project not found");
  }

  return { approval, run, project };
}

export async function registerApprovalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/runs/:runId/approvals", { preHandler: app.authenticate }, async (request, reply) => {
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

    const approvals = await app.db.collections.approvals
      .find({ runId: run._id! })
      .sort({ createdAt: -1 })
      .toArray();

    return { approvals: approvals.map(serializeApproval) };
  });

  app.post("/api/approvals/:approvalId/approve", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const approvalId = (request.params as { approvalId: string }).approvalId;
    const parsedBody = resolveApprovalSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      return sendRouteContractError(reply, "invalidPayload");
    }

    try {
      const context = await getOwnedApprovalContext(app, authUser.userId, approvalId);
      if (context.approval.status !== "pending") {
        return reply.code(409).send({ message: "Approval has already been resolved" });
      }

      const now = new Date();
      await app.db.collections.approvals.updateOne(
        { _id: context.approval._id },
        {
          $set: {
            status: "approved",
            updatedAt: now,
            resolvedAt: now,
            ...(parsedBody.data.note
              ? { reason: `${context.approval.reason} 审批备注：${parsedBody.data.note}` }
              : {})
          }
        }
      );
      await app.db.collections.runs.updateOne(
        { _id: context.run._id },
        { $set: { status: "running", updatedAt: now } }
      );
      await recordRunHistory({
        collections: app.db.collections,
        run: toRunIdentity(context.run),
        eventType: "approval.approved",
        actorType: "user",
        summary: "审批已通过，替身运行开始继续执行。",
        payload: parsedBody.data.note ? { note: parsedBody.data.note } : undefined,
        checkpointStatus: "running",
        checkpointSource: "approval.approved",
        createdAt: now
      });

      const [updatedApproval, updatedRun] = await Promise.all([
        app.db.collections.approvals.findOne({ _id: context.approval._id }),
        app.db.collections.runs.findOne({ _id: context.run._id })
      ]);

      if (updatedApproval) {
        app.hub.publish(`project:${context.project._id!.toHexString()}`, {
          type: "approval.updated",
          payload: { approval: serializeApproval(updatedApproval) }
        });
      }

      if (updatedRun) {
        app.hub.publish(`project:${context.project._id!.toHexString()}`, {
          type: "run.updated",
          payload: { run: serializeRun(updatedRun) }
        });

        void streamSurrogateRun({
          cliSessionRunner: app.cliSessionRunner,
          collections: app.db.collections,
          hub: app.hub,
          registry: app.streamRegistry,
          run: updatedRun
        });
      }

      return {
        approval: updatedApproval ? serializeApproval(updatedApproval) : null,
        run: updatedRun ? serializeRun(updatedRun) : null
      };
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "Approval not found"
      });
    }
  });

  app.post("/api/approvals/:approvalId/reject", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const approvalId = (request.params as { approvalId: string }).approvalId;
    const parsedBody = resolveApprovalSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      return sendRouteContractError(reply, "invalidPayload");
    }

    try {
      const context = await getOwnedApprovalContext(app, authUser.userId, approvalId);
      if (context.approval.status !== "pending") {
        return reply.code(409).send({ message: "Approval has already been resolved" });
      }

      const now = new Date();
      await app.db.collections.approvals.updateOne(
        { _id: context.approval._id },
        {
          $set: {
            status: "rejected",
            updatedAt: now,
            resolvedAt: now,
            ...(parsedBody.data.note
              ? { reason: `${context.approval.reason} 审批备注：${parsedBody.data.note}` }
              : {})
          }
        }
      );
      await app.db.collections.runs.updateOne(
        { _id: context.run._id },
        { $set: { status: "stopped", updatedAt: now, stoppedAt: now } }
      );

      const rejectionMessage: MessageDoc = {
        _id: new ObjectId(),
        sessionId: context.run.sessionId,
        projectId: context.run.projectId,
        role: "system",
        senderType: "system",
        provider: context.run.provider,
        content: buildRejectedRunMessage(context.approval.title),
        status: "completed",
        createdAt: now,
        updatedAt: now
      };
      await app.db.collections.messages.insertOne(rejectionMessage);
      await recordRunHistory({
        collections: app.db.collections,
        run: toRunIdentity(context.run),
        eventType: "approval.rejected",
        actorType: "user",
        summary: "审批已拒绝，替身运行已停止。",
        payload: parsedBody.data.note ? { note: parsedBody.data.note } : undefined,
        checkpointStatus: "stopped",
        checkpointSource: "approval.rejected",
        messageId: rejectionMessage._id,
        createdAt: now
      });

      const [updatedApproval, updatedRun] = await Promise.all([
        app.db.collections.approvals.findOne({ _id: context.approval._id }),
        app.db.collections.runs.findOne({ _id: context.run._id })
      ]);

      app.hub.publish(`session:${context.run.sessionId.toHexString()}`, {
        type: "message.created",
        payload: { message: serializeMessage(rejectionMessage) }
      });

      if (updatedApproval) {
        app.hub.publish(`project:${context.project._id!.toHexString()}`, {
          type: "approval.updated",
          payload: { approval: serializeApproval(updatedApproval) }
        });
      }

      if (updatedRun) {
        app.hub.publish(`project:${context.project._id!.toHexString()}`, {
          type: "run.updated",
          payload: { run: serializeRun(updatedRun) }
        });
      }

      return {
        approval: updatedApproval ? serializeApproval(updatedApproval) : null,
        run: updatedRun ? serializeRun(updatedRun) : null
      };
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "Approval not found"
      });
    }
  });
}
