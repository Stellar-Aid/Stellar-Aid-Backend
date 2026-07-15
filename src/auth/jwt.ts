/**
 * JWT signing/verification helpers and the `requireAuth` Express middleware.
 *
 * SECURITY / storage interceptor note:
 *   Tokens issued here are bearer credentials. On the CLIENT they MUST be stored
 *   in an httpOnly, Secure, SameSite cookie set by the server — NEVER in
 *   localStorage or sessionStorage (both are readable by any injected script and
 *   turn every XSS into full account takeover). The frontend should therefore
 *   rely on the browser to attach the cookie automatically and should NOT read,
 *   copy, or persist the raw token in JS-accessible storage. This middleware
 *   also accepts an `Authorization: Bearer` header for server-to-server callers.
 *
 * Anti-leak: the raw token is never logged, not even on verification failure.
 */
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import { getNetworkConfig } from '../config/network';

export interface AuthUser {
  /** Subject — typically the caller's Stellar address or account id. */
  sub: string;
  /** Optional role/scope claim. */
  role?: string;
}

// Augment Express' Request so `req.user` is strongly typed everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function secret(): string {
  return getNetworkConfig().jwtSecret;
}

/** Sign a JWT for the given user. Default expiry 1h. */
export function signToken(user: AuthUser, options: SignOptions = {}): string {
  const payload: AuthUser = { sub: user.sub, role: user.role };
  return jwt.sign(payload, secret(), { expiresIn: '1h', ...options });
}

/** Verify a JWT and return the decoded user, or throw AppError.unauthorized. */
export function verifyToken(token: string): AuthUser {
  try {
    const decoded = jwt.verify(token, secret()) as JwtPayload & Partial<AuthUser>;
    if (!decoded || typeof decoded.sub !== 'string') {
      throw AppError.unauthorized('Invalid token payload');
    }
    return { sub: decoded.sub, role: decoded.role };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    // NOTE: deliberately do not include the token or the raw jwt error message
    // (which can echo token fragments) in anything client-facing.
    throw AppError.unauthorized('Invalid or expired token');
  }
}

function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length).trim() || undefined;
}

/** Express middleware: require a valid bearer token, attach `req.user`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    next(AppError.unauthorized('Missing bearer token'));
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

// TODO: Review performance constraints here (Ref: 4806491d - 1784118752)

// TODO: Review performance constraints here (Ref: f93ea3b1 - 1784118798)
