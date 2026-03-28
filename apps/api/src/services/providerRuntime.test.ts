import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildClaudeMessages, buildOpenAIMessages } from "./providerRuntime.js";

describe("buildClaudeMessages", () => {
  it("maps message history into Anthropic-compatible roles and merges consecutive roles", () => {
    const sessionId = new ObjectId();
    const projectId = new ObjectId();
    const now = new Date();

    const messages = buildClaudeMessages([
      {
        _id: new ObjectId(),
        sessionId,
        projectId,
        role: "human",
        senderType: "user",
        content: "先看一下登录模块",
        status: "completed",
        createdAt: now,
        updatedAt: now
      },
      {
        _id: new ObjectId(),
        sessionId,
        projectId,
        role: "surrogate",
        senderType: "surrogate",
        content: "请继续拆解下一步",
        status: "completed",
        createdAt: now,
        updatedAt: now
      },
      {
        _id: new ObjectId(),
        sessionId,
        projectId,
        role: "provider",
        senderType: "provider",
        content: "可以先收敛状态管理。",
        status: "completed",
        createdAt: now,
        updatedAt: now
      }
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: "先看一下登录模块\n\n请继续拆解下一步"
      },
      {
        role: "assistant",
        content: "可以先收敛状态管理。"
      }
    ]);
  });
});

describe("buildOpenAIMessages", () => {
  it("maps message history into Responses API input items", () => {
    const sessionId = new ObjectId();
    const projectId = new ObjectId();
    const now = new Date();

    const messages = buildOpenAIMessages([
      {
        _id: new ObjectId(),
        sessionId,
        projectId,
        role: "human",
        senderType: "user",
        content: "请看一下路由层",
        status: "completed",
        createdAt: now,
        updatedAt: now
      },
      {
        _id: new ObjectId(),
        sessionId,
        projectId,
        role: "provider",
        senderType: "provider",
        content: "建议先拆 service 层。",
        status: "completed",
        createdAt: now,
        updatedAt: now
      }
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "请看一下路由层" }]
      },
      {
        role: "assistant",
        content: [{ type: "input_text", text: "建议先拆 service 层。" }]
      }
    ]);
  });
});
