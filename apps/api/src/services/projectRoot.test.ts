import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_ROOT,
  LEGACY_DEMO_ROOT_PATH,
  normalizeRequestedProjectRootPath,
  resolveProjectRootPath
} from "./projectRoot.js";

describe("normalizeRequestedProjectRootPath", () => {
  it("falls back to the current working directory when the input is blank", () => {
    expect(normalizeRequestedProjectRootPath("   ")).toBe(DEFAULT_PROJECT_ROOT);
  });
});

describe("resolveProjectRootPath", () => {
  it("falls back from the legacy placeholder path when it does not exist", async () => {
    await expect(resolveProjectRootPath(LEGACY_DEMO_ROOT_PATH)).resolves.toBe(DEFAULT_PROJECT_ROOT);
  });

  it("preserves an existing non-placeholder path", async () => {
    await expect(resolveProjectRootPath(DEFAULT_PROJECT_ROOT)).resolves.toBe(DEFAULT_PROJECT_ROOT);
  });
});
