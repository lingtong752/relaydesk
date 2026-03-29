import { FileWorkspace } from "../features/tools/files/components/FileWorkspace";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";

export function WorkspaceFilesToolPage(): JSX.Element {
  const { projectId, projectRootPath, token } = useProjectWorkspace();

  return token ? <FileWorkspace projectId={projectId} rootPath={projectRootPath} token={token} /> : <></>;
}
