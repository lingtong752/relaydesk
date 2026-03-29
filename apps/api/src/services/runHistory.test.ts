import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { recordRunHistory, toRunIdentity } from "./runHistory.js";

describe("recordRunHistory", () => {
  it("persists both audit events and checkpoints for a run transition", async () => {
    const auditInsert = vi.fn(async () => ({ acknowledged: true }));
    const checkpointInsert = vi.fn(async () => ({ acknowledged: true }));
    const run = {
      _id: new ObjectId(),
      projectId: new ObjectId(),
      sessionId: new ObjectId()
    };

    const result = await recordRunHistory({
      collections: {
        auditEvents: { insertOne: auditInsert },
        runCheckpoints: { insertOne: checkpointInsert }
      } as never,
      run: toRunIdentity(run),
      eventType: "approval.approved",
      actorType: "user",
      summary: "审批已通过。",
      checkpointStatus: "running",
      checkpointSource: "approval.approved",
      metadata: { note: "go" }
    });

    expect(auditInsert).toHaveBeenCalledTimes(1);
    expect(checkpointInsert).toHaveBeenCalledTimes(1);
    expect(result.auditEvent.eventType).toBe("approval.approved");
    expect(result.checkpoint?.runStatus).toBe("running");
    expect(result.checkpoint?.metadata).toEqual({ note: "go" });
  });
});
