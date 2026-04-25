/**
 * LOGGER UTILITY
 * Simple console logger with timestamps
 */

class Logger {
    log(message, ...args) {
        console.log(`[${new Date().toISOString()}]`, message, ...args);
    }

    info(message, ...args) {
        console.log(`[${new Date().toISOString()}] [INFO]`, message, ...args);
    }

    warn(message, ...args) {
        console.warn(`[${new Date().toISOString()}] [WARN]`, message, ...args);
    }

    error(message, ...args) {
        console.error(`[${new Date().toISOString()}] [ERROR]`, message, ...args);
    }

    debug(message, ...args) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[${new Date().toISOString()}] [DEBUG]`, message, ...args);
        }
    }
}

module.exports = new Logger();
