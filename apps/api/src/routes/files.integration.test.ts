import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("file routes integration", () => {
  let app: FastifyInstance;
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "relaydesk-files-route-"));
    await mkdir(path.join(workspaceRoot, "src", "features"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "src", "features", "TerminalWorkspace.tsx"), "terminal", "utf8");
    await writeFile(path.join(workspaceRoot, "src", "features", "FileWorkspace.tsx"), "files", "utf8");

    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "files-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("searches workspace files across nested paths", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "files-demo",
        rootPath: workspaceRoot
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/files/search?query=workspace`,
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      entries: [
        expect.objectContaining({ path: "src/features/FileWorkspace.tsx" }),
        expect.objectContaining({ path: "src/features/TerminalWorkspace.tsx" })
      ]
    });
  });
});

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "files@example.com",
      password: "password123"
    }
  });

  const body = response.json() as { token: string };
  return {
    authorization: `Bearer ${body.token}`
  };
}
