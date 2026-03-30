import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildGeminiContents } from "./adapters/geminiAdapter.js";
import {
  getProviderAdapter,
  generateProviderReply,
  getProviderTerminalSupport,
  listRegisteredProviders
} from "./index.js";

describe("provider core registry", () => {
  it("registers the current concrete adapters behind a shared provider-core entrypoint", () => {
    expect(listRegisteredProviders()).toEqual(["mock", "claude", "codex", "gemini"]);
    expect(getProviderAdapter("mock").id).toBe("mock");
    expect(getProviderAdapter("claude").id).toBe("claude");
    expect(getProviderAdapter("codex").id).toBe("codex");
    expect(getProviderAdapter("gemini").id).toBe("gemini");
  });

  it("falls back to the unsupported adapter for placeholder providers", async () => {
    const reply = await generateProviderReply({
      provider: "cursor",
      prompt: "帮我继续推进",
      history: [],
      mode: "session"
    });

    expect(reply).toContain("cursor");
    expect(reply).toContain("还没有接入");
  });

  it("describes provider terminal support without coupling callers to adapter details", () => {
    expect(
      getProviderTerminalSupport({
        provider: "codex",
        runtimeMode: "cli_session_mode",
        origin: "imported_cli"
      })
    ).toMatchObject({
      backendType: "provider_cli",
      attachMode: "resume_bridge",
      supportsInput: true,
      supportsResize: true
    });

    expect(
      getProviderTerminalSupport({
        provider: "mock",
        runtimeMode: "api_mode",
        origin: "relaydesk"
      })
    ).toMatchObject({
      backendType: "shell",
      attachMode: "direct_shell"
    });
  });

  it("maps RelayDesk history into Gemini contents with merged turns", () => {
    const sessionId = new ObjectId();
    const projectId = new ObjectId();
    const now = new Date("2026-03-28T10:00:00.000Z");

    const contents = buildGeminiContents([
      {
        _id: new ObjectId(),
        sessionId,
        projectId,
        role: "human",
        senderType: "user",
        provider: "gemini",
        content: "请帮我看看这个重构点",
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
        provider: "gemini",
        content: "可以，先从边界划分开始。",
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
        provider: "gemini",
        content: "然后补一条最短主链路测试。",
        status: "completed",
        createdAt: now,
        updatedAt: now
      }
    ]);

    expect(contents).toEqual([
      {
        role: "user",
        parts: [{ text: "请帮我看看这个重构点" }]
      },
      {
        role: "model",
        parts: [{ text: "可以，先从边界划分开始。" }, { text: "然后补一条最短主链路测试。" }]
      }
    ]);
  });
});
