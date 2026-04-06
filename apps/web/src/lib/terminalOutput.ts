const ESC = "\u001b";
const DEFAULT_MAX_TERMINAL_OUTPUT_CHARS = 120_000;
const DEFAULT_RETAIN_TERMINAL_OUTPUT_CHARS = 96_000;
export const TERMINAL_OUTPUT_TRUNCATION_NOTICE =
  "[relaydesk] Earlier terminal output has been trimmed to keep this tab responsive.\n";
const PRIVATE_USE_GLYPH_REPLACEMENTS = new Map<string, string>([
  ["\uE0A0", "git:"],
  ["\uE0A1", "branch:"],
  ["\uE0B0", ">"],
  ["\uE0B1", "|"],
  ["\uE0B2", "<"],
  ["\uE0B3", "|"]
]);

function normalizeTerminalGlyphs(text: string): string {
  let normalized = "";

  for (const char of text) {
    const replacement = PRIVATE_USE_GLYPH_REPLACEMENTS.get(char);
    if (replacement) {
      normalized += replacement;
      continue;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint >= 0xe000 && codePoint <= 0xf8ff) {
      continue;
    }

    normalized += char;
  }

  return normalized;
}

function consumeEscapeSequence(input: string, startIndex: number): number {
  const next = input[startIndex + 1];

  if (!next) {
    return input.length;
  }

  if (next === "[") {
    let index = startIndex + 2;
    while (index < input.length) {
      const code = input.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        return index + 1;
      }
      index += 1;
    }

    return input.length;
  }

  if (next === "]" || next === "P" || next === "^" || next === "_") {
    let index = startIndex + 2;
    while (index < input.length) {
      if (input[index] === "\u0007") {
        return index + 1;
      }

      if (input[index] === ESC && input[index + 1] === "\\") {
        return index + 2;
      }

      index += 1;
    }

    return input.length;
  }

  return startIndex + 2;
}

export function normalizeTerminalOutput(rawOutput: string): string {
  const lines: string[] = [];
  let currentLine: string[] = [];
  let cursor = 0;

  for (let index = 0; index < rawOutput.length; ) {
    const current = rawOutput.charAt(index);

    if (current === ESC) {
      index = consumeEscapeSequence(rawOutput, index);
      continue;
    }

    if (current === "\r" && rawOutput[index + 1] === "\n") {
      lines.push(currentLine.join(""));
      currentLine = [];
      cursor = 0;
      index += 2;
      continue;
    }

    if (current === "\n") {
      lines.push(currentLine.join(""));
      currentLine = [];
      cursor = 0;
      index += 1;
      continue;
    }

    if (current === "\r") {
      cursor = 0;
      index += 1;
      continue;
    }

    if (current === "\b") {
      cursor = Math.max(0, cursor - 1);
      index += 1;
      continue;
    }

    const code = rawOutput.charCodeAt(index);
    if ((code >= 0 && code < 0x20 && current !== "\t") || code === 0x7f) {
      index += 1;
      continue;
    }

    if (cursor < currentLine.length) {
      currentLine[cursor] = current;
    } else {
      while (currentLine.length < cursor) {
        currentLine.push(" ");
      }
      currentLine.push(current);
    }

    cursor += 1;
    index += 1;
  }

  lines.push(currentLine.join(""));
  return normalizeTerminalGlyphs(lines.join("\n"));
}

export function appendTerminalOutput(
  currentOutput: string,
  nextOutputChunk: string,
  options: {
    maxChars?: number;
    retainChars?: number;
  } = {}
): string {
  const maxChars = options.maxChars ?? DEFAULT_MAX_TERMINAL_OUTPUT_CHARS;
  const retainChars = Math.min(
    options.retainChars ?? DEFAULT_RETAIN_TERMINAL_OUTPUT_CHARS,
    maxChars
  );
  const hasTruncationNotice = currentOutput.startsWith(TERMINAL_OUTPUT_TRUNCATION_NOTICE);
  const normalizedCurrent = hasTruncationNotice
    ? currentOutput.slice(TERMINAL_OUTPUT_TRUNCATION_NOTICE.length)
    : currentOutput;
  const combined = `${normalizedCurrent}${nextOutputChunk}`;

  if (combined.length <= maxChars) {
    return hasTruncationNotice ? `${TERMINAL_OUTPUT_TRUNCATION_NOTICE}${combined}` : combined;
  }

  return `${TERMINAL_OUTPUT_TRUNCATION_NOTICE}${combined.slice(
    Math.max(0, combined.length - retainChars)
  )}`;
}
