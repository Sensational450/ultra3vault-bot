const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const axios = require('axios');

/**
 * Logger v5.0
 * - Console, rotating file, Discord webhook transports
 * - Child loggers with bound metadata
 * - EventBus integration
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
      discordWebhook: options.discordWebhook || null,
      eventBus: options.eventBus || null,
      serviceName: options.serviceName || 'discord-bot',
      ...options,
    };
    this.transports = [];
    this._initTransports();
    this.logger = winston.createLogger({
      level: this.options.level,
      format: this._getFormat(),
      transports: this.transports,
      exitOnError: false,
    });
  }

  _initTransports() {
    if (this.options.consoleEnabled) {
      this.transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        ),
      }));
    }
    if (this.options.fileEnabled) {
      this.transports.push(new DailyRotateFile({
        filename: this.options.filePath,
        datePattern: 'YYYY-MM-DD',
        maxSize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }));
    }
    if (this.options.discordWebhook) {
      this._setupDiscordTransport();
    }
  }

  _setupDiscordTransport() {
    const discordStream = { write: (msg) => this._sendToDiscord(msg) };
    this.transports.push(new winston.transports.Stream({ stream: discordStream, level: 'warn' }));
    this.discordWebhookUrl = this.options.discordWebhook;
  }

  async _sendToDiscord(msg) {
    try {
      const parsed = JSON.parse(msg);
      const { level, message, timestamp, ...meta } = parsed;
      const embed = {
        title: `🪵 ${this.options.serviceName} (${level.toUpperCase()})`,
        description: message.slice(0, 2000),
        color: level === 'error' ? 0xff0000 : (level === 'warn' ? 0xffaa00 : 0x00ae86),
        timestamp,
        fields: Object.entries(meta).slice(0, 5).map(([k, v]) => ({ name: k, value: String(v).slice(0, 1024), inline: false })),
        footer: { text: this.options.serviceName },
      };
      await axios.post(this.discordWebhookUrl, { embeds: [embed] }, { timeout: 5000 });
    } catch (err) { /* ignore */ }
  }

  _getFormat() {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    );
  }

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

  child(bindings) {
    const child = new Logger({ ...this.options, eventBus: this.options.eventBus });
    const origLog = child.log.bind(child);
    child.log = (level, message, meta = {}) => origLog(level, message, { ...bindings, ...meta });
    return child;
  }

  getLevel() { return this.logger.level; }
  setLevel(level) { this.logger.level = level; this.options.level = level; }

  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

module.exports = { Logger };