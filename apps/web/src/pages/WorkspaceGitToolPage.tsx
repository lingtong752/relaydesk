import { useLocation, useNavigate } from "react-router-dom";
import { GitWorkspace } from "../features/tools/git/components/GitWorkspace";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceGitToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, sessions, selectSession, token } = useProjectWorkspace();
  const focusSourceSessionId = new URLSearchParams(location.search).get("sessionId") ?? "";
  const boundSession = sessions.find((session) => session.id === focusSourceSessionId) ?? null;

  return token ? (
    <GitWorkspace
      boundSession={boundSession}
      onOpenBoundSession={
        boundSession
          ? () => {
              selectSession(boundSession.id);
              navigate(`/workspace/${projectId}/chat`);
            }
          : undefined
      }
      projectId={projectId}
      token={token}
    />
  ) : (
    <></>
  );
}
