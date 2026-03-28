import type { ProviderId } from "@shared";
import type { MessageDoc, RunDoc } from "../db.js";
import { env } from "../env.js";

interface ClaudeRequestMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenAIInputText {
  type: "input_text";
  text: string;
}

interface OpenAIRequestMessage {
  role: "user" | "assistant";
  content: OpenAIInputText[];
}

interface GenerateProviderReplyInput {
  provider: ProviderId;
  prompt: string;
  history: MessageDoc[];
  mode: "session" | "run";
  signal?: AbortSignal;
  run?: RunDoc;
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

export class ProviderRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRuntimeError";
  }
}

function buildMockReply(prompt: string, provider: ProviderId): string {
  return [
    `这是 ${provider} 适配器的占位回复。`,
    `我已经收到你的请求：“${prompt.trim()}”。`,
    "当前版本先用 mock 流式返回来打通 API、消息时间线和停止逻辑。",
    "后续只需要把这里替换成真实 Provider 调用，就能接入 Claude、Codex、Cursor 或 Gemini。"
  ].join(" ");
}

function buildUnsupportedProviderReply(prompt: string, provider: ProviderId): string {
  return [
    `当前会话选择了 ${provider}，但该 Provider 适配器还没有接入。`,
    `我已经记录这次请求：“${prompt.trim()}”。`,
    "现阶段请优先使用 mock、claude 或 codex 会话。"
  ].join(" ");
}

function normalizeContent(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildClaudeSystemPrompt(mode: "session" | "run", run?: RunDoc): string {
  if (mode === "run") {
    return [
      "You are Claude operating inside RelayDesk.",
      "A surrogate AI agent is coordinating work on behalf of the real user.",
      "Continue the task in a practical engineering style, keep the answer concise, and respect the provided constraints.",
      run ? `Current objective: ${normalizeContent(run.objective) || "Not provided"}.` : "",
      run ? `Current constraints: ${normalizeContent(run.constraints) || "Be conservative and pause on risky actions."}.` : ""
    ]
      .filter(Boolean)
      .join(" ");
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

async function generateClaudeReply(
  history: MessageDoc[],
  mode: "session" | "run",
  signal?: AbortSignal,
  run?: RunDoc
): Promise<string> {
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
      system: buildClaudeSystemPrompt(mode, run),
      messages: buildClaudeMessages(history)
    }),
    signal
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

function buildCodexInstructions(mode: "session" | "run", run?: RunDoc): string {
  if (mode === "run") {
    return [
      "You are Codex operating inside RelayDesk.",
      "A surrogate AI agent is coordinating work on behalf of the real user.",
      "Respond as a practical coding agent, keep the answer concise, and follow the current constraints.",
      run ? `Current objective: ${normalizeContent(run.objective) || "Not provided"}.` : "",
      run ? `Current constraints: ${normalizeContent(run.constraints) || "Be conservative and pause on risky actions."}.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "You are Codex operating inside RelayDesk.",
    "Respond as a practical coding assistant and keep the answer concise."
  ].join(" ");
}

async function generateCodexReply(
  history: MessageDoc[],
  mode: "session" | "run",
  signal?: AbortSignal,
  run?: RunDoc
): Promise<string> {
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
      instructions: buildCodexInstructions(mode, run),
      input: buildOpenAIMessages(history),
      reasoning: {
        effort: env.OPENAI_REASONING_EFFORT
      },
      text: {
        format: {
          type: "text"
        }
      }
    }),
    signal
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

export async function generateProviderReply(
  input: GenerateProviderReplyInput
): Promise<string> {
  if (input.provider === "mock") {
    return buildMockReply(input.prompt, input.provider);
  }

  if (input.provider === "claude") {
    return generateClaudeReply(input.history, input.mode, input.signal, input.run);
  }

  if (input.provider === "codex") {
    return generateCodexReply(input.history, input.mode, input.signal, input.run);
  }

  return buildUnsupportedProviderReply(input.prompt, input.provider);
}
