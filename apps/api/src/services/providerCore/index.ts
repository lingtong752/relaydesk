import { getProviderAdapter, listRegisteredProviders } from "./registry.js";
import type { ProviderReplyRequest } from "./types.js";

export { ProviderRuntimeError } from "./errors.js";
export { buildClaudeMessages } from "./adapters/claudeAdapter.js";
export { buildOpenAIMessages } from "./adapters/codexAdapter.js";
export { buildGeminiContents } from "./adapters/geminiAdapter.js";
export { getProviderAdapter, listRegisteredProviders };
export type { ProviderAdapter, ProviderMode, ProviderReplyRequest } from "./types.js";

export async function generateProviderReply(input: ProviderReplyRequest): Promise<string> {
  return getProviderAdapter(input.provider).generateReply(input);
}
