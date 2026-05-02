import { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return Response.json(body, { status });
}

export function fromHttpError(err: HttpError): Response {
  return errorResponse(err.status, err.code, err.message, err.details);
}

export function fromZodError(err: ZodError, message = "Invalid request"): Response {
  return errorResponse(400, "validation_failed", message, err.flatten());
}

export function fromUnknown(err: unknown): Response {
  if (err instanceof HttpError) return fromHttpError(err);
  if (err instanceof ZodError) return fromZodError(err);
  const message = err instanceof Error ? err.message : "Internal error";
  return errorResponse(500, "internal_error", message);
}

export const notFound = (resource = "Resource") =>
  errorResponse(404, "not_found", `${resource} not found`);

export const unauthorized = () =>
  errorResponse(401, "unauthorized", "Authentication required");

export const forbidden = (message = "Forbidden") =>
  errorResponse(403, "forbidden", message);

export const badRequest = (message: string, details?: unknown) =>
  errorResponse(400, "bad_request", message, details);

export const tooManyRequests = (message = "Too many requests", retryAfterSec?: number) => {
  const res = errorResponse(429, "rate_limited", message, retryAfterSec ? { retryAfterSec } : undefined);
  if (retryAfterSec) res.headers.set("Retry-After", String(Math.ceil(retryAfterSec)));
  return res;
};
