import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || path.join(__dirname, '../../logs/content-creator.log');

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'content-creator-suite' },
  transports: [
    new winston.transports.File({ filename: logFile.replace('.log', '-error.log'), level: 'error' }),
    new winston.transports.File({ filename: logFile }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export function createTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function logWithTrace(traceId: string, level: string, message: string, meta?: object) {
  logger.log(level, message, { traceId, ...meta });
}
