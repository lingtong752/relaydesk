import { useLocation, useNavigate } from "react-router-dom";
import { FileWorkspace } from "../features/tools/files/components/FileWorkspace";
import {
  buildWorkspaceChatPath,
  findBoundSessionBySearch
} from "../features/workspace/sessionRouting";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceFilesToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projectRootPath, sessions, selectSession, token } = useProjectWorkspace();
  const boundSession = findBoundSessionBySearch(sessions, location.search);

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
