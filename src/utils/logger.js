import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level}] ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

export function createLogger() {
  const logger = winston.createLogger({
    level: process.env.DEBUG_MODE === 'true' ? 'debug' : 'info',
    format: logFormat,
    transports: [
      // Console output
      new winston.transports.Console({
        format: consoleFormat
      }),
      
      // File output
      new winston.transports.File({
        filename: path.join('logs', 'application.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true
      }),
      
      // Error file
      new winston.transports.File({
        filename: path.join('logs', 'errors.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 3,
        tailable: true
      })
    ]
  });

  return logger;
}