import { describe, expect, it } from "vitest";
import { normalizeTerminalOutput } from "./terminalOutput";

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
