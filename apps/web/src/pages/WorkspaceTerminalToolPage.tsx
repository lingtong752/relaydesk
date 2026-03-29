import { TerminalWorkspace } from "../features/tools/terminal/components/TerminalWorkspace";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceTerminalToolPage(): JSX.Element {
  const { projectId, projectRootPath, token } = useProjectWorkspace();

  return token ? <TerminalWorkspace projectId={projectId} rootPath={projectRootPath} token={token} /> : <></>;
}
