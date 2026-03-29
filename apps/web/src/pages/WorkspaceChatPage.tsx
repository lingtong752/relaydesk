import { useMemo, useState } from "react";
import { CurrentSessionPanel } from "../features/chat/components/CurrentSessionPanel";
import { SessionListPanel } from "../features/chat/components/SessionListPanel";
import { useSessionMessages } from "../features/chat/useSessionMessages";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceChatPage(): JSX.Element {
  const {
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
  const sessionCountLabel = useMemo(() => `${sessions.length} 个会话`, [sessions.length]);

  async function handleCreateSession(): Promise<void> {
    clearChatError();
    setCreatingSession(true);
    try {
      await createSession();
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendMessage();
  }

  async function handleStopSession(): Promise<void> {
    await stopSession();
  }

  return (
    <div className="workspace-route-grid workspace-chat-grid">
      <SessionListPanel
        creatingSession={creatingSession}
        newSessionProvider={newSessionProvider}
        onCreateSession={() => void handleCreateSession()}
        onProviderChange={setNewSessionProvider}
        onSelectSession={(sessionId) => {
          clearChatError();
          selectSession(sessionId);
        }}
        selectedSessionId={selectedSessionId}
        sessionCountLabel={sessionCountLabel}
        sessions={sessions}
      />
      <CurrentSessionPanel
        combinedError={combinedError}
        messageDraft={messageDraft}
        messages={messages}
        onDraftChange={setMessageDraft}
        onStopSession={() => void handleStopSession()}
        onSubmit={handleSendMessage}
        selectedSession={selectedSession}
        stoppingSession={stoppingSession}
      />
    </div>
  );
}
