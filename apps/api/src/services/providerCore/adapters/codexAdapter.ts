import type { MessageDoc } from "../../../db.js";
import { env } from "../../../env.js";
import { ProviderRuntimeError } from "../errors.js";
import { normalizeContent } from "../shared.js";
import type { ProviderAdapter, ProviderMode } from "../types.js";

interface OpenAIInputText {
  type: "input_text";
  text: string;
}

interface OpenAIRequestMessage {
  role: "user" | "assistant";
  content: OpenAIInputText[];
}

interface OpenAIOutputTextBlock {
  type: string;
  text?: string;
}

interface OpenAIOutputItem {
  type: string;
  content?: OpenAIOutputTextBlock[];
}

interface OpenAIResponse {
  output?: OpenAIOutputItem[];
  output_text?: string;
  error?: {
    message?: string;
  };
}

function buildCodexInstructions(mode: ProviderMode, objective?: string, constraints?: string): string {
  if (mode === "run") {
    return [
      "You are Codex operating inside RelayDesk.",
      "A surrogate AI agent is coordinating work on behalf of the real user.",
      "Respond as a practical coding agent, keep the answer concise, and follow the current constraints.",
      `Current objective: ${normalizeContent(objective ?? "") || "Not provided"}.`,
      `Current constraints: ${normalizeContent(constraints ?? "") || "Be conservative and pause on risky actions."}.`
    ].join(" ");
  }

  return [
    "You are Codex operating inside RelayDesk.",
    "Respond as a practical coding assistant and keep the answer concise."
  ].join(" ");
}

export function buildOpenAIMessages(history: MessageDoc[]): OpenAIRequestMessage[] {
  const mapped: OpenAIRequestMessage[] = history
    .filter((message) => Boolean(message.content.trim()) && message.role !== "system")
    .map((message) => ({
      role: message.role === "provider" ? "assistant" : "user",
      content: [
        {
          type: "input_text",
          text: message.content.trim()
        }
      ]
    }));

  const merged: OpenAIRequestMessage[] = [];
  for (const message of mapped) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role) {
      previous.content.push(...message.content);
      continue;
    }

    merged.push({
      role: message.role,
      content: [...message.content]
    });
  }

  return merged;
}

export const codexProviderAdapter: ProviderAdapter = {
  id: "codex",
  async generateReply(input) {
    if (!env.OPENAI_API_KEY) {
      throw new ProviderRuntimeError("Codex provider is not configured. Please set OPENAI_API_KEY.");
    }

    const response = await fetch(`${env.OPENAI_BASE_URL}/v1/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        instructions: buildCodexInstructions(input.mode, input.run?.objective, input.run?.constraints),
        input: buildOpenAIMessages(input.history),
        reasoning: {
          effort: env.OPENAI_REASONING_EFFORT
        },
        text: {
          format: {
            type: "text"
          }
        }
      }),
      signal: input.signal
    });

    const data = (await response.json().catch(() => null)) as OpenAIResponse | null;
    if (!response.ok) {
      throw new ProviderRuntimeError(
        data?.error?.message ?? `Codex request failed with status ${response.status}.`
      );
    }

    const text =
      data?.output_text?.trim() ||
      (data?.output ?? [])
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((block) => block.type === "output_text" && typeof block.text === "string")
        .map((block) => block.text!.trim())
        .filter(Boolean)
        .join("\n\n");

    if (!text) {
      throw new ProviderRuntimeError("Codex returned an empty response.");
    }

    return text;
  }
};
