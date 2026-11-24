import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { config } from './config';
import { logger } from './utils/logger';
import { ForbiddenError } from './utils/errors';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { initDatabaseConnection, prisma } from './db/prisma';
import { schedulerService } from './services/schedulerService';
import { startNotificationDeliveryWorker } from './services/notificationDelivery';
import { startGeminiRankingWorker } from './services/geminiRankingQueue';
import { startFollowUpReminders } from './services/followUpReminders';

// Import Route Handlers
import healthRouter from './routes/health';
import leadsRouter from './routes/leads';
import discoveryRouter from './routes/discovery';
import auditRouter from './routes/audit';
import pitchesRouter from './routes/pitches';
import ratecardsRouter from './routes/ratecards';
import analyticsRouter from './routes/analytics';
import automationRouter from './routes/automation';
import notificationsRouter from './routes/notifications';
import businessKnowledgeRouter from './routes/businessKnowledge';
import idealClientProfilesRouter from './routes/idealClientProfiles';
import providerReadinessRouter from './routes/providerReadiness';
import followupsRouter from './routes/followups';
import engagementRouter from './routes/engagement';

const app = express();
app.set('trust proxy', config.TRUST_PROXY_HOPS);

// 1. Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: config.NODE_ENV === 'production' ? {
      directives: {
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Secure CORS Configuration
const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());
app.use('/api', cors((req: Request, callback) => {
  const origin = req.get('origin');
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  const localDevelopment = config.NODE_ENV !== 'production' && origin
    && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (origin && !sameOrigin && !localDevelopment && !allowedOrigins.includes(origin)) {
    return callback(new ForbiddenError('This origin cannot access the API.'));
  }

  callback(null, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });
}));

// 4. Rate Limiting for API routes
const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again after a few minutes.',
    },
  },
});
app.use('/api/', apiLimiter);

// 5. Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug('HTTP request.', { name: req.method });
  next();
});

// 6. Mount API Route Modules
app.use('/api/health', healthRouter);
app.use('/api', authenticate);
app.use('/api', express.json({ limit: '2mb' }), express.urlencoded({ extended: true, limit: '2mb', parameterLimit: 1000 }));
app.get('/api/session', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true });
});
app.use('/api/leads', leadsRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/audit', auditRouter);
app.use('/api/pitches', pitchesRouter);
app.use('/api/ratecards', ratecardsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/automation', automationRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/business-profile', businessKnowledgeRouter);
app.use('/api/ideal-client-profiles', idealClientProfilesRouter);
app.use('/api/provider-readiness', providerReadinessRouter);
app.use('/api/follow-ups', followupsRouter);
app.use('/api/engagement', engagementRouter);

// 7. Handle Unmatched 404 Routes
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'API endpoint does not exist.',
    },
  });
});

const clientDirectory = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDirectory));

// 8. Global Error Handler
app.use(errorHandler);

// 9. Server Initialization and Graceful Shutdown
const PORT = config.PORT || 5000;

async function bootstrap() {
  if (config.NODE_ENV === 'production' && !config.API_SECRET) {
    throw new Error('Set API_SECRET before starting the server in production.');
  }
  // Attempt DB Connection
  const connected = await initDatabaseConnection();
  if (config.NODE_ENV === 'production' && !connected) {
    throw new Error('Production requires a reachable, migrated PostgreSQL database.');
  }

  let stopDeliveries: (() => void) | undefined;
  let stopGemini: (() => void) | undefined;
  let stopFollowUps: (() => void) | undefined;
  const server = app.listen(PORT, config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => {
    schedulerService.startScheduler();
    if (connected && config.NODE_ENV !== 'test') stopGemini = startGeminiRankingWorker();
    if (connected && config.NODE_ENV !== 'test') stopFollowUps = startFollowUpReminders();
    if (connected && config.DISCOVERY_EXTERNAL_ALERTS_ENABLED) stopDeliveries = startNotificationDeliveryWorker();
    logger.info(`AI Client Hunter Backend running on port ${PORT}`);
    logger.info(`Environment: ${config.NODE_ENV}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `[EADDRINUSE] Port ${PORT} is already in use by another running process (such as a running 'npm run dev' or previous instance).`
      );
      logger.error(
        `Action: Stop the running process, kill port ${PORT}, or start with a different port (e.g. PORT=5001 npm start).`
      );
    } else {
      logger.error('HTTP server encountered an unhandled error:', err);
    }
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    schedulerService.stopScheduler();
    stopDeliveries?.();
    stopGemini?.();
    stopFollowUps?.();
    schedulerService.stopCurrentRun();
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error(err instanceof Error ? err.message : 'Application initialization failed.');
  process.exit(1);
});

export default app;
