import type { ProviderId } from "@shared";
import type { ProviderAdapter } from "../types.js";
import { buildUnsupportedProviderReply } from "../shared.js";

export function createUnsupportedProviderAdapter(provider: ProviderId): ProviderAdapter {
  return {
    id: provider,
    async generateReply(input) {
      return buildUnsupportedProviderReply(input.prompt, provider);
    }
  };
}
