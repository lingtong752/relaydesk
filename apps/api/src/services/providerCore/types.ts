import type { ProviderId } from "@shared";
import type { MessageDoc, RunDoc } from "../../db.js";

export type ProviderMode = "session" | "run";

export interface ProviderReplyRequest {
  provider: ProviderId;
  prompt: string;
  history: MessageDoc[];
  mode: ProviderMode;
  signal?: AbortSignal;
  run?: RunDoc;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  generateReply(input: ProviderReplyRequest): Promise<string>;
}
