import { useLocation, useNavigate } from "react-router-dom";
import { FileWorkspace } from "../features/tools/files/components/FileWorkspace";
import {
  buildWorkspaceChatPath,
  resolveWorkspaceToolSession
} from "../features/workspace/sessionRouting";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceFilesToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    projectId,
    projectRootPath,
    sessions,
    selectedSessionId,
    selectSession,
    token
  } = useProjectWorkspace();
  const boundSession = resolveWorkspaceToolSession({
    sessions,
    search: location.search,
    selectedSessionId
  });

  return token ? (
    <FileWorkspace
      boundSession={boundSession}
      onOpenBoundSession={
        boundSession
          ? () => {
              selectSession(boundSession.id);
              navigate(buildWorkspaceChatPath(projectId));
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
