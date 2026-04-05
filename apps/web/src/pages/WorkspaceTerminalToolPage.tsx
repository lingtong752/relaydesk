import { useLocation, useNavigate } from "react-router-dom";
import { TerminalWorkspace } from "../features/tools/terminal/components/TerminalWorkspace";
import {
  buildWorkspaceChatPath,
  getSessionIdFromSearch
} from "../features/workspace/sessionRouting";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceTerminalToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projectRootPath, sessions, selectSession, token } = useProjectWorkspace();
  const focusSourceSessionId = getSessionIdFromSearch(location.search);

  return token ? (
    <TerminalWorkspace
      focusSourceSessionId={focusSourceSessionId}
      onOpenBoundSession={(sessionId) => {
        selectSession(sessionId);
        navigate(buildWorkspaceChatPath(projectId));
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
