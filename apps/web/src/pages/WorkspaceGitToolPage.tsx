import { GitWorkspace } from "../features/tools/git/components/GitWorkspace";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceGitToolPage(): JSX.Element {
  const { projectId, token } = useProjectWorkspace();

  return token ? <GitWorkspace projectId={projectId} token={token} /> : <></>;
}
