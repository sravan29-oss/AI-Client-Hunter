import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data provided.',
        details: formattedErrors,
      },
    });
    return;
  }

  // 2. Custom Application Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.constructor.name,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 3. Prisma Database Errors
  if (err?.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    logger.error('Database query error:', { code: err.code, meta: err.meta });
    
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: 'A record with this unique value already exists.',
          details: err.meta,
        },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 'RECORD_NOT_FOUND',
          message: 'The requested database record does not exist.',
        },
      });
      return;
    }
  }

  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    const tooLarge = err.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      success: false,
      error: { code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_BODY', message: tooLarge ? 'Request payload is too large.' : 'Invalid request body.' },
    });
    return;
  }

  logger.error('Unhandled server error.', { name: err?.name, code: err?.code });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    },
  });
}
