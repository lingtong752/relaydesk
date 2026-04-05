import type { FastifyReply } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { ROUTE_CONTRACT_ERRORS, sendRouteContractError } from "./routeContracts.js";

describe("routeContracts", () => {
  it("defines stable status and message mappings for shared route errors", () => {
    expect(ROUTE_CONTRACT_ERRORS).toEqual({
      invalidPayload: {
        statusCode: 400,
        message: "Invalid payload",
        errorCode: "INVALID_PAYLOAD"
      },
      invalidProjectId: {
        statusCode: 400,
        message: "Invalid project id",
        errorCode: "INVALID_PROJECT_ID"
      },
      invalidSessionId: {
        statusCode: 400,
        message: "Invalid session id",
        errorCode: "INVALID_SESSION_ID"
      },
      invalidRunId: {
        statusCode: 400,
        message: "Invalid run id",
        errorCode: "INVALID_RUN_ID"
      },
      projectNotFound: {
        statusCode: 404,
        message: "Project not found",
        errorCode: "PROJECT_NOT_FOUND"
      },
      sessionNotFound: {
        statusCode: 404,
        message: "Session not found",
        errorCode: "SESSION_NOT_FOUND"
      },
      runNotFound: {
        statusCode: 404,
        message: "Run not found",
        errorCode: "RUN_NOT_FOUND"
      }
    });
  });

  it("sends the mapped error contract through fastify reply", () => {
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as unknown as FastifyReply;

    sendRouteContractError(reply, "sessionNotFound");

    expect(code).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith({
      message: "Session not found",
      errorCode: "SESSION_NOT_FOUND"
    });
  });
});
