import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkoutGitBranch,
  commitGitChanges,
  fetchGitRemote,
  listGitBranches,
  listGitRemotes,
  parseGitStatusOutput,
  pullGitBranch,
  pushGitBranch,
  readGitStatus,
  stageGitFiles,
  unstageGitFiles
} from "./gitWorkspace.js";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function createTempRepository(): Promise<{ repoPath: string; defaultBranch: string }> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "relaydesk-git-"));
  tempDirectories.push(repoPath);

  await runGit(["init"], repoPath);
  await runGit(["config", "user.name", "RelayDesk Test"], repoPath);
  await runGit(["config", "user.email", "relaydesk@example.com"], repoPath);

  await writeFile(path.join(repoPath, "README.md"), "hello\n", "utf8");
  await runGit(["add", "README.md"], repoPath);
  await runGit(["commit", "-m", "init"], repoPath);

  const branches = await listGitBranches(repoPath);
  return {
    repoPath,
    defaultBranch: branches.find((branch) => branch.current)?.name ?? branches[0]?.name ?? "main"
  };
}

async function cloneRepository(remotePath: string): Promise<string> {
  const cloneParentPath = await mkdtemp(path.join(tmpdir(), "relaydesk-git-clone-"));
  tempDirectories.push(cloneParentPath);
  const clonePath = path.join(cloneParentPath, "repo");

  await execFileAsync("git", ["clone", remotePath, clonePath]);
  await runGit(["config", "user.name", "RelayDesk Test"], clonePath);
  await runGit(["config", "user.email", "relaydesk@example.com"], clonePath);

  return clonePath;
}

async function createTempRepositoryWithRemote(): Promise<{
  repoPath: string;
  defaultBranch: string;
  remotePath: string;
  peerPath: string;
}> {
  const { repoPath, defaultBranch } = await createTempRepository();
  const remotePath = await mkdtemp(path.join(tmpdir(), "relaydesk-git-remote-"));
  tempDirectories.push(remotePath);

  await runGit(["init", "--bare"], remotePath);
  await runGit(["remote", "add", "origin", remotePath], repoPath);
  await runGit(["push", "-u", "origin", defaultBranch], repoPath);
  await runGit(["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`], remotePath);

  return {
    repoPath,
    defaultBranch,
    remotePath,
    peerPath: await cloneRepository(remotePath)
  };
}

describe("parseGitStatusOutput", () => {
  it("parses branch information and changed files", () => {
    const output = [
      "## main...origin/main [ahead 2, behind 1]",
      " M apps/web/src/App.tsx",
      "A  README.md",
      "?? docs/notes.md"
    ].join("\n");

    const parsed = parseGitStatusOutput(output, "/workspace/demo");

    expect(parsed.branch).toBe("main");
    expect(parsed.ahead).toBe(2);
    expect(parsed.behind).toBe(1);
    expect(parsed.dirty).toBe(true);
    expect(parsed.files).toEqual([
      {
        path: "apps/web/src/App.tsx",
        stagedStatus: " ",
        unstagedStatus: "M",
        summary: "未暂存修改"
      },
      {
        path: "README.md",
        stagedStatus: "A",
        unstagedStatus: " ",
        summary: "已暂存新增"
      },
      {
        path: "docs/notes.md",
        stagedStatus: "?",
        unstagedStatus: "?",
        summary: "未跟踪文件"
      }
    ]);
  });
});

describe("gitWorkspace write operations", () => {
  it("reports unavailable status for missing or non-git roots", async () => {
    const missingRoot = path.join(tmpdir(), `relaydesk-git-missing-${Date.now()}`);
    const nonGitRoot = await mkdtemp(path.join(tmpdir(), "relaydesk-non-git-"));
    tempDirectories.push(nonGitRoot);

    await expect(readGitStatus(missingRoot)).resolves.toEqual({
      available: false,
      rootPath: missingRoot,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      files: []
    });
    await expect(listGitBranches(missingRoot)).resolves.toEqual([]);

    await expect(readGitStatus(nonGitRoot)).resolves.toEqual({
      available: false,
      rootPath: nonGitRoot,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      files: []
    });
    await expect(listGitBranches(nonGitRoot)).resolves.toEqual([]);
    await expect(listGitRemotes(nonGitRoot)).resolves.toEqual([]);
  });

  it("stages, unstages, and commits tracked file changes", async () => {
    const { repoPath } = await createTempRepository();

    await writeFile(path.join(repoPath, "README.md"), "hello\nupdated\n", "utf8");

    await stageGitFiles(repoPath, ["README.md"]);
    let status = await readGitStatus(repoPath);
    expect(status.files).toEqual([
      expect.objectContaining({
        path: "README.md",
        stagedStatus: "M",
        unstagedStatus: " "
      })
    ]);

    await unstageGitFiles(repoPath, ["README.md"]);
    status = await readGitStatus(repoPath);
    expect(status.files).toEqual([
      expect.objectContaining({
        path: "README.md",
        stagedStatus: " ",
        unstagedStatus: "M"
      })
    ]);

    await stageGitFiles(repoPath, ["README.md"]);
    await commitGitChanges(repoPath, "update readme");

    status = await readGitStatus(repoPath);
    expect(status.dirty).toBe(false);
    expect(status.files).toEqual([]);
  });

  it("lists branches and can create then switch branches", async () => {
    const { repoPath, defaultBranch } = await createTempRepository();

    let branches = await listGitBranches(repoPath);
    expect(branches.some((branch) => branch.name === defaultBranch && branch.current)).toBe(true);

    await checkoutGitBranch({
      rootPath: repoPath,
      branchName: "feature/git-write",
      create: true
    });

    branches = await listGitBranches(repoPath);
    expect(branches.some((branch) => branch.name === "feature/git-write" && branch.current)).toBe(true);

    await checkoutGitBranch({
      rootPath: repoPath,
      branchName: defaultBranch,
      create: false
    });

    branches = await listGitBranches(repoPath);
    expect(branches.some((branch) => branch.name === defaultBranch && branch.current)).toBe(true);
  });

  it("lists remotes and syncs with fetch, pull, and push", async () => {
    const { repoPath, defaultBranch, remotePath, peerPath } = await createTempRepositoryWithRemote();

    expect(await listGitRemotes(repoPath)).toEqual([
      {
        name: "origin",
        fetchUrl: remotePath,
        pushUrl: remotePath
      }
    ]);

    await writeFile(path.join(peerPath, "README.md"), "hello\npeer update\n", "utf8");
    await runGit(["commit", "-am", "peer update"], peerPath);
    await runGit(["push", "origin", defaultBranch], peerPath);

    await fetchGitRemote({ rootPath: repoPath, remoteName: "origin" });
    let status = await readGitStatus(repoPath);
    expect(status.behind).toBe(1);

    await pullGitBranch({
      rootPath: repoPath,
      remoteName: "origin",
      branchName: defaultBranch
    });
    status = await readGitStatus(repoPath);
    expect(status.behind).toBe(0);
    expect(await readFile(path.join(repoPath, "README.md"), "utf8")).toContain("peer update");

    await writeFile(path.join(repoPath, "README.md"), "hello\npeer update\nlocal update\n", "utf8");
    await stageGitFiles(repoPath, ["README.md"]);
    await commitGitChanges(repoPath, "local update");
    await pushGitBranch({
      rootPath: repoPath,
      remoteName: "origin",
      branchName: defaultBranch
    });

    await runGit(["pull", "--ff-only", "origin", defaultBranch], peerPath);
    expect(await readFile(path.join(peerPath, "README.md"), "utf8")).toContain("local update");
  }, 20_000);
});
