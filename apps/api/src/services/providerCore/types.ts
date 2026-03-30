import type {
  ProviderId,
  SessionRecord,
  TerminalAttachMode,
  TerminalBackendType
} from "@shared";
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

export interface ProviderTerminalSupportRequest {
  origin?: SessionRecord["origin"];
  runtimeMode?: SessionRecord["runtimeMode"];
}

export interface ProviderTerminalSupport {
  backendType: TerminalBackendType;
  attachMode: TerminalAttachMode;
  supportsInput: boolean;
  supportsResize: boolean;
  fallbackReason?: string | null;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  generateReply(input: ProviderReplyRequest): Promise<string>;
  getTerminalSupport(input: ProviderTerminalSupportRequest): ProviderTerminalSupport;
}
