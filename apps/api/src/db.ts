import { MongoClient, ObjectId, type Collection } from "mongodb";
import type {
  ApprovalRecord,
  AuthUser,
  MessageRecord,
  ProjectRecord,
  RunRecord,
  SessionRecord
} from "@shared";

export interface UserDoc {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface ProjectDoc {
  _id?: ObjectId;
  ownerId: ObjectId;
  name: string;
  rootPath: string;
  providerPreferences: ProjectRecord["providerPreferences"];
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id?: ObjectId;
  projectId: ObjectId;
  provider: SessionRecord["provider"];
  title: string;
  status: SessionRecord["status"];
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
}

export interface MessageDoc {
  _id?: ObjectId;
  sessionId: ObjectId;
  projectId: ObjectId;
  role: MessageRecord["role"];
  senderType: MessageRecord["senderType"];
  provider?: MessageRecord["provider"];
  content: string;
  status: MessageRecord["status"];
  createdAt: Date;
  updatedAt: Date;
}

export interface RunDoc {
  _id?: ObjectId;
  projectId: ObjectId;
  sessionId: ObjectId;
  provider: RunRecord["provider"];
  objective: string;
  constraints: string;
  status: RunRecord["status"];
  startedAt: Date;
  updatedAt: Date;
  stoppedAt?: Date;
}

export interface ApprovalDoc {
  _id?: ObjectId;
  projectId: ObjectId;
  sessionId: ObjectId;
  runId: ObjectId;
  title: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export interface DatabaseCollections {
  users: Collection<UserDoc>;
  projects: Collection<ProjectDoc>;
  sessions: Collection<SessionDoc>;
  messages: Collection<MessageDoc>;
  runs: Collection<RunDoc>;
  approvals: Collection<ApprovalDoc>;
}

export interface Database {
  client: MongoClient;
  collections: DatabaseCollections;
}

export async function connectDatabase(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);
  const collections: DatabaseCollections = {
    users: db.collection<UserDoc>("users"),
    projects: db.collection<ProjectDoc>("projects"),
    sessions: db.collection<SessionDoc>("sessions"),
    messages: db.collection<MessageDoc>("messages"),
    runs: db.collection<RunDoc>("runs"),
    approvals: db.collection<ApprovalDoc>("approvals")
  };

  await collections.users.createIndex({ email: 1 }, { unique: true });
  await collections.projects.createIndex({ ownerId: 1, rootPath: 1 }, { unique: true });
  await collections.sessions.createIndex({ projectId: 1, updatedAt: -1 });
  await collections.messages.createIndex({ sessionId: 1, createdAt: 1 });
  await collections.runs.createIndex({ projectId: 1, status: 1, startedAt: -1 });
  await collections.approvals.createIndex({ projectId: 1, status: 1, createdAt: -1 });
  await collections.approvals.createIndex({ runId: 1, createdAt: -1 });

  return { client, collections };
}

export function parseObjectId(value: string): ObjectId | null {
  if (!ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

export function serializeUser(doc: UserDoc): AuthUser {
  return {
    id: doc._id!.toHexString(),
    email: doc.email,
    createdAt: doc.createdAt.toISOString()
  };
}

export function serializeProject(doc: ProjectDoc): ProjectRecord {
  return {
    id: doc._id!.toHexString(),
    ownerId: doc.ownerId.toHexString(),
    name: doc.name,
    rootPath: doc.rootPath,
    providerPreferences: doc.providerPreferences,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

export function serializeSession(doc: SessionDoc): SessionRecord {
  return {
    id: doc._id!.toHexString(),
    projectId: doc.projectId.toHexString(),
    provider: doc.provider,
    title: doc.title,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    lastMessageAt: doc.lastMessageAt?.toISOString()
  };
}

export function serializeMessage(doc: MessageDoc): MessageRecord {
  return {
    id: doc._id!.toHexString(),
    sessionId: doc.sessionId.toHexString(),
    projectId: doc.projectId.toHexString(),
    role: doc.role,
    senderType: doc.senderType,
    provider: doc.provider,
    content: doc.content,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

export function serializeRun(doc: RunDoc): RunRecord {
  return {
    id: doc._id!.toHexString(),
    projectId: doc.projectId.toHexString(),
    sessionId: doc.sessionId.toHexString(),
    provider: doc.provider,
    objective: doc.objective,
    constraints: doc.constraints,
    status: doc.status,
    startedAt: doc.startedAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    stoppedAt: doc.stoppedAt?.toISOString()
  };
}

export function serializeApproval(doc: ApprovalDoc): ApprovalRecord {
  return {
    id: doc._id!.toHexString(),
    projectId: doc.projectId.toHexString(),
    sessionId: doc.sessionId.toHexString(),
    runId: doc.runId.toHexString(),
    title: doc.title,
    reason: doc.reason,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    resolvedAt: doc.resolvedAt?.toISOString()
  };
}
