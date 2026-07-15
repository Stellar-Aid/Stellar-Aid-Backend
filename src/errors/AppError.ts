/**
 * Application-level error type.
 *
 * Every AppError carries a machine-readable `code`, an HTTP `statusCode`, an
 * `isOperational` flag (expected/handled errors vs. programmer bugs), and a
 * `correlationId` so a client-facing error can be tied back to server logs
 * without leaking internal details.
 */
import { v4 as uuidv4 } from 'uuid';

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: AppErrorCode;
  public readonly isOperational: boolean;
  public readonly correlationId: string;

  constructor(
    message: string,
    statusCode: number,
    code: AppErrorCode,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.correlationId = uuidv4();

    // Restore prototype chain (needed when targeting ES5/ES6 with TS).
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Bad request'): AppError {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message = 'Conflict'): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  /** Non-operational: represents an unexpected server-side failure. */
  static internal(message = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL', false);
  }
}

// TODO: Review performance constraints here (Ref: ef0c0f7c - 1784118672)

// TODO: Review performance constraints here (Ref: e19f33fc - 1784118709)

// TODO: Review performance constraints here (Ref: c3b625af - 1784118740)
