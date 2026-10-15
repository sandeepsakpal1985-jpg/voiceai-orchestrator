export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function publicError(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (isAppError(error)) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: "internal_error", message: "Something went wrong. Try again." } } };
}

type PgError = { code?: string; message?: string };

export function mapDatabaseError(error: unknown): unknown {
  if (isAppError(error)) return error;
  const pg = error as PgError;
  if (pg.code === "23505") return new AppError("conflict", "That record already exists.", 409);
  if (pg.code === "23503") return new AppError("invalid_reference", "That related record is not available.", 400);
  if (pg.code === "23514") return new AppError("validation_error", "The submitted value is not allowed.", 400);
  if (pg.code === "42501") return new AppError("forbidden", "You do not have access to that record.", 403, pg.message);
  const message = pg.message ?? "";
  if (message.includes("assignee is not an active member")) {
    return new AppError("invalid_assignee", "Choose an active member of this organization.", 400);
  }
  if (message.includes("team member is not an active member")) {
    return new AppError("invalid_member", "That person is not an active member of this organization.", 400);
  }
  if (message.toLowerCase().includes("forbidden") || message.includes("not authenticated")) {
    return new AppError("forbidden", "You do not have access to that record.", 403);
  }
  return error;
}
