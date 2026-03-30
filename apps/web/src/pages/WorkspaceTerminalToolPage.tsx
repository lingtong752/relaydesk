import { useLocation, useNavigate } from "react-router-dom";
import { TerminalWorkspace } from "../features/tools/terminal/components/TerminalWorkspace";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceTerminalToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projectRootPath, sessions, selectSession, token } = useProjectWorkspace();
  const focusSourceSessionId = new URLSearchParams(location.search).get("sessionId") ?? undefined;

  return token ? (
    <TerminalWorkspace
      focusSourceSessionId={focusSourceSessionId}
      onOpenBoundSession={(sessionId) => {
        selectSession(sessionId);
        navigate(`/workspace/${projectId}/chat`);
      }}
      projectId={projectId}
      rootPath={projectRootPath}
      token={token}
      workspaceSessions={sessions}
    />
  ) : (
    <></>
  );
}
