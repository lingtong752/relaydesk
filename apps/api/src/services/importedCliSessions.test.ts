import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { SessionDoc } from "../db.js";
import { loadImportedCliMessages } from "./importedCliSessions.js";

const tempDirectories: string[] = [];

async function createTempFile(name: string, content: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "relaydesk-imported-cli-"));
  tempDirectories.push(directory);
  const filePath = path.join(directory, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function createImportedSession(sourcePath: string): SessionDoc {
  const now = new Date("2026-03-28T10:00:00.000Z");

  return {
    _id: new ObjectId("65f4c7f1dbe43b0d4a120001"),
    projectId: new ObjectId("65f4c7f1dbe43b0d4a120002"),
    provider: "codex",
    title: "Imported CLI session",
    origin: "imported_cli",
    externalSessionId: "session-demo",
    sourcePath,
    status: "idle",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  };
}

describe("loadImportedCliMessages", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("preserves line breaks and paragraph structure for imported codex history", async () => {
    const sourcePath = await createTempFile(
      "session.jsonl",
      [
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-03-28T10:01:00.000Z",
          payload: {
            type: "user_message",
            message: "第一行\n第二行\n\n第三行"
          }
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-03-28T10:02:00.000Z",
          payload: {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "Base directory for this skill:\n/Users/demo/.codex/skills/example"
              },
              {
                type: "output_text",
                text: "```bash\nnpm run dev\n```"
              }
            ]
          }
        })
      ].join("\n")
    );

    const messages = await loadImportedCliMessages(createImportedSession(sourcePath));

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe("第一行\n第二行\n\n第三行");
    expect(messages[1]?.content).toBe(
      "Base directory for this skill:\n/Users/demo/.codex/skills/example\n\n```bash\nnpm run dev\n```"
    );
  });
});
