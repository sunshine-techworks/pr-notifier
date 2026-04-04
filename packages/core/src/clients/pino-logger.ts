import pino from 'pino'

import type { Logger } from '../interfaces/logger'

/**
 * Pino-based implementation of the Logger interface.
 * Provides structured JSON logging suitable for Lambda environments.
 */
export class PinoLogger implements Logger {
  private readonly instance: pino.Logger

  constructor(options?: pino.LoggerOptions) {
    this.instance = pino(options)
  }

  /**
   * Private constructor for creating child loggers.
   * Uses an existing pino instance instead of creating a new one.
   */
  private static fromInstance(instance: pino.Logger): PinoLogger {
    const logger = Object.create(PinoLogger.prototype)
    logger.instance = instance
    return logger
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.instance.debug(context, message)
    } else {
      this.instance.debug(message)
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.instance.info(context, message)
    } else {
      this.instance.info(message)
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.instance.warn(context, message)
    } else {
      this.instance.warn(message)
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.instance.error(context, message)
    } else {
      this.instance.error(message)
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    // Create a pino child logger with the bound context
    const childInstance = this.instance.child(bindings)
    return PinoLogger.fromInstance(childInstance)
  }
}