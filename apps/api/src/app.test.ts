import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { createInMemoryDatabase } from "./testUtils/inMemoryDatabase.js";

describe("app CORS", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "integration-secret",
      webOrigin: "http://127.0.0.1:5173",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows localhost aliases for loopback origins during preflight", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not allow unrelated origins", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "https://example.com"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
