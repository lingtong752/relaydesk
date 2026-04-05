import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CurrentSessionPanel } from "../features/chat/components/CurrentSessionPanel";
import { SessionListPanel } from "../features/chat/components/SessionListPanel";
import { useSessionMessages } from "../features/chat/useSessionMessages";
import {
  buildSessionCountLabel,
  createSessionWithLoadingState,
  navigateToWorkspaceTool,
  selectSessionWithCleanup,
  stopSessionOutput,
  submitSessionMessage
} from "../features/chat/workspaceChatPageActions";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceChatPage(): JSX.Element {
  const navigate = useNavigate();
  const {
    projectId,
    projectName,
    projectRootPath,
    token,
    sessions,
    selectedSessionId,
    selectedSession,
    newSessionProvider,
    workspaceError,
    reconnectVersion,
    wsClient,
    lastRealtimeEvent,
    setNewSessionProvider,
    selectSession,
    clearWorkspaceError,
    createSession
  } = useProjectWorkspace();
  const [creatingSession, setCreatingSession] = useState(false);
  const {
    messages,
    messageDraft,
    pageError,
    stoppingSession,
    clearChatError,
    setMessageDraft,
    sendMessage,
    stopSession
  } = useSessionMessages({
    token,
    selectedSessionId,
    reconnectVersion,
    wsClient,
    lastRealtimeEvent,
    clearWorkspaceError
  });

  const combinedError = pageError ?? workspaceError;
  const sessionCountLabel = useMemo(
    () => buildSessionCountLabel(sessions.length),
    [sessions.length]
  );

  async function handleCreateSession(): Promise<void> {
    await createSessionWithLoadingState({
      clearChatError,
      setCreatingSession,
      createSession
    });
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    await submitSessionMessage({
      event,
      sendMessage
    });
  }

  async function handleStopSession(): Promise<void> {
    await stopSessionOutput({ stopSession });
  }

  function handleOpenTerminal(): void {
    navigateToWorkspaceTool({
      projectId,
      selectedSession,
      tool: "terminal",
      navigate
    });
  }

  function handleOpenFiles(): void {
    navigateToWorkspaceTool({
      projectId,
      selectedSession,
      tool: "files",
      navigate
    });
  }

  function handleOpenGit(): void {
    navigateToWorkspaceTool({
      projectId,
      selectedSession,
      tool: "git",
      navigate
    });
  }

  return (
    <div className="workspace-route-grid workspace-chat-grid">
      <SessionListPanel
        creatingSession={creatingSession}
        newSessionProvider={newSessionProvider}
        onCreateSession={() => void handleCreateSession()}
        onOpenProjects={() => navigate("/projects")}
        onProviderChange={setNewSessionProvider}
        onSelectSession={(sessionId) =>
          selectSessionWithCleanup({
            sessionId,
            clearChatError,
            selectSession
          })
        }
        projectName={projectName}
        projectRootPath={projectRootPath}
        selectedSessionId={selectedSessionId}
        sessionCountLabel={sessionCountLabel}
        sessions={sessions}
      />
      <CurrentSessionPanel
        combinedError={combinedError}
        messageDraft={messageDraft}
        messages={messages}
        onOpenFiles={handleOpenFiles}
        onOpenGit={handleOpenGit}
        onOpenTerminal={handleOpenTerminal}
        onDraftChange={setMessageDraft}
        onStopSession={() => void handleStopSession()}
        onSubmit={handleSendMessage}
        selectedSession={selectedSession}
        stoppingSession={stoppingSession}
      />
    </div>
  );
}
