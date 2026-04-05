import { describe, expect, it } from "vitest";
import {
  canSubmitMessageDraft,
  shouldSubmitMessageComposerOnEnter
} from "./utils";

describe("messageComposer utils", () => {
  it("validates when a draft can be submitted", () => {
    expect(canSubmitMessageDraft({ disabled: false, messageDraft: "hello" })).toBe(true);
    expect(canSubmitMessageDraft({ disabled: false, messageDraft: "   " })).toBe(false);
    expect(canSubmitMessageDraft({ disabled: true, messageDraft: "hello" })).toBe(false);
  });

  it("submits only on Enter without Shift and with a valid draft", () => {
    expect(
      shouldSubmitMessageComposerOnEnter({
        key: "Enter",
        shiftKey: false,
        disabled: false,
        messageDraft: "hello"
      })
    ).toBe(true);

    expect(
      shouldSubmitMessageComposerOnEnter({
        key: "Enter",
        shiftKey: true,
        disabled: false,
        messageDraft: "hello"
      })
    ).toBe(false);

    expect(
      shouldSubmitMessageComposerOnEnter({
        key: "Escape",
        shiftKey: false,
        disabled: false,
        messageDraft: "hello"
      })
    ).toBe(false);
  });
});
