const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { format } = winston;

/**
 * Logger v5.0
 * 
 * Features:
 * - Multiple transports: console, file (rotating), Discord webhook (optional)
 * - Log levels: error, warn, info, debug (customizable)
 * - Structured JSON logging with metadata
 * - Child loggers with bound metadata (requestId, userId, etc.)
 * - Event bus emission for errors and warnings (for monitoring)
 * - Configurable via options
 * - Production‑ready with log rotation and size limits
 */
class Logger {
  constructor(options = {}) {
    this.options = {
      level: process.env.LOG_LEVEL || 'info',
      consoleEnabled: options.consoleEnabled !== false,
      fileEnabled: options.fileEnabled !== false,
      filePath: options.filePath || 'logs/app.log',
      maxSize: options.maxSize || '20m',
      maxFiles: options.maxFiles || '14d',
      discordWebhook: options.discordWebhook || null, // URL for error/warn webhook
      eventBus: options.eventBus || null,
      serviceName: options.serviceName || 'discord-bot',
      ...options,
    };
    
    this.transports = [];
    this.childLoggers = new Map();
    this._initTransports();
    this.logger = winston.createLogger({
      level: this.options.level,
      format: this._getFormat(),
      transports: this.transports,
      exitOnError: false,
    });
  }

  /**
   * Initialize transports based on options
   */
  _initTransports() {
    if (this.options.consoleEnabled) {
      this.transports.push(new winston.transports.Console({
        format: format.combine(
          format.colorize(),
          format.timestamp(),
          format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        ),
      }));
    }
    
    if (this.options.fileEnabled) {
      const rotateTransport = new DailyRotateFile({
        filename: this.options.filePath,
        datePattern: 'YYYY-MM-DD',
        maxSize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        format: format.combine(
          format.timestamp(),
          format.json()
        ),
      });
      this.transports.push(rotateTransport);
    }
    
    if (this.options.discordWebhook) {
      this._setupDiscordTransport();
    }
  }

  /**
   * Setup Discord webhook transport (sends errors/warns to a channel)
   */
  _setupDiscordTransport() {
    // Lazy require axios to avoid dependency if not used
    const axios = require('axios');
    const discordTransport = new winston.transports.Stream({
      stream: { write: (msg) => this._sendToDiscord(msg) },
      level: 'warn', // only warn and error
    });
    this.transports.push(discordTransport);
    this.discordWebhookUrl = this.options.discordWebhook;
  }

  async _sendToDiscord(msg) {
    try {
      const parsed = JSON.parse(msg);
      const { level, message, timestamp, ...meta } = parsed;
      const embed = {
        title: `🪵 Logger (${level.toUpperCase()})`,
        description: message,
        color: level === 'error' ? 0xff0000 : (level === 'warn' ? 0xffaa00 : 0x00ae86),
        timestamp,
        fields: Object.entries(meta).map(([k, v]) => ({ name: k, value: String(v).slice(0, 1024), inline: false })),
        footer: { text: this.options.serviceName },
      };
      await axios.post(this.discordWebhookUrl, { embeds: [embed] }, { timeout: 5000 });
    } catch (err) {
      // Silently fail – avoid log loop
    }
  }

  /**
   * Get the main winston format (structured JSON for file)
   */
  _getFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    );
  }

  /**
   * Log a message at the given level
   * @param {string} level - error, warn, info, debug
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  log(level, message, meta = {}) {
    if (this.options.eventBus && (level === 'error' || level === 'warn')) {
      this.options.eventBus.emit('logger.log', { level, message, meta, timestamp: Date.now() });
    }
    this.logger.log(level, message, { ...meta, service: this.options.serviceName });
  }

  error(message, meta = {}) { this.log('error', message, meta); }
  warn(message, meta = {})  { this.log('warn', message, meta); }
  info(message, meta = {})  { this.log('info', message, meta); }
  debug(message, meta = {}) { this.log('debug', message, meta); }

  /**
   * Create a child logger with bound metadata (e.g., requestId, userId)
   * @param {Object} bindings - Metadata to attach to every log
   * @returns {Logger} Child logger instance
   */
  child(bindings) {
    const childLogger = new Logger({ ...this.options, eventBus: this.options.eventBus });
    // Override the log method to include bindings
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, meta = {}) => {
      originalLog(level, message, { ...bindings, ...meta });
    };
    return childLogger;
  }

  /**
   * Get current log level
   */
  getLevel() {
    return this.logger.level;
  }

  /**
   * Dynamically change log level
   */
  setLevel(level) {
    this.logger.level = level;
    this.options.level = level;
  }

  /**
   * Flush all transports (useful before shutdown)
   */
  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

module.exports = { Logger };