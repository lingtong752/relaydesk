import type { MessageDoc } from "../../../db.js";
import { env } from "../../../env.js";
import { ProviderRuntimeError } from "../errors.js";
import { normalizeContent } from "../shared.js";
import type { ProviderAdapter, ProviderMode } from "../types.js";

interface ClaudeRequestMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[];
  error?: {
    message?: string;
  };
}

function buildClaudeSystemPrompt(mode: ProviderMode, objective?: string, constraints?: string): string {
  if (mode === "run") {
    return [
      "You are Claude operating inside RelayDesk.",
      "A surrogate AI agent is coordinating work on behalf of the real user.",
      "Continue the task in a practical engineering style, keep the answer concise, and respect the provided constraints.",
      `Current objective: ${normalizeContent(objective ?? "") || "Not provided"}.`,
      `Current constraints: ${normalizeContent(constraints ?? "") || "Be conservative and pause on risky actions."}.`
    ].join(" ");
  }

  return [
    "You are Claude operating inside RelayDesk.",
    "Respond as a practical coding assistant and keep answers concise."
  ].join(" ");
}

export function buildClaudeMessages(history: MessageDoc[]): ClaudeRequestMessage[] {
  const mapped: ClaudeRequestMessage[] = history
    .filter((message) => Boolean(message.content.trim()) && message.role !== "system")
    .map((message) => ({
      role: message.role === "provider" ? "assistant" : "user",
      content: message.content.trim()
    }));

  const merged: ClaudeRequestMessage[] = [];
  for (const message of mapped) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
      continue;
    }

    merged.push({ ...message });
  }

  return merged;
}

export const claudeProviderAdapter: ProviderAdapter = {
  id: "claude",
  async generateReply(input) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new ProviderRuntimeError("Claude provider is not configured. Please set ANTHROPIC_API_KEY.");
    }

    const response = await fetch(`${env.ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: buildClaudeSystemPrompt(input.mode, input.run?.objective, input.run?.constraints),
        messages: buildClaudeMessages(input.history)
      }),
      signal: input.signal
    });

    const data = (await response.json().catch(() => null)) as AnthropicMessageResponse | null;
    if (!response.ok) {
      throw new ProviderRuntimeError(
        data?.error?.message ?? `Claude request failed with status ${response.status}.`
      );
    }

    const text = (data?.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text!.trim())
      .filter(Boolean)
      .join("\n\n");

    if (!text) {
      throw new ProviderRuntimeError("Claude returned an empty response.");
    }

    return text;
  }
};
