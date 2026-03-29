import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("auth routes validation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "integration-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a helpful message when email is invalid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "admin",
        password: "password123"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "请输入有效邮箱地址" });
  });

  it("returns a helpful message when password is too short", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "12345"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "密码至少 6 位" });
  });
});
