import { ObjectId } from "mongodb";
import type { DatabaseCollections, MessageDoc, RunDoc } from "../db.js";
import { serializeMessage, serializeRun } from "../db.js";
import type { ProviderId } from "@shared";
import { SessionHub } from "../ws/sessionHub.js";
import { generateProviderReply, ProviderRuntimeError } from "./providerRuntime.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text: string, size = 20): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function buildSurrogateReply(objective: string, constraints: string): string {
  return [
    "替身 AI Agent 已启动。",
    `当前目标：${objective.trim() || "未填写目标"}`,
    `执行边界：${constraints.trim() || "保持保守推进，遇到风险请求人工介入。"}`
  ].join(" ");
}

export class StreamRegistry {
  private readonly sessionStreams = new Map<string, AbortController>();
  private readonly runStreams = new Map<string, AbortController>();

  startSession(sessionId: string): AbortController {
    this.stopSession(sessionId);
    const controller = new AbortController();
    this.sessionStreams.set(sessionId, controller);
    return controller;
  }

  stopSession(sessionId: string): void {
    const controller = this.sessionStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.sessionStreams.delete(sessionId);
    }
  }

  startRun(runId: string): AbortController {
    this.stopRun(runId);
    const controller = new AbortController();
    this.runStreams.set(runId, controller);
    return controller;
  }

  stopRun(runId: string): void {
    const controller = this.runStreams.get(runId);
    if (controller) {
      controller.abort();
      this.runStreams.delete(runId);
    }
  }

  finishSession(sessionId: string): void {
    this.sessionStreams.delete(sessionId);
  }

  finishRun(runId: string): void {
    this.runStreams.delete(runId);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function streamProviderMessage(input: {
  collections: DatabaseCollections;
  hub: SessionHub;
  registry: StreamRegistry;
  sessionId: ObjectId;
  projectId: ObjectId;
  provider: ProviderId;
  prompt: string;
}): Promise<void> {
  const { collections, hub, registry, sessionId, projectId, provider, prompt } = input;
  const now = new Date();
  const providerMessage: MessageDoc = {
    _id: new ObjectId(),
    sessionId,
    projectId,
    role: "provider",
    senderType: "provider",
    provider,
    content: "",
    status: "streaming",
    createdAt: now,
    updatedAt: now
  };

  await collections.messages.insertOne(providerMessage);
  hub.publish(`session:${sessionId.toHexString()}`, {
    type: "message.created",
    payload: { message: serializeMessage(providerMessage) }
  });

  const controller = registry.startSession(sessionId.toHexString());
  let replyText = "";
  try {
    const history = await collections.messages.find({ sessionId }).sort({ createdAt: 1 }).toArray();
    replyText = await generateProviderReply({
      provider,
      prompt,
      history,
      mode: "session",
      signal: controller.signal
    });
  } catch (error) {
    const updatedAt = new Date();
    const isAborted = isAbortError(error) || controller.signal.aborted;
    const message = isAborted
      ? "当前输出已停止。"
      : error instanceof ProviderRuntimeError
        ? error.message
        : "Provider request failed unexpectedly.";
    await collections.messages.updateOne(
      { _id: providerMessage._id },
      { $set: { content: message, status: isAborted ? "stopped" : "failed", updatedAt } }
    );
    await collections.sessions.updateOne(
      { _id: sessionId },
      { $set: { status: isAborted ? "stopped" : "stopped", updatedAt } }
    );
    const failedMessage = await collections.messages.findOne({ _id: providerMessage._id });
    if (failedMessage) {
      hub.publish(`session:${sessionId.toHexString()}`, {
        type: "message.completed",
        payload: { message: serializeMessage(failedMessage) }
      });
    }
    registry.finishSession(sessionId.toHexString());
    return;
  }

  const chunks = chunkText(replyText);
  let content = "";

  for (const chunk of chunks) {
    if (controller.signal.aborted) {
      break;
    }

    content += chunk;
    const updatedAt = new Date();
    await collections.messages.updateOne(
      { _id: providerMessage._id },
      { $set: { content, updatedAt } }
    );
    hub.publish(`session:${sessionId.toHexString()}`, {
      type: "message.delta",
      payload: { messageId: providerMessage._id!.toHexString(), delta: chunk }
    });
    await sleep(180);
  }

  const completedMessage = await collections.messages.findOne({ _id: providerMessage._id });
  if (!completedMessage) {
    registry.finishSession(sessionId.toHexString());
    return;
  }

  const finalStatus = controller.signal.aborted ? "stopped" : "completed";
  const updatedAt = new Date();
  await collections.messages.updateOne(
    { _id: providerMessage._id },
    { $set: { status: finalStatus, updatedAt } }
  );
  await collections.sessions.updateOne(
    { _id: sessionId },
    { $set: { status: finalStatus === "completed" ? "idle" : "stopped", updatedAt } }
  );

  const finalMessage = await collections.messages.findOne({ _id: providerMessage._id });
  if (finalMessage) {
    hub.publish(`session:${sessionId.toHexString()}`, {
      type: "message.completed",
      payload: { message: serializeMessage(finalMessage) }
    });
  }

  registry.finishSession(sessionId.toHexString());
}

export async function streamSurrogateRun(input: {
  collections: DatabaseCollections;
  hub: SessionHub;
  registry: StreamRegistry;
  run: RunDoc;
}): Promise<void> {
  const { collections, hub, registry, run } = input;
  const channelProject = `project:${run.projectId.toHexString()}`;
  const now = new Date();
  const surrogateMessage: MessageDoc = {
    _id: new ObjectId(),
    sessionId: run.sessionId,
    projectId: run.projectId,
    role: "surrogate",
    senderType: "surrogate",
    provider: run.provider,
    content: buildSurrogateReply(run.objective, run.constraints),
    status: "completed",
    createdAt: now,
    updatedAt: now
  };

  await collections.messages.insertOne(surrogateMessage);
  hub.publish(`session:${run.sessionId.toHexString()}`, {
    type: "message.created",
    payload: { message: serializeMessage(surrogateMessage) }
  });

  const providerMessage: MessageDoc = {
    _id: new ObjectId(),
    sessionId: run.sessionId,
    projectId: run.projectId,
    role: "provider",
    senderType: "provider",
    provider: run.provider,
    content: "",
    status: "streaming",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await collections.messages.insertOne(providerMessage);
  hub.publish(`session:${run.sessionId.toHexString()}`, {
    type: "message.created",
    payload: { message: serializeMessage(providerMessage) }
  });

  const controller = registry.startRun(run._id!.toHexString());
  let replyText = "";
  try {
    const history = await collections.messages.find({ sessionId: run.sessionId }).sort({ createdAt: 1 }).toArray();
    replyText = await generateProviderReply({
      provider: run.provider,
      prompt: run.objective,
      history,
      mode: "run",
      signal: controller.signal,
      run
    });
  } catch (error) {
    const updatedAt = new Date();
    const isAborted = isAbortError(error) || controller.signal.aborted;
    const message = isAborted
      ? "当前替身运行已停止。"
      : error instanceof ProviderRuntimeError
        ? error.message
        : "Provider request failed unexpectedly.";
    await collections.messages.updateOne(
      { _id: providerMessage._id },
      { $set: { content: message, status: isAborted ? "stopped" : "failed", updatedAt } }
    );
    await collections.runs.updateOne(
      { _id: run._id },
      { $set: { status: isAborted ? "stopped" : "failed", updatedAt } }
    );
    const failedMessage = await collections.messages.findOne({ _id: providerMessage._id });
    if (failedMessage) {
      hub.publish(`session:${run.sessionId.toHexString()}`, {
        type: "message.completed",
        payload: { message: serializeMessage(failedMessage) }
      });
    }
    const failedRun = await collections.runs.findOne({ _id: run._id });
    if (failedRun) {
      hub.publish(channelProject, {
        type: "run.updated",
        payload: { run: serializeRun(failedRun) }
      });
    }
    registry.finishRun(run._id!.toHexString());
    return;
  }

  const chunks = chunkText(replyText);
  let content = "";

  for (const chunk of chunks) {
    if (controller.signal.aborted) {
      break;
    }

    content += chunk;
    const updatedAt = new Date();
    await collections.messages.updateOne(
      { _id: providerMessage._id },
      { $set: { content, updatedAt } }
    );
    hub.publish(`session:${run.sessionId.toHexString()}`, {
      type: "message.delta",
      payload: { messageId: providerMessage._id!.toHexString(), delta: chunk }
    });
    await sleep(200);
  }

  const status = controller.signal.aborted ? "stopped" : "completed";
  const updatedAt = new Date();
  await collections.messages.updateOne(
    { _id: providerMessage._id },
    { $set: { status, updatedAt } }
  );
  await collections.runs.updateOne(
    { _id: run._id },
    {
      $set: {
        status,
        updatedAt,
        ...(status === "stopped" ? { stoppedAt: updatedAt } : {})
      }
    }
  );

  const finalMessage = await collections.messages.findOne({ _id: providerMessage._id });
  if (finalMessage) {
    hub.publish(`session:${run.sessionId.toHexString()}`, {
      type: "message.completed",
      payload: { message: serializeMessage(finalMessage) }
    });
  }

  const finalRun = await collections.runs.findOne({ _id: run._id });
  if (finalRun) {
    hub.publish(channelProject, {
      type: "run.updated",
      payload: { run: serializeRun(finalRun) }
    });
  }

  registry.finishRun(run._id!.toHexString());
}
