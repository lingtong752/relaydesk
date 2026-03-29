import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  parseObjectId,
  serializeApproval,
  serializeAuditEvent,
  serializeProject,
  serializeRunCheckpoint
} from "./db.js";

describe("parseObjectId", () => {
  it("returns null for invalid ids", () => {
    expect(parseObjectId("not-an-object-id")).toBeNull();
  });

  it("returns ObjectId for valid ids", () => {
    const id = new ObjectId().toHexString();
    expect(parseObjectId(id)?.toHexString()).toBe(id);
  });
});

describe("serializeProject", () => {
  it("serializes Mongo project documents into API shape", () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const ownerId = new ObjectId();
    const projectId = new ObjectId();

    const serialized = serializeProject({
      _id: projectId,
      ownerId,
      name: "Demo Project",
      rootPath: "/workspace/demo",
      providerPreferences: ["mock"],
      createdAt: now,
      updatedAt: now
    });

    expect(serialized).toEqual({
      id: projectId.toHexString(),
      ownerId: ownerId.toHexString(),
      name: "Demo Project",
      rootPath: "/workspace/demo",
      providerPreferences: ["mock"],
      createdAt: "2026-03-28T00:00:00.000Z",
      updatedAt: "2026-03-28T00:00:00.000Z"
    });
  });
});

describe("serializeApproval", () => {
  it("serializes Mongo approval documents into API shape", () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const approvalId = new ObjectId();
    const projectId = new ObjectId();
    const sessionId = new ObjectId();
    const runId = new ObjectId();

    const serialized = serializeApproval({
      _id: approvalId,
      projectId,
      sessionId,
      runId,
      title: "审批标题",
      reason: "审批原因",
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    expect(serialized).toEqual({
      id: approvalId.toHexString(),
      projectId: projectId.toHexString(),
      sessionId: sessionId.toHexString(),
      runId: runId.toHexString(),
      title: "审批标题",
      reason: "审批原因",
      status: "pending",
      createdAt: "2026-03-28T00:00:00.000Z",
      updatedAt: "2026-03-28T00:00:00.000Z",
      resolvedAt: undefined
    });
  });
});

describe("serializeAuditEvent", () => {
  it("serializes Mongo audit event documents into API shape", () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const auditEventId = new ObjectId();
    const projectId = new ObjectId();
    const sessionId = new ObjectId();
    const runId = new ObjectId();

    const serialized = serializeAuditEvent({
      _id: auditEventId,
      projectId,
      sessionId,
      runId,
      eventType: "run.created",
      actorType: "user",
      summary: "已创建替身运行。",
      payload: { objective: "demo" },
      createdAt: now
    });

    expect(serialized).toEqual({
      id: auditEventId.toHexString(),
      projectId: projectId.toHexString(),
      sessionId: sessionId.toHexString(),
      runId: runId.toHexString(),
      eventType: "run.created",
      actorType: "user",
      summary: "已创建替身运行。",
      payload: { objective: "demo" },
      createdAt: "2026-03-28T00:00:00.000Z"
    });
  });

  it("supports project-scoped audit events without run identity", () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const auditEventId = new ObjectId();
    const projectId = new ObjectId();

    const serialized = serializeAuditEvent({
      _id: auditEventId,
      projectId,
      eventType: "plugin.action.executed",
      actorType: "user",
      summary: "插件动作已执行。",
      payload: { pluginId: "workspace-inspector" },
      createdAt: now
    });

    expect(serialized).toEqual({
      id: auditEventId.toHexString(),
      projectId: projectId.toHexString(),
      sessionId: undefined,
      runId: undefined,
      eventType: "plugin.action.executed",
      actorType: "user",
      summary: "插件动作已执行。",
      payload: { pluginId: "workspace-inspector" },
      createdAt: "2026-03-28T00:00:00.000Z"
    });
  });
});

describe("serializeRunCheckpoint", () => {
  it("serializes Mongo checkpoint documents into API shape", () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const checkpointId = new ObjectId();
    const projectId = new ObjectId();
    const sessionId = new ObjectId();
    const runId = new ObjectId();
    const messageId = new ObjectId();

    const serialized = serializeRunCheckpoint({
      _id: checkpointId,
      projectId,
      sessionId,
      runId,
      runStatus: "waiting_human",
      source: "run.created",
      summary: "等待人工审批。",
      messageId,
      metadata: { approvalId: "approval-1" },
      createdAt: now
    });

    expect(serialized).toEqual({
      id: checkpointId.toHexString(),
      projectId: projectId.toHexString(),
      sessionId: sessionId.toHexString(),
      runId: runId.toHexString(),
      runStatus: "waiting_human",
      source: "run.created",
      summary: "等待人工审批。",
      messageId: messageId.toHexString(),
      metadata: { approvalId: "approval-1" },
      createdAt: "2026-03-28T00:00:00.000Z"
    });
  });
});
