import { describe, expect, it } from "vitest";
import {
  buildApprovalReason,
  buildApprovalTitle,
  buildPendingApprovalMessage,
  buildResumePendingMessage,
  buildTakeoverMessage
} from "./approvalFlow.js";

describe("approvalFlow helpers", () => {
  it("builds a readable approval title from the objective", () => {
    expect(buildApprovalTitle("推进登录模块重构和错误处理收敛")).toContain("是否批准继续执行");
  });

  it("builds approval reason and pending message with sensible fallbacks", () => {
    expect(buildApprovalReason("", "")).toContain("未填写目标");
    expect(buildPendingApprovalMessage("")).toContain("等待人工审批");
  });

  it("builds takeover and resume helper messages", () => {
    expect(buildTakeoverMessage()).toContain("人工接管");
    expect(buildResumePendingMessage("恢复重构流程")).toContain("等待新的人工审批");
  });
});
