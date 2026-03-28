import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitChangedFileRecord, GitDiffRecord, GitStatusRecord } from "@shared";
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
      path: rawPath,
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

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 2 * 1024 * 1024
    });
    return stdout;
  } catch (error) {
    const gitError = error as { code?: number | string; stderr?: string };
    const stderr = gitError.stderr ?? "";

    if (
      stderr.includes("not a git repository") ||
      stderr.includes("unsafe repository") ||
      gitError.code === 128
    ) {
      throw new GitWorkspaceError(404, "Project root is not a Git repository");
    }

    throw new GitWorkspaceError(500, "Failed to run git command");
  }
}

export async function readGitStatus(rootPath: string): Promise<GitStatusRecord> {
  await runGit(["rev-parse", "--is-inside-work-tree"], rootPath);
  const output = await runGit(["status", "--porcelain=v1", "--branch"], rootPath);
  return parseGitStatusOutput(output, rootPath);
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
