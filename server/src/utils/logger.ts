type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const secretNames = ['API_SECRET', 'GEMINI_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY',
  'SERPAPI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'SMTP_PASS', 'DATABASE_URL'];

export function redactLogText(input: string): string {
  let result = input;
  for (const name of secretNames) {
    const secret = process.env[name];
    if (secret && secret.length >= 4) {
      result = result.split(secret).join('[redacted]').split(encodeURIComponent(secret)).join('[redacted]');
    }
  }
  return result
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1 [redacted]')
    .replace(/([?&](?:key|api[_-]?key|access[_-]?token|token|password)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/(api\.telegram\.org\/bot)[^/\s]+/gi, '$1[redacted]')
    .replace(/((?:postgres(?:ql)?|https?):\/\/)[^/\s]+@/gi, '$1[redacted]@')
    .replace(/[\r\n\u001b]/g, ' ').slice(0, 1000);
}

function safeMetadata(input: unknown): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  if (input && typeof input === 'object') {
    for (const key of ['status', 'statusCode', 'code', 'provider', 'kind', 'count', 'name']) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === 'string') output[key] = redactLogText(value);
      else if (typeof value === 'number' || typeof value === 'boolean') output[key] = value;
    }
  }
  return output;
}

class Logger {
  private write(level: LogLevel, message: string, meta?: unknown) {
    const line = JSON.stringify({ time: new Date().toISOString(), level, message: redactLogText(message), ...safeMetadata(meta) });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
  info(message: string, meta?: unknown) { this.write('info', message, meta); }
  warn(message: string, meta?: unknown) { this.write('warn', message, meta); }
  error(message: string, meta?: unknown) { this.write('error', message, meta); }
  debug(message: string, meta?: unknown) {
    if (process.env.NODE_ENV !== 'production') this.write('debug', message, meta);
  }
}
export const logger = new Logger();
