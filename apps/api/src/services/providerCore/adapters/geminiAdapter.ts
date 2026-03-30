import type { MessageDoc } from "../../../db.js";
import { env } from "../../../env.js";
import { ProviderRuntimeError } from "../errors.js";
import { buildProviderCliBridgeSupport, buildShellTerminalSupport, normalizeContent } from "../shared.js";
import type { ProviderAdapter, ProviderMode } from "../types.js";

interface GeminiTextPart {
  text: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiTextPart[];
}

interface GeminiRequestContent {
  parts: GeminiTextPart[];
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
}

function buildGeminiSystemInstruction(mode: ProviderMode, objective?: string, constraints?: string): GeminiRequestContent {
  const text =
    mode === "run"
      ? [
          "You are Gemini operating inside RelayDesk.",
          "A surrogate AI agent is coordinating work on behalf of the real user.",
          "Continue the task in a practical engineering style, keep the answer concise, and respect the provided constraints.",
          `Current objective: ${normalizeContent(objective ?? "") || "Not provided"}.`,
          `Current constraints: ${normalizeContent(constraints ?? "") || "Be conservative and pause on risky actions."}.`
        ].join(" ")
      : [
          "You are Gemini operating inside RelayDesk.",
          "Respond as a practical coding assistant and keep answers concise."
        ].join(" ");

  return {
    parts: [{ text }]
  };
}

export function buildGeminiContents(history: MessageDoc[], prompt?: string): GeminiContent[] {
  const mapped: GeminiContent[] = history
    .filter((message) => Boolean(message.content.trim()) && message.role !== "system")
    .map((message) => ({
      role: message.role === "provider" ? "model" : "user",
      parts: [
        {
          text: message.content.trim()
        }
      ]
    }));

  if (!mapped.length && prompt?.trim()) {
    mapped.push({
      role: "user",
      parts: [{ text: prompt.trim() }]
    });
  }

  const merged: GeminiContent[] = [];
  for (const message of mapped) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role) {
      previous.parts.push(...message.parts);
      continue;
    }

    merged.push({
      role: message.role,
      parts: [...message.parts]
    });
  }

  return merged;
}

export const geminiProviderAdapter: ProviderAdapter = {
  id: "gemini",
  getTerminalSupport(input) {
    if (input.runtimeMode === "cli_session_mode") {
      return buildProviderCliBridgeSupport();
    }

    return buildShellTerminalSupport("当前 Gemini 会话不是 CLI 历史会话，先回退到项目 shell。");
  },
  async generateReply(input) {
    if (!env.GEMINI_API_KEY) {
      throw new ProviderRuntimeError("Gemini provider is not configured. Please set GEMINI_API_KEY.");
    }

    const response = await fetch(`${env.GEMINI_BASE_URL}/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: buildGeminiSystemInstruction(input.mode, input.run?.objective, input.run?.constraints),
        contents: buildGeminiContents(input.history, input.prompt)
      }),
      signal: input.signal
    });

    const data = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) {
      throw new ProviderRuntimeError(
        data?.error?.message ??
          data?.promptFeedback?.blockReasonMessage ??
          `Gemini request failed with status ${response.status}.`
      );
    }

    const text = (data?.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");

    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason;
      throw new ProviderRuntimeError(
        blockReason ? `Gemini blocked the request: ${blockReason}.` : "Gemini returned an empty response."
      );
    }

    return text;
  }
};
