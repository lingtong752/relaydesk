import { useLocation, useNavigate } from "react-router-dom";
import { GitWorkspace } from "../features/tools/git/components/GitWorkspace";
import {
  buildWorkspaceChatPath,
  resolveWorkspaceToolSession
} from "../features/workspace/sessionRouting";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceGitToolPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, sessions, selectedSessionId, selectSession, token } = useProjectWorkspace();
  const boundSession = resolveWorkspaceToolSession({
    sessions,
    search: location.search,
    selectedSessionId
  });

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
