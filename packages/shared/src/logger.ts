import pino, { type Logger, type LoggerOptions } from 'pino';

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino({
    name: 'pouch',
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    ...options,
  });
}

export const logger = createLogger();
