export function canSubmitMessageDraft(input: {
  disabled: boolean;
  messageDraft: string;
}): boolean {
  return !input.disabled && input.messageDraft.trim().length > 0;
}

export function shouldSubmitMessageComposerOnEnter(input: {
  key: string;
  shiftKey: boolean;
  disabled: boolean;
  messageDraft: string;
}): boolean {
  if (input.key !== "Enter") {
    return false;
  }

  if (input.shiftKey) {
    return false;
  }

  return canSubmitMessageDraft({
    disabled: input.disabled,
    messageDraft: input.messageDraft
  });
}
