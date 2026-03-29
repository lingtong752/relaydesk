import { MongoClient, ObjectId, type Collection } from "mongodb";
import type {
  ApprovalRecord,
  AuditEventRecord,
  AuthUser,
  MessageRecord,
  PluginActionRecord,
  PluginInstallationRecord,
  ProjectRecord,
  RunCheckpointRecord,
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
  origin: SessionRecord["origin"];
  externalSessionId?: string;
  sourcePath?: string;
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

export interface AuditEventDoc {
  _id?: ObjectId;
  projectId: ObjectId;
  sessionId?: ObjectId;
  runId?: ObjectId;
  eventType: AuditEventRecord["eventType"];
  actorType: AuditEventRecord["actorType"];
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface RunCheckpointDoc {
  _id?: ObjectId;
  projectId: ObjectId;
  sessionId: ObjectId;
  runId: ObjectId;
  runStatus: RunCheckpointRecord["runStatus"];
  source: string;
  summary: string;
  messageId?: ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PluginInstallationDoc {
  _id?: ObjectId;
  projectId: ObjectId;
  pluginId: string;
  sourceType: PluginInstallationRecord["sourceType"];
  sourceRef?: string | null;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  tabTitle: string;
  routeSegment: string;
  frontendComponent: PluginInstallationRecord["frontendComponent"];
  backendService: PluginInstallationRecord["backendService"];
  actions: PluginActionRecord[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseCollections {
  users: Collection<UserDoc>;
  projects: Collection<ProjectDoc>;
  sessions: Collection<SessionDoc>;
  messages: Collection<MessageDoc>;
  runs: Collection<RunDoc>;
  approvals: Collection<ApprovalDoc>;
  auditEvents: Collection<AuditEventDoc>;
  runCheckpoints: Collection<RunCheckpointDoc>;
  pluginInstallations: Collection<PluginInstallationDoc>;
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
    approvals: db.collection<ApprovalDoc>("approvals"),
    auditEvents: db.collection<AuditEventDoc>("audit_events"),
    runCheckpoints: db.collection<RunCheckpointDoc>("run_checkpoints"),
    pluginInstallations: db.collection<PluginInstallationDoc>("plugin_installations")
  };

  await collections.users.createIndex({ email: 1 }, { unique: true });
  await collections.projects.createIndex({ ownerId: 1, rootPath: 1 }, { unique: true });
  await collections.sessions.createIndex({ projectId: 1, updatedAt: -1 });
  await collections.messages.createIndex({ sessionId: 1, createdAt: 1 });
  await collections.runs.createIndex({ projectId: 1, status: 1, startedAt: -1 });
  await collections.approvals.createIndex({ projectId: 1, status: 1, createdAt: -1 });
  await collections.approvals.createIndex({ runId: 1, createdAt: -1 });
  await collections.auditEvents.createIndex({ runId: 1, createdAt: -1 });
  await collections.auditEvents.createIndex({ projectId: 1, createdAt: -1 });
  await collections.runCheckpoints.createIndex({ runId: 1, createdAt: -1 });
  await collections.runCheckpoints.createIndex({ projectId: 1, createdAt: -1 });
  await collections.pluginInstallations.createIndex({ projectId: 1, pluginId: 1 }, { unique: true });

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
    origin: doc.origin,
    externalSessionId: doc.externalSessionId,
    sourcePath: doc.sourcePath,
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

export function serializeAuditEvent(doc: AuditEventDoc): AuditEventRecord {
  return {
    id: doc._id!.toHexString(),
    projectId: doc.projectId.toHexString(),
    sessionId: doc.sessionId?.toHexString(),
    runId: doc.runId?.toHexString(),
    eventType: doc.eventType,
    actorType: doc.actorType,
    summary: doc.summary,
    payload: doc.payload,
    createdAt: doc.createdAt.toISOString()
  };
}

export function serializeRunCheckpoint(doc: RunCheckpointDoc): RunCheckpointRecord {
  return {
    id: doc._id!.toHexString(),
    projectId: doc.projectId.toHexString(),
    sessionId: doc.sessionId.toHexString(),
    runId: doc.runId.toHexString(),
    runStatus: doc.runStatus,
    source: doc.source,
    summary: doc.summary,
    messageId: doc.messageId?.toHexString(),
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString()
  };
}

export function serializePluginInstallation(
  doc: PluginInstallationDoc
): PluginInstallationRecord {
  return {
    installationId: doc._id!.toHexString(),
    projectId: doc.projectId.toHexString(),
    id: doc.pluginId,
    sourceType: doc.sourceType,
    sourceRef: doc.sourceRef,
    name: doc.name,
    version: doc.version,
    description: doc.description,
    capabilities: doc.capabilities,
    tabTitle: doc.tabTitle,
    routeSegment: doc.routeSegment,
    frontendComponent: doc.frontendComponent,
    backendService: doc.backendService,
    actions: doc.actions ?? [],
    enabled: doc.enabled,
    installedAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}
