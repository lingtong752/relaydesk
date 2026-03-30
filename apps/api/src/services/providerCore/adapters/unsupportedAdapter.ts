import type { ProviderId } from "@shared";
import type { ProviderAdapter } from "../types.js";
import { buildShellTerminalSupport, buildUnsupportedProviderReply } from "../shared.js";

export function createUnsupportedProviderAdapter(provider: ProviderId): ProviderAdapter {
  return {
    id: provider,
    getTerminalSupport() {
      return buildShellTerminalSupport(`${provider} 还没有 provider terminal 适配器，先回退到项目 shell。`);
    },
    async generateReply(input) {
      return buildUnsupportedProviderReply(input.prompt, provider);
    }
  };
}
