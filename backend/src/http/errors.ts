import type { FastifyInstance } from "fastify";
import { Failure } from "../platform/failure.js";

function describeError(statusCode: number) {
  switch (statusCode) {
    case 400:
      return { code: "VALIDATION_FAILED", message: "Request validation failed." };
    case 404:
      return { code: "NOT_FOUND", message: "Route not found." };
    case 413:
      return { code: "PAYLOAD_TOO_LARGE", message: "Request payload is too large." };
    case 415:
      return { code: "UNSUPPORTED_MEDIA_TYPE", message: "Request content type is not supported." };
    case 429:
      return { code: "RATE_LIMITED", message: "Too many requests." };
    default:
      return statusCode >= 500
        ? { code: "INTERNAL_ERROR", message: "An unexpected error occurred." }
        : { code: "REQUEST_FAILED", message: "The request could not be completed." };
  }
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ ...describeError(404), requestId: request.id });
  });

  app.setErrorHandler((error, request, reply) => {
    const reportedStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    const statusCode =
      typeof reportedStatus === "number" &&
      Number.isInteger(reportedStatus) &&
      reportedStatus >= 400 &&
      reportedStatus <= 599
        ? reportedStatus
        : 500;

    if (statusCode >= 500) {
      request.log.error({ event: "request_failed", requestId: request.id, statusCode });
    } else request.log.warn({ event: "request_rejected", requestId: request.id, statusCode });

    return reply.code(statusCode).send({
      ...(error instanceof Failure ? { code: error.code, message: error.message } : describeError(statusCode)),
      requestId: request.id,
    });
  });
}
