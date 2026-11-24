import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env in project root or current server directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_PUBLIC_URL: z.string().url().regex(/^https?:\/\//).or(z.literal('')).default(''),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/ai_client_hunter?schema=public'),
  API_SECRET: z.string().trim().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().max(86400000).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().max(100000).default(100),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(8).default(0),
  // Phase 9 Notification & Provider Environment Variables
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  NOTIFICATION_EMAIL: z.string().optional().default(''),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  GOOGLE_PLACES_API_KEY: z.string().optional().default(''),
  SERPAPI_API_KEY: z.string().optional().default(''),
  OSM_NOMINATIM_URL: z.string().trim().default(''),
  OSM_OVERPASS_URL: z.string().trim().default(''),
  OSM_OVERPASS_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  GOOGLE_PLACES_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(10000).default(100),
  SERPAPI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(10000).default(40),
  OSM_OVERPASS_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(10000).default(120),
  OSM_NOMINATIM_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(10000).default(60),
  DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN: z.coerce.number().int().min(0).max(100).default(8),
  DISCOVERY_WEBSITE_CACHE_HOURS: z.coerce.number().int().min(0).max(168).default(24),
  DISCOVERY_EXTERNAL_ALERTS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

// Ensure process.env.DATABASE_URL is populated for Prisma Client runtime
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = parsedEnv.data.DATABASE_URL;
}

export const config = parsedEnv.data;
