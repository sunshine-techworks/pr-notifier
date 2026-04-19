import type { Logger } from '../interfaces/logger'

/**
 * Simple console-based logger that implements the Logger interface.
 * Uses JSON.stringify for structured output that CloudWatch parses natively.
 * Preferred over PinoLogger in Lambda environments because pino's CJS
 * dynamic requires break esbuild's ESM bundling.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(JSON.stringify({ level: 'debug', message, ...this.bindings, ...context }))
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.info(JSON.stringify({ level: 'info', message, ...this.bindings, ...context }))
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ level: 'warn', message, ...this.bindings, ...context }))
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: 'error', message, ...this.bindings, ...context }))
  }

  child(childBindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({ ...this.bindings, ...childBindings })
  }
}
