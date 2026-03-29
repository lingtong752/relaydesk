import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  it("preserves line breaks for readable history messages", () => {
    const markup = renderToStaticMarkup(
      <MessageList
        messages={[
          {
            id: "message-1",
            sessionId: "session-1",
            projectId: "project-demo",
            role: "human",
            senderType: "user",
            content: "第一行\n第二行\n\n第三行",
            status: "completed",
            createdAt: "2026-03-28T10:01:00.000Z",
            updatedAt: "2026-03-28T10:01:00.000Z"
          }
        ]}
      />
    );

    expect(markup).toContain("message-text");
    expect(markup).toContain("第一行\n第二行\n\n第三行");
  });

  it("renders fenced code blocks as preformatted sections", () => {
    const markup = renderToStaticMarkup(
      <MessageList
        messages={[
          {
            id: "message-2",
            sessionId: "session-1",
            projectId: "project-demo",
            role: "provider",
            senderType: "provider",
            content: "说明文字\n```bash\nnpm run dev\n```",
            status: "completed",
            createdAt: "2026-03-28T10:02:00.000Z",
            updatedAt: "2026-03-28T10:02:00.000Z"
          }
        ]}
      />
    );

    expect(markup).toContain("message-code-block");
    expect(markup).toContain("message-code-language");
    expect(markup).toContain("npm run dev");
  });
});
