interface MessageContentProps {
  content: string;
}

interface MessageSegment {
  type: "text" | "code";
  value: string;
  language?: string;
}

const CODE_BLOCK_PATTERN = /```([^\n`]*)\n?([\s\S]*?)```/g;

function trimSurroundingBlankLines(value: string): string {
  return value.replace(/^\n+|\n+$/g, "");
}

function parseMessageContent(content: string): MessageSegment[] {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of normalizedContent.matchAll(CODE_BLOCK_PATTERN)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;
    const language = match[1]?.trim();
    const code = match[2] ?? "";
    const leadingText = trimSurroundingBlankLines(normalizedContent.slice(lastIndex, matchIndex));

    if (leadingText.trim()) {
      segments.push({
        type: "text",
        value: leadingText
      });
    }

    segments.push({
      type: "code",
      value: code.replace(/\n$/, ""),
      language
    });
    lastIndex = matchIndex + matchedText.length;
  }

  const trailingText = trimSurroundingBlankLines(normalizedContent.slice(lastIndex));
  if (trailingText.trim()) {
    segments.push({
      type: "text",
      value: trailingText
    });
  }

  if (segments.length === 0 && normalizedContent.trim()) {
    segments.push({
      type: "text",
      value: normalizedContent
    });
  }

  return segments;
}

export function MessageContent({ content }: MessageContentProps): JSX.Element | null {
  const segments = parseMessageContent(content);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="message-content">
      {segments.map((segment, index) =>
        segment.type === "code" ? (
          <section className="message-code-shell" key={`code-${index}`}>
            {segment.language ? <span className="message-code-language">{segment.language}</span> : null}
            <pre className="message-code-block">
              <code>{segment.value}</code>
            </pre>
          </section>
        ) : (
          <p className="message-text" key={`text-${index}`}>
            {segment.value}
          </p>
        )
      )}
    </div>
  );
}
