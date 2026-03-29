import { describe, expect, it } from "vitest";
import { getAuthEnv, getDatabaseEnv } from "./env.js";

describe("env helpers", () => {
  it("validates database settings only when requested", () => {
    expect(() => getDatabaseEnv({})).toThrow();
    expect(
      getDatabaseEnv({
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        MONGODB_DB: "relaydesk"
      })
    ).toEqual({
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_DB: "relaydesk"
    });
  });

  it("validates auth settings only when requested", () => {
    expect(() => getAuthEnv({})).toThrow();
    expect(
      getAuthEnv({
        JWT_SECRET: "integration-secret"
      })
    ).toEqual({
      JWT_SECRET: "integration-secret"
    });
  });
});
