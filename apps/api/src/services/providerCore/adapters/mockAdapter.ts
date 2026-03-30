import type { ProviderAdapter } from "../types.js";
import { buildMockReply, buildShellTerminalSupport } from "../shared.js";

export const mockProviderAdapter: ProviderAdapter = {
  id: "mock",
  getTerminalSupport() {
    return buildShellTerminalSupport("mock provider 不提供原生 CLI terminal，先回退到项目 shell。");
  },
  async generateReply(input) {
    return buildMockReply(input.prompt, input.provider);
  }
};
