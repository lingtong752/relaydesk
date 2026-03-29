import { describe, expect, it } from "vitest";
import { normalizeEmail, validateCredentials } from "./authValidation";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  demo@example.com  ")).toBe("demo@example.com");
  });
});

describe("validateCredentials", () => {
  it("requires a valid email address", () => {
    expect(validateCredentials("admin", "password123")).toBe("请输入有效邮箱地址");
  });

  it("requires a password with at least six characters", () => {
    expect(validateCredentials("admin@example.com", "12345")).toBe("密码至少 6 位");
  });

  it("accepts a valid credential pair", () => {
    expect(validateCredentials("admin@example.com", "password123")).toBeNull();
  });
});
