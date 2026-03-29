import { describe, expect, it } from "vitest";
import { getLanguageModeKey } from "./editorLanguage";

describe("getLanguageModeKey", () => {
  it("maps common frontend files to CodeMirror language buckets", () => {
    expect(getLanguageModeKey("src/App.tsx")).toBe("javascript");
    expect(getLanguageModeKey("src/styles.css")).toBe("css");
    expect(getLanguageModeKey("docs/README.md")).toBe("markdown");
    expect(getLanguageModeKey("config/schema.json")).toBe("json");
  });

  it("falls back to plain text for unknown extensions", () => {
    expect(getLanguageModeKey("notes/TODO.txt")).toBe("plain");
    expect(getLanguageModeKey("Makefile")).toBe("plain");
  });
});
