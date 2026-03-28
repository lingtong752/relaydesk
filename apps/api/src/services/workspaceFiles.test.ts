import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WorkspaceFileError,
  listWorkspaceFiles,
  readWorkspaceFile,
  resolveWorkspacePath,
  saveWorkspaceFile
} from "./workspaceFiles.js";

const createdDirectories: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cloudcli-files-"));
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("resolveWorkspacePath", () => {
  it("prevents paths from escaping the workspace root", () => {
    expect(() => resolveWorkspacePath("/tmp/demo-root", "../outside.txt")).toThrow(WorkspaceFileError);
  });
});

describe("listWorkspaceFiles", () => {
  it("lists directories before files and filters generated folders", async () => {
    const root = await createTempWorkspace();
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "node_modules"));
    await writeFile(path.join(root, "README.md"), "# demo\n", "utf8");

    const result = await listWorkspaceFiles(root);

    expect(result.entries.map((entry) => entry.path)).toEqual(["src", "README.md"]);
  });
});

describe("saveWorkspaceFile and readWorkspaceFile", () => {
  it("creates parent directories and reads saved content", async () => {
    const root = await createTempWorkspace();

    const saved = await saveWorkspaceFile({
      rootPath: root,
      relativePath: "notes/todo.md",
      content: "hello workspace"
    });
    const read = await readWorkspaceFile(root, "notes/todo.md");

    expect(saved.path).toBe("notes/todo.md");
    expect(read.content).toBe("hello workspace");
  });
});
