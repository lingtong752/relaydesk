import type { ProviderId } from "@shared";
import type { ProviderTerminalSupport } from "./types.js";

export function normalizeContent(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function buildMockReply(prompt: string, provider: ProviderId): string {
  return [
    `这是 ${provider} 适配器的占位回复。`,
    `我已经收到你的请求：“${prompt.trim()}”。`,
    "当前版本先用 mock 流式返回来打通 API、消息时间线和停止逻辑。",
    "后续只需要把这里替换成真实 Provider 调用，就能接入 Claude、Codex、Cursor 或 Gemini。"
  ].join(" ");
}

export function buildUnsupportedProviderReply(prompt: string, provider: ProviderId): string {
  return [
    `当前会话选择了 ${provider}，但该 Provider 适配器还没有接入。`,
    `我已经记录这次请求：“${prompt.trim()}”。`,
    "现阶段请优先使用 mock、claude、codex 或 gemini 会话。"
  ].join(" ");
}

export function buildShellTerminalSupport(
  fallbackReason?: string | null
): ProviderTerminalSupport {
  return {
    backendType: "shell",
    attachMode: "direct_shell",
    supportsInput: true,
    supportsResize: true,
    fallbackReason: fallbackReason ?? null
  };
}

export function buildProviderCliBridgeSupport(): ProviderTerminalSupport {
  return {
    backendType: "provider_cli",
    attachMode: "resume_bridge",
    supportsInput: true,
    supportsResize: true,
    fallbackReason: null
  };
}
