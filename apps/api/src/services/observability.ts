import type { FastifyReply, FastifyRequest } from "fastify";

export const CORRELATION_ID_HEADER = "x-correlation-id";

export function resolveCorrelationId(request: FastifyRequest): string {
  const headerValue = request.headers[CORRELATION_ID_HEADER];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }

  return request.id;
}

export function applyCorrelationIdHeader(request: FastifyRequest, reply: FastifyReply): void {
  reply.header(CORRELATION_ID_HEADER, resolveCorrelationId(request));
}

export function logWithCorrelation(
  request: FastifyRequest,
  message: string,
  payload: Record<string, unknown>
): void {
  request.log.info(
    {
      correlationId: resolveCorrelationId(request),
      ...payload
    },
    message
  );
}
