import { ObjectId } from "mongodb";
import type { AuditActorType, RunStatus } from "@shared";
import type {
  AuditEventDoc,
  DatabaseCollections,
  RunCheckpointDoc,
  RunDoc
} from "../db.js";

interface RunIdentity {
  _id: ObjectId;
  projectId: ObjectId;
  sessionId: ObjectId;
}

interface RecordAuditEventInput {
  collections: DatabaseCollections;
  run: RunIdentity;
  eventType: string;
  actorType: AuditActorType;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt?: Date;
}

interface CreateRunCheckpointInput {
  collections: DatabaseCollections;
  run: RunIdentity;
  runStatus: RunStatus;
  source: string;
  summary: string;
  messageId?: ObjectId;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

interface RecordRunHistoryInput extends RecordAuditEventInput {
  checkpointStatus?: RunStatus;
  checkpointSource?: string;
  messageId?: ObjectId;
  metadata?: Record<string, unknown>;
}

function createAuditEventDoc(input: RecordAuditEventInput): AuditEventDoc {
  return {
    _id: new ObjectId(),
    projectId: input.run.projectId,
    sessionId: input.run.sessionId,
    runId: input.run._id,
    eventType: input.eventType,
    actorType: input.actorType,
    summary: input.summary,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date()
  };
}

function createRunCheckpointDoc(input: CreateRunCheckpointInput): RunCheckpointDoc {
  return {
    _id: new ObjectId(),
    projectId: input.run.projectId,
    sessionId: input.run.sessionId,
    runId: input.run._id,
    runStatus: input.runStatus,
    source: input.source,
    summary: input.summary,
    messageId: input.messageId,
    metadata: input.metadata,
    createdAt: input.createdAt ?? new Date()
  };
}

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<AuditEventDoc> {
  const doc = createAuditEventDoc(input);
  await input.collections.auditEvents.insertOne(doc);
  return doc;
}

export async function createRunCheckpoint(input: CreateRunCheckpointInput): Promise<RunCheckpointDoc> {
  const doc = createRunCheckpointDoc(input);
  await input.collections.runCheckpoints.insertOne(doc);
  return doc;
}

export async function recordRunHistory(
  input: RecordRunHistoryInput
): Promise<{ auditEvent: AuditEventDoc; checkpoint?: RunCheckpointDoc }> {
  const auditEvent = createAuditEventDoc(input);
  const checkpoint =
    input.checkpointStatus && input.checkpointSource
      ? createRunCheckpointDoc({
          collections: input.collections,
          run: input.run,
          runStatus: input.checkpointStatus,
          source: input.checkpointSource,
          summary: input.summary,
          messageId: input.messageId,
          metadata: input.metadata,
          createdAt: input.createdAt
        })
      : undefined;

  await Promise.all([
    input.collections.auditEvents.insertOne(auditEvent),
    checkpoint ? input.collections.runCheckpoints.insertOne(checkpoint) : Promise.resolve()
  ]);

  return { auditEvent, checkpoint };
}

export async function listRunAuditEvents(
  collections: DatabaseCollections,
  runId: ObjectId,
  limit: number
): Promise<AuditEventDoc[]> {
  return collections.auditEvents.find({ runId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function listRunCheckpoints(
  collections: DatabaseCollections,
  runId: ObjectId,
  limit: number
): Promise<RunCheckpointDoc[]> {
  return collections.runCheckpoints.find({ runId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export function toRunIdentity(run: Pick<RunDoc, "_id" | "projectId" | "sessionId">): RunIdentity {
  return {
    _id: run._id!,
    projectId: run.projectId,
    sessionId: run.sessionId
  };
}
