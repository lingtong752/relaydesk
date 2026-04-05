import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("api request headers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits the JSON content-type header when posting without a body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);

    await api.stopSession("token-demo", "session-demo");

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: "POST"
    });
    expect(init?.headers).toEqual({
      Authorization: "Bearer token-demo"
    });
    expect(init?.body).toBeUndefined();
  });

  it("sets the JSON content-type header when a body is present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ project: { id: "project-demo" } })
    } as Response);

    await api.createProject("token-demo", { name: "Demo", rootPath: "" });

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token-demo"
    });
    expect(init?.body).toBe(JSON.stringify({ name: "Demo", rootPath: "" }));
  });

  it("exposes api errorCode on request failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        message: "Invalid project id",
        errorCode: "INVALID_PROJECT_ID"
      })
    } as Response);

    await expect(api.getMessages("token-demo", "session-demo")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiRequestError",
        statusCode: 400,
        message: "Invalid project id",
        errorCode: "INVALID_PROJECT_ID"
      })
    );
  });
});
