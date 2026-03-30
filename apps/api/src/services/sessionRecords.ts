import type { SessionRecord } from "@shared";
import { serializeSession, type SessionDoc } from "../db.js";
import type { CliSessionRunner } from "./cliSessionRunner.js";

function resolveRuntimeMode(session: SessionDoc): NonNullable<SessionRecord["runtimeMode"]> {
  if (session.runtimeMode) {
    return session.runtimeMode;
  }

  return session.origin === "imported_cli" ? "cli_session_mode" : "api_mode";
}

function canResumeImportedSession(
  session: SessionDoc,
  cliSessionRunner?: Pick<CliSessionRunner, "supportsImportedSession">
): boolean {
  return session.origin === "imported_cli" && !!cliSessionRunner?.supportsImportedSession(session.provider);
}

export function serializeWorkspaceSession(
  session: SessionDoc,
  cliSessionRunner?: Pick<CliSessionRunner, "supportsImportedSession">
): SessionRecord {
  const serialized = serializeSession(session);
  const importedResumable = canResumeImportedSession(session, cliSessionRunner);
  const isRelayDeskSession = session.origin === "relaydesk";

  return {
    ...serialized,
    runtimeMode: resolveRuntimeMode(session),
    capabilities: {
      canSendMessages: isRelayDeskSession || importedResumable,
      canResume: importedResumable,
      canStartRuns: isRelayDeskSession || importedResumable,
      canAttachTerminal: true
    }
  };
}
