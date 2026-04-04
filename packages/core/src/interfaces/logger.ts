/**
 * Framework-agnostic logger interface.
 */
export interface Logger {
  /**
   * Log a debug message with optional context
   */
  debug(message: string, context?: Record<string, unknown>): void

  /**
   * Log an info message with optional context
   */
  info(message: string, context?: Record<string, unknown>): void

  /**
   * Log a warning message with optional context
   */
  warn(message: string, context?: Record<string, unknown>): void

  /**
   * Log an error message with optional context
   */
  error(message: string, context?: Record<string, unknown>): void

  /**
   * Create a child logger with bound context.
   * Useful for adding request-specific data like requestId or eventType
   * that should be included in all subsequent log messages.
   */
  child(bindings: Record<string, unknown>): Logger
}