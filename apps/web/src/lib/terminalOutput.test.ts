import { describe, expect, it } from "vitest";
import {
  appendTerminalOutput,
  normalizeTerminalOutput,
  TERMINAL_OUTPUT_TRUNCATION_NOTICE
} from "./terminalOutput";

describe("normalizeTerminalOutput", () => {
  it("removes ANSI styling and OSC metadata from terminal output", () => {
    const rawOutput =
      "\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m\r" +
      "\u001b]2;relaydesk\u0007" +
      "\u001b]7;file:///Users/bytedance/Desktop/llmbot-wechat\u001b\\\r" +
      "bytedance@host ~/Desktop/llmbot-wechat % ";

    expect(normalizeTerminalOutput(rawOutput)).toBe("bytedance@host ~/Desktop/llmbot-wechat % ");
  });

  it("applies carriage-return overwrite semantics", () => {
    expect(normalizeTerminalOutput("hello\rworld")).toBe("world");
  });

  it("keeps new lines while stripping control characters", () => {
    expect(normalizeTerminalOutput("one\r\ntwo\u0007\u001b[32m!\u001b[0m")).toBe("one\ntwo!");
  });

  it("replaces common powerline prompt glyphs with readable ascii text", () => {
    expect(normalizeTerminalOutput("bytedance@host  ~/Desktop/demo   main")).toBe(
      "bytedance@host > ~/Desktop/demo > git: main"
    );
  });
});

describe("appendTerminalOutput", () => {
  it("appends output when below the configured limit", () => {
    expect(appendTerminalOutput("hello", " world", { maxChars: 32, retainChars: 24 })).toBe("hello world");
  });

  it("keeps only the latest output slice once the limit is exceeded", () => {
    expect(appendTerminalOutput("abcd", "efgh", { maxChars: 6, retainChars: 4 })).toBe(
      `${TERMINAL_OUTPUT_TRUNCATION_NOTICE}efgh`
    );
  });

  it("keeps a single truncation notice across repeated trimming", () => {
    const once = appendTerminalOutput("abcd", "efgh", { maxChars: 6, retainChars: 4 });
    const twice = appendTerminalOutput(once, "ijkl", { maxChars: 6, retainChars: 4 });

    expect(twice).toBe(`${TERMINAL_OUTPUT_TRUNCATION_NOTICE}ijkl`);
  });
});
