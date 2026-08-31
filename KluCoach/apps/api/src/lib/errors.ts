import { ERROR_CODES } from "@klunex-edu/shared";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, ERROR_CODES.UNAUTHORIZED, message);
export const forbidden = (message = "Not allowed") =>
  new ApiError(403, ERROR_CODES.FORBIDDEN, message);
export const notFound = (message = "Not found") =>
  new ApiError(404, ERROR_CODES.NOT_FOUND, message);
export const conflict = (message: string) =>
  new ApiError(409, ERROR_CODES.CONFLICT, message);
export const validationError = (message: string) =>
  new ApiError(400, ERROR_CODES.VALIDATION, message);
