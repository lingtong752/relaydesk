import os from "node:os";
import path from "node:path";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureExecutablePermissions,
  resetNodePtyRuntimeForTests,
  TerminalManager
} from "./terminalManager.js";

describe("ensureExecutablePermissions", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (!tempDir) {
      return;
    }

    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("adds execute permissions when the helper exists but is not executable", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "relaydesk-terminal-"));
    const helperPath = path.join(tempDir, "spawn-helper");

    await writeFile(helperPath, "helper");
    await chmod(helperPath, 0o644);

    await ensureExecutablePermissions(helperPath);

    const helperStats = await stat(helperPath);
    expect(helperStats.mode & 0o111).toBe(0o111);
  });

  it("ignores missing helper paths", async () => {
    await expect(
      ensureExecutablePermissions(path.join(os.tmpdir(), `relaydesk-missing-helper-${Date.now()}`))
    ).resolves.toBeUndefined();
  });
});

describe("TerminalManager node-pty runtime", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    vi.doUnmock("node-pty");
    resetNodePtyRuntimeForTests();

    if (!tempDir) {
      return;
    }

    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("surfaces a clear error when node-pty is unavailable", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "relaydesk-terminal-runtime-"));

    vi.doMock("node-pty", () => {
      throw new Error("native addon unavailable");
    });
    resetNodePtyRuntimeForTests();

    const manager = new TerminalManager();

    await expect(
      manager.createSession({
        ownerId: "user-1",
        projectId: "project-1",
        cwd: tempDir
      })
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 500,
        message: expect.stringContaining("Terminal support is unavailable on this host")
      })
    );
  });
});
