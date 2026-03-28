import { describe, expect, it } from "vitest";
import { parseGitStatusOutput } from "./gitWorkspace.js";

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
