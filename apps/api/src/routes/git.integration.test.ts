import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

const execFileAsync = promisify(execFile);

describe("git routes integration", () => {
  let app: FastifyInstance;
  let tempRoots: string[] = [];
  let repoPath: string;
  let peerPath: string;
  let remotePath: string;
  let defaultBranch: string;

  beforeEach(async () => {
    const repositories = await createRepositoryWithRemote();
    repoPath = repositories.repoPath;
    peerPath = repositories.peerPath;
    remotePath = repositories.remotePath;
    defaultBranch = repositories.defaultBranch;
    tempRoots = repositories.tempRoots;

    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "git-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("lists remotes and syncs the current branch through fetch, pull, and push", async () => {
    const { authHeader, projectId } = await createProjectAndAuth(app, repoPath);

    const remotesResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/git/remotes`,
      headers: authHeader
    });

    expect(remotesResponse.statusCode).toBe(200);
    expect(remotesResponse.json()).toEqual({
      remotes: [
        {
          name: "origin",
          fetchUrl: remotePath,
          pushUrl: remotePath
        }
      ]
    });

    await writeFile(path.join(peerPath, "README.md"), "hello\npeer route update\n", "utf8");
    await runGit(["commit", "-am", "peer route update"], peerPath);
    await runGit(["push", "origin", defaultBranch], peerPath);

    const fetchResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/git/fetch`,
      headers: authHeader,
      payload: {
        remote: "origin"
      }
    });
    expect(fetchResponse.statusCode).toBe(200);

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/git/status`,
      headers: authHeader
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({
          branch: defaultBranch,
          behind: 1
        })
      })
    );

    const pullResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/git/pull`,
      headers: authHeader,
      payload: {
        remote: "origin",
        branch: defaultBranch
      }
    });
    expect(pullResponse.statusCode).toBe(200);
    expect(await readFile(path.join(repoPath, "README.md"), "utf8")).toContain("peer route update");

    await writeFile(path.join(repoPath, "README.md"), "hello\npeer route update\nlocal route update\n", "utf8");
    await runGit(["add", "README.md"], repoPath);
    await runGit(["commit", "-m", "local route update"], repoPath);

    const pushResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/git/push`,
      headers: authHeader,
      payload: {
        remote: "origin",
        branch: defaultBranch
      }
    });
    expect(pushResponse.statusCode).toBe(200);

    await runGit(["pull", "--ff-only", "origin", defaultBranch], peerPath);
    expect(await readFile(path.join(peerPath, "README.md"), "utf8")).toContain("local route update");
  }, 20_000);
});

async function createRepositoryWithRemote(): Promise<{
  repoPath: string;
  peerPath: string;
  remotePath: string;
  defaultBranch: string;
  tempRoots: string[];
}> {
  const tempRoots: string[] = [];
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "relaydesk-git-route-local-"));
  tempRoots.push(repoPath);

  await runGit(["init"], repoPath);
  await runGit(["config", "user.name", "RelayDesk Test"], repoPath);
  await runGit(["config", "user.email", "relaydesk@example.com"], repoPath);
  await writeFile(path.join(repoPath, "README.md"), "hello\n", "utf8");
  await runGit(["add", "README.md"], repoPath);
  await runGit(["commit", "-m", "init"], repoPath);

  const currentBranch = await execFileAsync("git", ["branch", "--show-current"], { cwd: repoPath });
  const defaultBranch = currentBranch.stdout.trim() || "main";

  const remotePath = await mkdtemp(path.join(os.tmpdir(), "relaydesk-git-route-remote-"));
  tempRoots.push(remotePath);
  await runGit(["init", "--bare"], remotePath);
  await runGit(["remote", "add", "origin", remotePath], repoPath);
  await runGit(["push", "-u", "origin", defaultBranch], repoPath);
  await runGit(["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`], remotePath);

  const peerParentPath = await mkdtemp(path.join(os.tmpdir(), "relaydesk-git-route-peer-"));
  tempRoots.push(peerParentPath);
  const peerPath = path.join(peerParentPath, "repo");
  await execFileAsync("git", ["clone", remotePath, peerPath]);
  await runGit(["config", "user.name", "RelayDesk Test"], peerPath);
  await runGit(["config", "user.email", "relaydesk@example.com"], peerPath);

  return { repoPath, peerPath, remotePath, defaultBranch, tempRoots };
}

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "git@example.com",
      password: "password123"
    }
  });

  const body = response.json() as { token: string };
  return {
    authorization: `Bearer ${body.token}`
  };
}

async function createProjectAndAuth(
  app: FastifyInstance,
  rootPath: string
): Promise<{ authHeader: { authorization: string }; projectId: string }> {
  const authHeader = await registerAndAuthenticate(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: authHeader,
    payload: {
      name: "git-workspace",
      rootPath
    }
  });

  const body = response.json() as { project: { id: string } };
  return {
    authHeader,
    projectId: body.project.id
  };
}

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
