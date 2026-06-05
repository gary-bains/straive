/**
 * Application errors with a stable machine-readable `code` and an HTTP status.
 * The central error handler (app.ts) serializes these into the shared ApiError
 * envelope: { error: { code, message, details? } }.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: (message = "Authentication required") =>
    new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to perform this action") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (message = "Resource not found") =>
    new AppError(404, "NOT_FOUND", message),
  conflict: (message = "Resource already exists") =>
    new AppError(409, "CONFLICT", message),
  badRequest: (message = "Invalid request", details?: unknown) =>
    new AppError(400, "BAD_REQUEST", message, details),
};
