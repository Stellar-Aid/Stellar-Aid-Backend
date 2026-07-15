/**
 * Centralised Express error handling.
 *
 * - `notFoundHandler` converts any unmatched route into an AppError.notFound so
 *   404s are shaped identically to every other error response.
 * - `errorHandler` is the terminal 4-arg Express error middleware. It maps
 *   AppErrors to their declared status/code and returns a compact JSON body.
 *   Unknown/unexpected errors become an opaque 500 — the stack and internal
 *   message are logged server-side (console.error) but NEVER sent to the client.
 */
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wrap an async route handler so any rejected promise is forwarded to the
 * error-handling middleware instead of crashing the process / hanging the request.
 */
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

/** Catch-all for unmatched routes. Registered after all real routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Terminal error-handling middleware. MUST be registered last. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      // Non-operational AppErrors still deserve a server-side trace.
      console.error(
        `[errorHandler] non-operational AppError (correlationId=${err.correlationId})`,
        err.stack ?? err.message,
      );
    }
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        correlationId: err.correlationId,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown error: log everything server-side, leak nothing to the client.
  const internal = AppError.internal();
  console.error(
    `[errorHandler] unexpected error (correlationId=${internal.correlationId})`,
    err instanceof Error ? (err.stack ?? err.message) : err,
  );
  const body: ErrorBody = {
    error: {
      code: internal.code,
      message: internal.message,
      correlationId: internal.correlationId,
    },
  };
  res.status(internal.statusCode).json(body);
}

// TODO: Review performance constraints here (Ref: d8008087 - 1784118768)
