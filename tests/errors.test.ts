import { Request, Response, NextFunction } from 'express';
import { AppError } from '../src/errors/AppError';
import { errorHandler } from '../src/middleware/errorHandler';

describe('AppError', () => {
  it('carries statusCode, code, isOperational and a correlationId', () => {
    const err = new AppError('boom', 418, 'BAD_REQUEST');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.isOperational).toBe(true);
    expect(typeof err.correlationId).toBe('string');
    expect(err.correlationId.length).toBeGreaterThan(0);
  });

  it('generates a unique correlationId per instance', () => {
    const a = AppError.badRequest();
    const b = AppError.badRequest();
    expect(a.correlationId).not.toBe(b.correlationId);
  });

  it('static helpers set correct status codes and codes', () => {
    expect(AppError.badRequest().statusCode).toBe(400);
    expect(AppError.badRequest().code).toBe('BAD_REQUEST');
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.unauthorized().code).toBe('UNAUTHORIZED');
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.notFound().code).toBe('NOT_FOUND');
    expect(AppError.conflict().statusCode).toBe(409);
    const internal = AppError.internal();
    expect(internal.statusCode).toBe(500);
    expect(internal.code).toBe('INTERNAL');
    expect(internal.isOperational).toBe(false);
  });
});

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('errorHandler', () => {
  const req = {} as Request;
  const next = (() => undefined) as NextFunction;

  it('maps an AppError to the declared status and shaped JSON', () => {
    const res = mockRes();
    const err = AppError.notFound('nope');
    errorHandler(err, req, res, next);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'nope',
        correlationId: err.correlationId,
      },
    });
  });

  it('maps an unknown error to a generic 500 without leaking details', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    const leaky = new Error('secret db connection string here');
    errorHandler(leaky, req, res, next);

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: { code: string; message: string; correlationId: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.message).not.toContain('secret');
    expect(typeof body.error.correlationId).toBe('string');
    expect(body.error.correlationId.length).toBeGreaterThan(0);
    // The real error IS logged server-side.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// TODO: Review performance constraints here (Ref: d707e124 - 1784118699)
