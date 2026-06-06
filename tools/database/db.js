const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { MigrationRunner } = require('./migrations');

/**
 * 🗄️ Database v5.0
 * - Promise‑based SQLite wrapper
 * - Automatic migration runner on init
 * - Event bus integration (emits db events)
 * - Logger support
 * - Connection management
 */
class Database {
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.DB_PATH || './data.sqlite';
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.migrationsPath = options.migrationsPath || path.join(__dirname, 'migrations');
    this.db = null;
    this.isReady = false;
  }

  // 📡 Emit event (if eventBus available)
  _emit(event, data) {
    if (this.eventBus?.emit) {
      this.eventBus.emit(event, data);
    }
  }

  // 🔌 Open database connection and run migrations
  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          this.logger.error(`💥 Failed to open database: ${err.message}`);
          this._emit('db.error', { error: err.message });
          reject(err);
          return;
        }
        this.logger.info(`✅ SQLite database connected: ${this.dbPath}`);
        this._emit('db.connected', { path: this.dbPath });

        // Enable foreign keys
        await this.run('PRAGMA foreign_keys = ON');
        this.logger.debug('🔗 Foreign keys enabled');

        // Run migrations
        await this._runMigrations();

        this.isReady = true;
        this._emit('db.ready', { path: this.dbPath });
        resolve(this.db);
      });
    });
  }

  // 📦 Run pending migrations
  async _runMigrations() {
    try {
      const runner = new MigrationRunner(this, {
        eventBus: this.eventBus,
        logger: this.logger,
        migrationsPath: this.migrationsPath,
      });
      await runner.up();
    } catch (err) {
      this.logger.error(`❌ Migration failed: ${err.message}`);
      this._emit('db.migration.error', { error: err.message });
      throw err;
    }
  }

  // ⚡ Run a query (non‑SELECT) – returns { changes, lastID }
  run(sql, params = []) {
    this._emit('db.query', { sql, params, type: 'run' });
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          this._emit('db.error', { error: err.message, sql });
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      }.bind(this));
    });
  }

  // 🔍 Get first row of a SELECT query
  get(sql, params = []) {
    this._emit('db.query', { sql, params, type: 'get' });
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          this._emit('db.error', { error: err.message, sql });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 📋 Get all rows of a SELECT query
  all(sql, params = []) {
    this._emit('db.query', { sql, params, type: 'all' });
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          this._emit('db.error', { error: err.message, sql });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 🏃 Execute multiple SQL statements (for migrations)
  exec(sql) {
    this._emit('db.query', { sql, type: 'exec' });
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          this._emit('db.error', { error: err.message, sql });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // 🧠 Transaction helper (auto rollback on error)
  async transaction(callback) {
    await this.run('BEGIN TRANSACTION');
    try {
      const result = await callback(this);
      await this.run('COMMIT');
      return result;
    } catch (err) {
      await this.run('ROLLBACK');
      throw err;
    }
  }

  // 📊 Get database stats
  async getStats() {
    return {
      path: this.dbPath,
      isReady: this.isReady,
      version: 'v5.0',
    };
  }

  // 🔌 Close connection gracefully
  async close() {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          this.logger.error(`💥 Error closing database: ${err.message}`);
          reject(err);
        } else {
          this.logger.info('🛑 Database connection closed');
          this.isReady = false;
          this._emit('db.closed');
          resolve();
        }
      });
    });
  }
}

module.exports = { Database };
