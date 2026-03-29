import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceFileContent, WorkspaceFileEntry } from "@shared";

const IGNORED_NAMES = new Set([".git", "node_modules", "dist", ".vite", "coverage"]);

export class WorkspaceFileError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export function normalizeRelativePath(relativePath: string | undefined): string {
  const value = (relativePath ?? "").trim();
  if (!value || value === ".") {
    return "";
  }

  return path.normalize(value).replace(/\\/g, "/").replace(/^\.\/+/, "");
}

export function resolveWorkspacePath(rootPath: string, relativePath?: string): string {
  const resolvedRoot = path.resolve(rootPath);
  const normalizedRelative = normalizeRelativePath(relativePath);
  const targetPath = normalizedRelative ? path.resolve(resolvedRoot, normalizedRelative) : resolvedRoot;

  if (targetPath !== resolvedRoot && !targetPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new WorkspaceFileError(400, "Path escapes workspace root");
  }

  return targetPath;
}

function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return true;
  }

  let suspiciousBytes = 0;
  for (const byte of buffer) {
    const isPrintable =
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126) ||
      byte >= 128;

    if (!isPrintable) {
      suspiciousBytes += 1;
    }
  }

  return buffer.length > 0 && suspiciousBytes / buffer.length > 0.15;
}

export async function listWorkspaceFiles(
  rootPath: string,
  relativePath?: string
): Promise<{ currentPath: string; entries: WorkspaceFileEntry[] }> {
  const currentPath = normalizeRelativePath(relativePath);
  const absolutePath = resolveWorkspacePath(rootPath, currentPath);
  let directoryEntries;
  try {
    directoryEntries = await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return { currentPath, entries: [] };
    }

    throw error;
  }

  const entries = await Promise.all(
    directoryEntries
      .filter((entry) => !IGNORED_NAMES.has(entry.name))
      .map(async (entry) => {
        const childRelativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        const entryStat = await stat(path.join(absolutePath, entry.name));
        return {
          name: entry.name,
          path: childRelativePath.replace(/\\/g, "/"),
          kind: entry.isDirectory() ? "directory" : "file",
          size: entry.isDirectory() ? null : entryStat.size,
          updatedAt: entryStat.mtime.toISOString()
        } satisfies WorkspaceFileEntry;
      })
  );

  entries.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  return { currentPath, entries };
}

export async function searchWorkspaceFiles(input: {
  rootPath: string;
  query: string;
  limit?: number;
}): Promise<WorkspaceFileEntry[]> {
  const normalizedQuery = input.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const results: WorkspaceFileEntry[] = [];

  async function visit(relativePath = ""): Promise<void> {
    if (results.length >= limit) {
      return;
    }

    const absolutePath = resolveWorkspacePath(input.rootPath, relativePath);
    let directoryEntries;
    try {
      directoryEntries = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return;
      }

      throw error;
    }

    const sortedEntries = directoryEntries
      .filter((entry) => !IGNORED_NAMES.has(entry.name))
      .sort((left, right) => {
        const leftKind = left.isDirectory() ? 0 : 1;
        const rightKind = right.isDirectory() ? 0 : 1;
        if (leftKind !== rightKind) {
          return leftKind - rightKind;
        }

        return left.name.localeCompare(right.name);
      });

    for (const entry of sortedEntries) {
      if (results.length >= limit) {
        return;
      }

      const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await visit(childRelativePath);
        continue;
      }

      const normalizedPath = childRelativePath.replace(/\\/g, "/");
      const haystack = `${entry.name} ${normalizedPath}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        continue;
      }

      const entryStat = await stat(path.join(absolutePath, entry.name));
      results.push({
        name: entry.name,
        path: normalizedPath,
        kind: "file",
        size: entryStat.size,
        updatedAt: entryStat.mtime.toISOString()
      });
    }
  }

  await visit("");
  return results;
}

export async function readWorkspaceFile(
  rootPath: string,
  relativePath?: string
): Promise<WorkspaceFileContent> {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    throw new WorkspaceFileError(400, "File path is required");
  }

  const absolutePath = resolveWorkspacePath(rootPath, normalizedPath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new WorkspaceFileError(400, "Target path is not a file");
  }

  const buffer = await readFile(absolutePath);
  if (isProbablyBinary(buffer)) {
    throw new WorkspaceFileError(415, "Binary files are not supported in the editor yet");
  }

  return {
    path: normalizedPath,
    content: buffer.toString("utf8"),
    updatedAt: fileStat.mtime.toISOString()
  };
}

export async function saveWorkspaceFile(input: {
  rootPath: string;
  relativePath: string;
  content: string;
}): Promise<WorkspaceFileContent> {
  const normalizedPath = normalizeRelativePath(input.relativePath);
  if (!normalizedPath) {
    throw new WorkspaceFileError(400, "File path is required");
  }

  const absolutePath = resolveWorkspacePath(input.rootPath, normalizedPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.content, "utf8");

  const fileStat = await stat(absolutePath);
  return {
    path: normalizedPath,
    content: input.content,
    updatedAt: fileStat.mtime.toISOString()
  };
}
