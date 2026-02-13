/**
 * Lightweight logger for smart-money-concepts.
 *
 * Uses console methods by default. Can be silenced or replaced
 * with a custom logger via setLogger().
 */

export interface Logger {
    debug(message: string, ...args: unknown[]): void
    warn(message: string, ...args: unknown[]): void
    error(message: string, ...args: unknown[]): void
}

const consoleLogger: Logger = {
    debug() {},
    warn(message: string, ...args: unknown[]) {
        console.warn(message, ...args)
    },
    error(message: string, ...args: unknown[]) {
        console.error(message, ...args)
    },
}

let currentLogger: Logger = consoleLogger

/**
 * Replace the default logger with a custom implementation.
 */
export function setLogger(newLogger: Logger): void {
    currentLogger = newLogger
}

const logger: Logger = {
    debug(message: string, ...args: unknown[]) {
        currentLogger.debug(message, ...args)
    },
    warn(message: string, ...args: unknown[]) {
        currentLogger.warn(message, ...args)
    },
    error(message: string, ...args: unknown[]) {
        currentLogger.error(message, ...args)
    },
}

export default logger
