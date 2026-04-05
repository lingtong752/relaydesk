import type { FastifyReply } from "fastify";

export const ROUTE_CONTRACT_ERRORS = {
  invalidPayload: {
    statusCode: 400,
    message: "Invalid payload"
  },
  invalidProjectId: {
    statusCode: 400,
    message: "Invalid project id"
  },
  invalidSessionId: {
    statusCode: 400,
    message: "Invalid session id"
  },
  projectNotFound: {
    statusCode: 404,
    message: "Project not found"
  },
  sessionNotFound: {
    statusCode: 404,
    message: "Session not found"
  }
} as const;

export type RouteContractErrorKey = keyof typeof ROUTE_CONTRACT_ERRORS;

export function sendRouteContractError(
  reply: FastifyReply,
  key: RouteContractErrorKey
): ReturnType<FastifyReply["send"]> {
  const error = ROUTE_CONTRACT_ERRORS[key];
  return reply.code(error.statusCode).send({ message: error.message });
}
