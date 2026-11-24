import { Router, Request, Response } from 'express';
import { prisma, isDatabaseConnected } from '../db/prisma';
import { config } from '../config';
import { schedulerService } from '../services/schedulerService';

const router = Router();
const startTime = Date.now();

router.get('/', async (_req: Request, res: Response) => {
  let dbStatus = false;
  try {
    if (isDatabaseConnected) {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = true;
    }
  } catch {
    dbStatus = false;
  }

  let scheduler = null;
  if (dbStatus || !isDatabaseConnected) {
    try {
      const { enabled, isRunning, jobStatus } = await schedulerService.getStatus();
      scheduler = { enabled, isRunning, jobStatus };
    } catch {
      // Diagnostics remain available when the scheduler cannot load its settings.
    }
  }

  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  const isHealthy = dbStatus || config.NODE_ENV !== 'production';
  const isDegraded = !dbStatus || !config.GEMINI_API_KEY;

  res.status(isHealthy ? 200 : 503).json({
    status: isDegraded ? 'degraded' : 'ok',
    service: 'AI Client Hunter API',
    version: '1.0.0',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    checks: {
      database: {
        status: dbStatus ? 'connected' : isDatabaseConnected ? 'disconnected' : 'disconnected (in-memory mode)',
        engine: 'PostgreSQL with Prisma ORM',
        actionNeeded: dbStatus ? null : 'Run "docker compose up -d" to connect persistent PostgreSQL',
      },
      geminiAi: {
        configured: Boolean(config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim() !== ''),
        model: config.GEMINI_MODEL,
        actionNeeded: config.GEMINI_API_KEY ? null : 'Set GEMINI_API_KEY in .env to enable live Gemini LLM calls',
      },
      notifications: {
        emailConfigured: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS),
        telegramConfigured: Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID),
      },
      scheduler,
    },
    system: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    },
  });
});

export default router;
