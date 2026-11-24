import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { authenticate, requireRole } from '../middleware/auth';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { config } from '../config';

describe('Authentication & Authorization Middleware', () => {
  it('should assign developer admin context in local development when no API_SECRET is set', (t, done) => {
    const origEnv = config.NODE_ENV;
    const origSecret = config.API_SECRET;
    (config as any).NODE_ENV = 'development';
    (config as any).API_SECRET = '';

    const req: any = { headers: {} };
    const res: any = {};

    authenticate(req, res, (err) => {
      (config as any).NODE_ENV = origEnv;
      (config as any).API_SECRET = origSecret;
      assert.strictEqual(err, undefined);
      assert.ok(req.user, 'User object must be attached');
      assert.strictEqual(req.user.role, 'admin');
      done();
    });
  });

  it('should strictly reject unauthenticated requests in production mode even if API_SECRET is unset', (t, done) => {
    const origEnv = config.NODE_ENV;
    const origSecret = config.API_SECRET;
    (config as any).NODE_ENV = 'production';
    (config as any).API_SECRET = '';

    const req: any = { headers: {} };
    const res: any = {};

    authenticate(req, res, (err) => {
      (config as any).NODE_ENV = origEnv;
      (config as any).API_SECRET = origSecret;
      assert.ok(err instanceof UnauthorizedError, 'Must throw UnauthorizedError in production mode');
      assert.match(err.message, /production configuration error/i);
      done();
    });
  });

  it('should reject invalid Bearer tokens when API_SECRET is set', (t, done) => {
    const origSecret = config.API_SECRET;
    (config as any).API_SECRET = 'super-secret-token-123';

    const req: any = { headers: { authorization: 'Bearer wrong-token' } };
    const res: any = {};

    authenticate(req, res, (err) => {
      (config as any).API_SECRET = origSecret;
      assert.ok(err instanceof UnauthorizedError, 'Must throw UnauthorizedError on bad token');
      assert.strictEqual(err.message, 'Invalid authentication credentials.');
      done();
    });
  });

  it('should authenticate valid Bearer token and assign admin user', (t, done) => {
    const origSecret = config.API_SECRET;
    (config as any).API_SECRET = 'super-secret-token-123';

    const req: any = { headers: { authorization: 'Bearer super-secret-token-123' } };
    const res: any = {};

    authenticate(req, res, (err) => {
      (config as any).API_SECRET = origSecret;
      assert.strictEqual(err, undefined);
      assert.ok(req.user);
      assert.strictEqual(req.user.role, 'admin');
      done();
    });
  });

  it('should authenticate valid X-API-Key header and assign admin user', (t, done) => {
    const origSecret = config.API_SECRET;
    (config as any).API_SECRET = 'my-custom-api-key-456';

    const req: any = { headers: { 'x-api-key': 'my-custom-api-key-456' } };
    const res: any = {};

    authenticate(req, res, (err) => {
      (config as any).API_SECRET = origSecret;
      assert.strictEqual(err, undefined);
      assert.ok(req.user);
      assert.strictEqual(req.user.role, 'admin');
      done();
    });
  });

  it('should allow authorized roles through requireRole', (t, done) => {
    const req: any = { user: { role: 'admin' } };
    const res: any = {};

    const guard = requireRole(['admin']);
    guard(req, res, (err) => {
      assert.strictEqual(err, undefined);
      done();
    });
  });

  it('should reject unauthorized roles through requireRole', (t, done) => {
    const req: any = { user: { role: 'user' } };
    const res: any = {};

    const guard = requireRole(['admin']);
    guard(req, res, (err) => {
      assert.ok(err instanceof ForbiddenError, 'Must throw ForbiddenError');
      done();
    });
  });
});
