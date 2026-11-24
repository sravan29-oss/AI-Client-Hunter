import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthenticatedUser {
  id: string;
  role: 'admin' | 'user' | 'developer';
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Flexible API Key & Session Authentication Middleware.
 * When API_SECRET is configured in .env, validates incoming Authorization: Bearer <token>
 * or X-API-Key header. If not set, allows local development with developer credentials.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const secretKey = config.API_SECRET || process.env.API_SECRET;

  // In production mode, authentication MUST NOT be bypassed.
  if (config.NODE_ENV === 'production') {
    if (!secretKey || secretKey.trim() === '') {
      return next(
        new UnauthorizedError(
          'Production configuration error: API_SECRET must be configured in production environment. Developer fallback is strictly prohibited.'
        )
      );
    }
  } else {
    // In local development or test mode: if no API_SECRET is configured, allow developer admin context
    if (!secretKey || secretKey.trim() === '') {
      req.user = { id: 'local-dev', role: 'admin', email: 'developer@ai-client-hunter.local' };
      return next();
    }
  }

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  let providedToken: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (apiKeyHeader) {
    providedToken = apiKeyHeader.trim();
  }

  if (!providedToken) {
    return next(
      new UnauthorizedError(
        'Authentication required. Provide Authorization: Bearer <token> or X-API-Key header.'
      )
    );
  }

  const actual = Buffer.from(providedToken);
  const expected = Buffer.from(secretKey);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return next(new UnauthorizedError('Invalid authentication credentials.'));
  }

  req.user = { id: 'admin-user', role: 'admin', email: 'admin@ai-client-hunter.local' };
  next();
};

/**
 * Role-Based Access Control Middleware.
 */
export const requireRole = (allowedRoles: Array<'admin' | 'user' | 'developer'>) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action.'));
    }
    next();
  };
};
