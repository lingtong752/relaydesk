import type { SessionRecord } from "@shared";
import {
  buildWorkspaceToolPath as buildWorkspaceToolPathFromRouting
} from "../workspace/sessionRouting";

type WorkspaceToolTab = "terminal" | "files" | "git";

export function buildSessionCountLabel(count: number): string {
  return `${count} 个会话`;
}

export function buildWorkspaceToolPath(input: {
  projectId: string;
  tool: WorkspaceToolTab;
  sessionId: string;
}): string {
  return buildWorkspaceToolPathFromRouting({
    projectId: input.projectId,
    tool: input.tool,
    sessionId: input.sessionId
  });
}

export function navigateToWorkspaceTool(input: {
  projectId: string;
  selectedSession: SessionRecord | null;
  tool: WorkspaceToolTab;
  navigate(path: string): void;
}): boolean {
  if (!input.selectedSession) {
    return false;
  }

  input.navigate(
    buildWorkspaceToolPath({
      projectId: input.projectId,
      tool: input.tool,
      sessionId: input.selectedSession.id
    })
  );
  return true;
}

export async function createSessionWithLoadingState(input: {
  clearChatError(): void;
  setCreatingSession(value: boolean): void;
  createSession(): Promise<void>;
}): Promise<void> {
  input.clearChatError();
  input.setCreatingSession(true);
  try {
    await input.createSession();
  } finally {
    input.setCreatingSession(false);
  }
}

export function selectSessionWithCleanup(input: {
  sessionId: string;
  clearChatError(): void;
  selectSession(sessionId: string): void;
}): void {
  input.clearChatError();
  input.selectSession(input.sessionId);
}

export async function submitSessionMessage(input: {
  event: Pick<React.FormEvent<HTMLFormElement>, "preventDefault">;
  sendMessage(): Promise<void>;
}): Promise<void> {
  input.event.preventDefault();
  await input.sendMessage();
}

export async function stopSessionOutput(input: {
  stopSession(): Promise<void>;
}): Promise<void> {
  await input.stopSession();
}
