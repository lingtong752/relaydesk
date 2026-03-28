import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { parseObjectId, serializeApproval, serializeProject } from "./db.js";

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
