import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import type {
  GitBranchRecord,
  GitChangedFileRecord,
  GitDiffRecord,
  GitRemoteRecord,
  GitStatusRecord
} from "@shared";
import { normalizeRelativePath } from "./workspaceFiles.js";

const execFileAsync = promisify(execFile);

export class GitWorkspaceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

interface ParsedBranchInfo {
  branch: string | null;
  ahead: number;
  behind: number;
}

interface GitCommandErrorContext {
  code?: number | string;
  stdout: string;
  stderr: string;
}

type GitErrorMapper = (context: GitCommandErrorContext) => GitWorkspaceError | null;

function parseBranchHeader(line: string): ParsedBranchInfo {
  const normalized = line.replace(/^##\s*/, "").trim();

  if (!normalized || normalized === "HEAD (no branch)") {
    return { branch: null, ahead: 0, behind: 0 };
  }

  const [branchPart, trackingPart] = normalized.split("...");
  const match = trackingPart?.match(/\[(.+)\]/);
  const flags = match?.[1] ?? "";
  const aheadMatch = flags.match(/ahead (\d+)/);
  const behindMatch = flags.match(/behind (\d+)/);

  return {
    branch: branchPart?.trim() ?? null,
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0
  };
}

function describeStatus(stagedStatus: string, unstagedStatus: string): string {
  if (stagedStatus === "?" && unstagedStatus === "?") {
    return "未跟踪文件";
  }

  if (stagedStatus === "A") {
    return "已暂存新增";
  }

  if (stagedStatus === "M" && unstagedStatus === " ") {
    return "已暂存修改";
  }

  if (stagedStatus === " " && unstagedStatus === "M") {
    return "未暂存修改";
  }

  if (stagedStatus === "D" || unstagedStatus === "D") {
    return "删除";
  }

  if (stagedStatus === "R" || unstagedStatus === "R") {
    return "重命名";
  }

  if (stagedStatus === "C" || unstagedStatus === "C") {
    return "复制";
  }

  if (stagedStatus === "U" || unstagedStatus === "U") {
    return "冲突";
  }

  if (stagedStatus === "M" && unstagedStatus === "M") {
    return "已暂存且未暂存修改";
  }

  return "有变更";
}

function parseChangedFilePath(
  rawPath: string,
  stagedStatus: string,
  unstagedStatus: string
): string {
  const normalizedPath = rawPath.trim();
  if (
    (stagedStatus === "R" || stagedStatus === "C" || unstagedStatus === "R" || unstagedStatus === "C") &&
    normalizedPath.includes(" -> ")
  ) {
    return normalizedPath.split(" -> ").at(-1)?.trim() ?? normalizedPath;
  }

  return normalizedPath;
}

function hasStagedChanges(file: GitChangedFileRecord): boolean {
  return file.stagedStatus !== " " && file.stagedStatus !== "?";
}

function normalizeGitPaths(paths: string[]): string[] {
  const normalizedPaths = [...new Set(paths.map((path) => normalizeRelativePath(path)).filter(Boolean))];
  if (normalizedPaths.length === 0) {
    throw new GitWorkspaceError(400, "At least one file path is required");
  }

  return normalizedPaths;
}

function normalizeCommitMessage(message: string): string {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new GitWorkspaceError(400, "Commit message is required");
  }

  return normalizedMessage;
}

function normalizeRemoteName(remoteName: string): string {
  const normalizedRemoteName = remoteName.trim();
  if (!normalizedRemoteName) {
    throw new GitWorkspaceError(400, "Remote name is required");
  }

  return normalizedRemoteName;
}

function createUnavailableGitStatus(rootPath: string): GitStatusRecord {
  return {
    available: false,
    rootPath,
    branch: null,
    ahead: 0,
    behind: 0,
    dirty: false,
    files: []
  };
}

async function ensureRootPathExists(rootPath: string): Promise<void> {
  try {
    await access(rootPath);
  } catch {
    throw new GitWorkspaceError(404, "Workspace path not found");
  }
}

export function parseGitStatusOutput(output: string, rootPath: string): GitStatusRecord {
  const lines = output.split("\n").filter(Boolean);
  const branchInfo = lines[0]?.startsWith("##")
    ? parseBranchHeader(lines[0])
    : { branch: null, ahead: 0, behind: 0 };

  const fileLines = lines[0]?.startsWith("##") ? lines.slice(1) : lines;
  const files = fileLines.map((line) => {
    const stagedStatus = line[0] ?? " ";
    const unstagedStatus = line[1] ?? " ";
    const rawPath = line.slice(3).trim();
    return {
      path: parseChangedFilePath(rawPath, stagedStatus, unstagedStatus),
      stagedStatus,
      unstagedStatus,
      summary: describeStatus(stagedStatus, unstagedStatus)
    } satisfies GitChangedFileRecord;
  });

  return {
    available: true,
    rootPath,
    branch: branchInfo.branch,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    dirty: files.length > 0,
    files
  };
}

async function runGit(
  args: string[],
  cwd: string,
  options: {
    defaultMessage?: string;
    mapError?: GitErrorMapper;
  } = {}
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 2 * 1024 * 1024
    });
    return stdout;
  } catch (error) {
    const gitError = error as { code?: number | string; stdout?: string; stderr?: string };
    const context: GitCommandErrorContext = {
      code: gitError.code,
      stdout: gitError.stdout ?? "",
      stderr: gitError.stderr ?? ""
    };
    const stderr = context.stderr;

    if (
      stderr.includes("not a git repository") ||
      stderr.includes("unsafe repository")
    ) {
      throw new GitWorkspaceError(404, "Project root is not a Git repository");
    }

    const mappedError = options.mapError?.(context);
    if (mappedError) {
      throw mappedError;
    }

    throw new GitWorkspaceError(500, options.defaultMessage ?? "Failed to run git command");
  }
}

async function validateBranchName(rootPath: string, branchName: string): Promise<string> {
  const normalizedBranchName = branchName.trim();
  if (!normalizedBranchName) {
    throw new GitWorkspaceError(400, "Branch name is required");
  }

  await runGit(["check-ref-format", "--branch", normalizedBranchName], rootPath, {
    defaultMessage: "Invalid branch name",
    mapError: () => new GitWorkspaceError(400, "Invalid branch name")
  });

  return normalizedBranchName;
}

export async function readGitStatus(rootPath: string): Promise<GitStatusRecord> {
  try {
    await ensureRootPathExists(rootPath);
    await runGit(["rev-parse", "--is-inside-work-tree"], rootPath);
    const output = await runGit(["status", "--porcelain=v1", "--branch"], rootPath);
    return parseGitStatusOutput(output, rootPath);
  } catch (error) {
    if (error instanceof GitWorkspaceError && error.statusCode === 404) {
      return createUnavailableGitStatus(rootPath);
    }

    throw error;
  }
}

export async function listGitBranches(rootPath: string): Promise<GitBranchRecord[]> {
  try {
    await ensureRootPathExists(rootPath);
    await runGit(["rev-parse", "--is-inside-work-tree"], rootPath);
    const output = await runGit(["branch", "--list", "--format=%(refname:short)|%(HEAD)"], rootPath);

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, currentMarker] = line.split("|");
        return {
          name: (name ?? "").trim(),
          current: currentMarker?.trim() === "*"
        } satisfies GitBranchRecord;
      });
  } catch (error) {
    if (error instanceof GitWorkspaceError && error.statusCode === 404) {
      return [];
    }

    throw error;
  }
}

export async function listGitRemotes(rootPath: string): Promise<GitRemoteRecord[]> {
  try {
    await ensureRootPathExists(rootPath);
    await runGit(["rev-parse", "--is-inside-work-tree"], rootPath);
    const output = await runGit(["remote", "-v"], rootPath);
    const remotes = new Map<string, GitRemoteRecord>();

    for (const line of output.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
      const match = line.match(/^([^\s]+)\s+(.+)\s+\((fetch|push)\)$/);
      if (!match) {
        continue;
      }

      const name = match[1]?.trim();
      const url = match[2]?.trim();
      const direction = match[3];
      if (!name || !url || (direction !== "fetch" && direction !== "push")) {
        continue;
      }
      const existing = remotes.get(name) ?? {
        name,
        fetchUrl: null,
        pushUrl: null
      };
      if (direction === "fetch") {
        existing.fetchUrl = url;
      } else {
        existing.pushUrl = url;
      }
      remotes.set(name, existing);
    }

    return Array.from(remotes.values());
  } catch (error) {
    if (error instanceof GitWorkspaceError && error.statusCode === 404) {
      return [];
    }

    throw error;
  }
}

async function validateRemoteName(rootPath: string, remoteName: string): Promise<string> {
  const normalizedRemoteName = normalizeRemoteName(remoteName);
  await runGit(["rev-parse", "--is-inside-work-tree"], rootPath);
  const remotes = await listGitRemotes(rootPath);
  if (!remotes.some((remote) => remote.name === normalizedRemoteName)) {
    throw new GitWorkspaceError(404, "Remote not found");
  }

  return normalizedRemoteName;
}

export async function readGitDiff(
  rootPath: string,
  filePath: string
): Promise<GitDiffRecord> {
  const normalizedPath = normalizeRelativePath(filePath);
  if (!normalizedPath) {
    throw new GitWorkspaceError(400, "File path is required");
  }

  const status = await readGitStatus(rootPath);
  if (!status.available) {
    return {
      available: false,
      path: normalizedPath,
      diff: "",
      isUntracked: false
    };
  }

  const file = status.files.find((entry) => entry.path === normalizedPath);
  if (!file) {
    return {
      available: true,
      path: normalizedPath,
      diff: "",
      isUntracked: false,
      notice: "当前文件没有 Git 变更。"
    };
  }

  if (file.stagedStatus === "?" && file.unstagedStatus === "?") {
    return {
      available: true,
      path: normalizedPath,
      diff: "",
      isUntracked: true,
      notice: "未跟踪文件暂不展示 diff，可先纳入版本控制。"
    };
  }

  const [unstagedDiff, stagedDiff] = await Promise.all([
    runGit(["diff", "--", normalizedPath], rootPath),
    runGit(["diff", "--cached", "--", normalizedPath], rootPath)
  ]);

  const sections: string[] = [];
  if (stagedDiff.trim()) {
    sections.push(stagedDiff.trim());
  }
  if (unstagedDiff.trim()) {
    sections.push(unstagedDiff.trim());
  }

  return {
    available: true,
    path: normalizedPath,
    diff: sections.join("\n\n"),
    isUntracked: false,
    notice: sections.length === 0 ? "当前文件没有可展示的 diff。" : undefined
  };
}

export async function stageGitFiles(rootPath: string, filePaths: string[]): Promise<void> {
  await ensureRootPathExists(rootPath);
  const normalizedPaths = normalizeGitPaths(filePaths);
  await runGit(["add", "--", ...normalizedPaths], rootPath, {
    defaultMessage: "Failed to stage Git changes",
    mapError: ({ stderr }) => {
      if (stderr.includes("pathspec")) {
        return new GitWorkspaceError(404, "Some files could not be staged");
      }

      return null;
    }
  });
}

export async function unstageGitFiles(rootPath: string, filePaths: string[]): Promise<void> {
  await ensureRootPathExists(rootPath);
  const normalizedPaths = normalizeGitPaths(filePaths);
  await runGit(["restore", "--staged", "--", ...normalizedPaths], rootPath, {
    defaultMessage: "Failed to unstage Git changes",
    mapError: ({ stderr }) => {
      if (stderr.includes("pathspec")) {
        return new GitWorkspaceError(404, "Some files could not be unstaged");
      }

      return null;
    }
  });
}

export async function commitGitChanges(rootPath: string, message: string): Promise<void> {
  await ensureRootPathExists(rootPath);
  const normalizedMessage = normalizeCommitMessage(message);
  const status = await readGitStatus(rootPath);
  if (!status.files.some(hasStagedChanges)) {
    throw new GitWorkspaceError(409, "No staged changes to commit");
  }

  await runGit(["commit", "-m", normalizedMessage], rootPath, {
    defaultMessage: "Failed to commit Git changes",
    mapError: ({ stdout, stderr }) => {
      const combinedOutput = `${stdout}\n${stderr}`;
      if (combinedOutput.includes("nothing to commit")) {
        return new GitWorkspaceError(409, "No staged changes to commit");
      }

      if (combinedOutput.includes("Please tell me who you are")) {
        return new GitWorkspaceError(
          409,
          "Git user.name and user.email must be configured before committing"
        );
      }

      if (combinedOutput.includes("Committing is not possible because you have unmerged files")) {
        return new GitWorkspaceError(409, "Resolve merge conflicts before committing");
      }

      return null;
    }
  });
}

export async function checkoutGitBranch(input: {
  rootPath: string;
  branchName: string;
  create: boolean;
}): Promise<void> {
  await ensureRootPathExists(input.rootPath);
  const normalizedBranchName = await validateBranchName(input.rootPath, input.branchName);
  const args = input.create
    ? ["checkout", "-b", normalizedBranchName]
    : ["checkout", normalizedBranchName];

  await runGit(args, input.rootPath, {
    defaultMessage: input.create ? "Failed to create branch" : "Failed to switch branch",
    mapError: ({ stderr }) => {
      if (stderr.includes("already exists")) {
        return new GitWorkspaceError(409, "Branch already exists");
      }

      if (
        stderr.includes("did not match any file(s) known to git") ||
        stderr.includes("pathspec") ||
        stderr.includes("not found")
      ) {
        return new GitWorkspaceError(404, "Branch not found");
      }

      if (
        stderr.includes("Please commit your changes or stash them") ||
        stderr.includes("Your local changes to the following files would be overwritten")
      ) {
        return new GitWorkspaceError(
          409,
          "Commit or stash local changes before switching branches"
        );
      }

      return null;
    }
  });
}

export async function fetchGitRemote(input: {
  rootPath: string;
  remoteName: string;
}): Promise<void> {
  await ensureRootPathExists(input.rootPath);
  const normalizedRemoteName = await validateRemoteName(input.rootPath, input.remoteName);

  await runGit(["fetch", "--prune", normalizedRemoteName], input.rootPath, {
    defaultMessage: "Failed to fetch Git remote",
    mapError: ({ stderr }) => {
      if (
        stderr.includes("No such remote") ||
        stderr.includes("does not appear to be a git repository")
      ) {
        return new GitWorkspaceError(404, "Remote not found");
      }

      return null;
    }
  });
}

export async function pullGitBranch(input: {
  rootPath: string;
  remoteName: string;
  branchName: string;
}): Promise<void> {
  await ensureRootPathExists(input.rootPath);
  const normalizedRemoteName = await validateRemoteName(input.rootPath, input.remoteName);
  const normalizedBranchName = await validateBranchName(input.rootPath, input.branchName);

  await runGit(["pull", "--ff-only", normalizedRemoteName, normalizedBranchName], input.rootPath, {
    defaultMessage: "Failed to pull Git changes",
    mapError: ({ stdout, stderr }) => {
      const combinedOutput = `${stdout}\n${stderr}`;

      if (
        combinedOutput.includes("No such remote") ||
        combinedOutput.includes("does not appear to be a git repository")
      ) {
        return new GitWorkspaceError(404, "Remote not found");
      }

      if (combinedOutput.includes("Couldn't find remote ref")) {
        return new GitWorkspaceError(404, "Remote branch not found");
      }

      if (
        combinedOutput.includes("Please commit your changes or stash them") ||
        combinedOutput.includes("Your local changes to the following files would be overwritten")
      ) {
        return new GitWorkspaceError(409, "Commit or stash local changes before pulling");
      }

      if (
        combinedOutput.includes("Not possible to fast-forward") ||
        combinedOutput.includes("divergent branches")
      ) {
        return new GitWorkspaceError(409, "Pull requires manual merge or rebase");
      }

      if (combinedOutput.includes("unmerged files")) {
        return new GitWorkspaceError(409, "Resolve merge conflicts before pulling");
      }

      return null;
    }
  });
}

export async function pushGitBranch(input: {
  rootPath: string;
  remoteName: string;
  branchName: string;
}): Promise<void> {
  await ensureRootPathExists(input.rootPath);
  const normalizedRemoteName = await validateRemoteName(input.rootPath, input.remoteName);
  const normalizedBranchName = await validateBranchName(input.rootPath, input.branchName);

  await runGit(["push", normalizedRemoteName, normalizedBranchName], input.rootPath, {
    defaultMessage: "Failed to push Git changes",
    mapError: ({ stdout, stderr }) => {
      const combinedOutput = `${stdout}\n${stderr}`;

      if (
        combinedOutput.includes("No such remote") ||
        combinedOutput.includes("does not appear to be a git repository")
      ) {
        return new GitWorkspaceError(404, "Remote not found");
      }

      if (combinedOutput.includes("src refspec") && combinedOutput.includes("does not match any")) {
        return new GitWorkspaceError(404, "Branch not found");
      }

      if (
        combinedOutput.includes("non-fast-forward") ||
        combinedOutput.includes("[rejected]") ||
        combinedOutput.includes("failed to push some refs")
      ) {
        return new GitWorkspaceError(
          409,
          "Remote contains newer commits; pull the latest changes before pushing"
        );
      }

      return null;
    }
  });
}
