import { useContext } from "react";
import {
  ProjectWorkspaceContext,
  type ProjectWorkspaceContextValue
} from "./ProjectWorkspaceProvider";

export function useProjectWorkspace(): ProjectWorkspaceContextValue {
  const context = useContext(ProjectWorkspaceContext);
  if (!context) {
    throw new Error("useProjectWorkspace must be used within ProjectWorkspaceProvider");
  }

  return context;
}
