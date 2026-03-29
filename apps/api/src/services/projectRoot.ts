import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const LEGACY_DEMO_ROOT_PATH = "/workspace/demo";
const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(currentDir, "../../../../");

export function normalizeRequestedProjectRootPath(rootPath: string | undefined): string {
  const normalized = rootPath?.trim();
  return normalized ? normalized : DEFAULT_PROJECT_ROOT;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProjectRootPath(rootPath: string): Promise<string> {
  const normalized = normalizeRequestedProjectRootPath(rootPath);

  if (normalized === LEGACY_DEMO_ROOT_PATH && !(await pathExists(normalized))) {
    return DEFAULT_PROJECT_ROOT;
  }

  return normalized;
}
