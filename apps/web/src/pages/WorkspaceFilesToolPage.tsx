import { useLocation, useNavigate } from "react-router-dom";
import { FileWorkspace } from "../features/tools/files/components/FileWorkspace";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceFilesToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projectRootPath, sessions, selectSession, token } = useProjectWorkspace();
  const focusSourceSessionId = new URLSearchParams(location.search).get("sessionId") ?? "";
  const boundSession = sessions.find((session) => session.id === focusSourceSessionId) ?? null;

  return token ? (
    <FileWorkspace
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
      rootPath={projectRootPath}
      token={token}
    />
  ) : (
    <></>
  );
}
