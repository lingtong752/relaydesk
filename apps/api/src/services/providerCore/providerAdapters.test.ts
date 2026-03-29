import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env.js";
import { getProviderAdapter } from "./index.js";
import { ProviderRuntimeError } from "./errors.js";

const originalAnthropicApiKey = env.ANTHROPIC_API_KEY;
const originalOpenAiApiKey = env.OPENAI_API_KEY;
const originalGeminiApiKey = env.GEMINI_API_KEY;

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

afterEach(() => {
  env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
  env.OPENAI_API_KEY = originalOpenAiApiKey;
  env.GEMINI_API_KEY = originalGeminiApiKey;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("provider adapters failure paths", () => {
  it("surfaces Anthropic API errors as ProviderRuntimeError", async () => {
    env.ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createJsonResponse(
          {
            error: {
              message: "Anthropic quota exceeded."
            }
          },
          429
        )
      )
    );

    await expect(
      getProviderAdapter("claude").generateReply({
        provider: "claude",
        prompt: "继续推进",
        history: [],
        mode: "session"
      })
    ).rejects.toEqual(new ProviderRuntimeError("Anthropic quota exceeded."));
  });

  it("fails fast when Codex returns an empty response payload", async () => {
    env.OPENAI_API_KEY = "test-openai-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createJsonResponse({
          output: []
        })
      )
    );

    await expect(
      getProviderAdapter("codex").generateReply({
        provider: "codex",
        prompt: "继续推进",
        history: [],
        mode: "session"
      })
    ).rejects.toEqual(new ProviderRuntimeError("Codex returned an empty response."));
  });

  it("surfaces Gemini safety blocks with a clear error message", async () => {
    env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createJsonResponse({
          promptFeedback: {
            blockReason: "SAFETY"
          },
          candidates: []
        })
      )
    );

    await expect(
      getProviderAdapter("gemini").generateReply({
        provider: "gemini",
        prompt: "继续推进",
        history: [],
        mode: "session"
      })
    ).rejects.toEqual(new ProviderRuntimeError("Gemini blocked the request: SAFETY."));
  });

  it("preserves abort errors so stream orchestration can treat them as stopped", async () => {
    env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"))
    );

    await expect(
      getProviderAdapter("gemini").generateReply({
        provider: "gemini",
        prompt: "继续推进",
        history: [],
        mode: "session"
      })
    ).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});
