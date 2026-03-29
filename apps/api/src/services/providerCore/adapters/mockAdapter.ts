import type { ProviderAdapter } from "../types.js";
import { buildMockReply } from "../shared.js";

export const mockProviderAdapter: ProviderAdapter = {
  id: "mock",
  async generateReply(input) {
    return buildMockReply(input.prompt, input.provider);
  }
};
