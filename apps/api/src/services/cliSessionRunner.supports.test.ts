import { describe, expect, it } from "vitest";
import { LocalCliSessionRunner } from "./cliSessionRunner.js";

describe("LocalCliSessionRunner.supportsImportedSession", () => {
  it("supports Claude/Codex/Gemini imported sessions only", () => {
    const runner = new LocalCliSessionRunner();

    expect(runner.supportsImportedSession("claude")).toBe(true);
    expect(runner.supportsImportedSession("codex")).toBe(true);
    expect(runner.supportsImportedSession("gemini")).toBe(true);

    expect(runner.supportsImportedSession("mock")).toBe(false);
    expect(runner.supportsImportedSession("cursor")).toBe(false);
  });
});
