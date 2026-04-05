import type { FastifyReply } from "fastify";
import type { ApiErrorCode, ApiErrorRecord } from "@shared";

export const ROUTE_CONTRACT_ERRORS = {
  invalidPayload: {
    statusCode: 400,
    message: "Invalid payload",
    errorCode: "INVALID_PAYLOAD" as ApiErrorCode
  },
  invalidProjectId: {
    statusCode: 400,
    message: "Invalid project id",
    errorCode: "INVALID_PROJECT_ID" as ApiErrorCode
  },
  invalidSessionId: {
    statusCode: 400,
    message: "Invalid session id",
    errorCode: "INVALID_SESSION_ID" as ApiErrorCode
  },
  invalidRunId: {
    statusCode: 400,
    message: "Invalid run id",
    errorCode: "INVALID_RUN_ID" as ApiErrorCode
  },
  projectNotFound: {
    statusCode: 404,
    message: "Project not found",
    errorCode: "PROJECT_NOT_FOUND" as ApiErrorCode
  },
  sessionNotFound: {
    statusCode: 404,
    message: "Session not found",
    errorCode: "SESSION_NOT_FOUND" as ApiErrorCode
  },
  runNotFound: {
    statusCode: 404,
    message: "Run not found",
    errorCode: "RUN_NOT_FOUND" as ApiErrorCode
  }
} as const;

export type RouteContractErrorKey = keyof typeof ROUTE_CONTRACT_ERRORS;

export function sendRouteContractError(
  reply: FastifyReply,
  key: RouteContractErrorKey
): ReturnType<FastifyReply["send"]> {
  const error = ROUTE_CONTRACT_ERRORS[key];
  const payload: ApiErrorRecord = { message: error.message, errorCode: error.errorCode };
  return reply.code(error.statusCode).send(payload);
}
