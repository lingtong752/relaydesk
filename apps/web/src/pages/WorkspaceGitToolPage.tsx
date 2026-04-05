import { useLocation, useNavigate } from "react-router-dom";
import { GitWorkspace } from "../features/tools/git/components/GitWorkspace";
import {
  buildWorkspaceChatPath,
  findBoundSessionBySearch
} from "../features/workspace/sessionRouting";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceGitToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, sessions, selectSession, token } = useProjectWorkspace();
  const boundSession = findBoundSessionBySearch(sessions, location.search);

  return token ? (
    <GitWorkspace
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
      token={token}
    />
  ) : (
    <></>
  );
}
