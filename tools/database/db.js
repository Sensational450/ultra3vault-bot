const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

/**
 * 🗄️ Database v5.0
 * - Promise-based API (no more callbacks!)
 * - Automatic migration runner
 * - Connection pooling (SQLite handles internally)
 * - Event bus integration (emits 'db.query', 'db.error')
 * - Graceful shutdown
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

  // 🔌 Open database connection and run migrations
  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          this.logger.error(`💥 Failed to open database: ${err.message}`);
          reject(err);
          return;
        }
        this.logger.info(`✅ SQLite database connected: ${this.dbPath}`);
        await this._enableForeignKeys();
        await this._runMigrations();
        this.isReady = true;
        this._emit('db.ready', { path: this.dbPath });
        resolve(this.db);
      });
    });
  }

  // 🔧 Enable foreign key constraints
  async _enableForeignKeys() {
    await this.run('PRAGMA foreign_keys = ON');
    this.logger.debug('🔗 Foreign keys enabled');
  }

  // 📦 Run all pending migrations
  async _runMigrations() {
    await this._ensureMigrationsTable();
    const applied = await this._getAppliedMigrations();
    const migrationFiles = await this._getMigrationFiles();

    for (const file of migrationFiles) {
      if (!applied.includes(file)) {
        this.logger.info(`📦 Running migration: ${file}`);
        const sql = await fs.readFile(path.join(this.migrationsPath, file), 'utf8');
        try {
          await this.exec(sql);
          await this._recordMigration(file);
          this.logger.info(`✅ Migration ${file} applied`);
          this._emit('db.migration.applied', { file });
        } catch (err) {
          this.logger.error(`❌ Migration ${file} failed: ${err.message}`);
          throw err;
        }
      }
    }
    if (migrationFiles.length === 0) {
      this.logger.debug('📭 No pending migrations');
    }
  }

  async _ensureMigrationsTable() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  async _getAppliedMigrations() {
    const rows = await this.all(`SELECT name FROM migrations ORDER BY name`);
    return rows.map(row => row.name);
  }

  async _getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files.filter(f => f.endsWith('.sql')).sort();
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.logger.warn(`⚠️ Migrations folder not found: ${this.migrationsPath}`);
        return [];
      }
      throw err;
    }
  }

  async _recordMigration(name) {
    await this.run(`INSERT INTO migrations (name) VALUES (?)`, [name]);
  }

  // ⚡ Run a query (non-SELECT) – returns { changes, lastID }
  run(sql, params = []) {
    this._emitQuery(sql, params);
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          this._emitError(err, sql);
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      }.bind(this));
    });
  }

  // 🔍 Get first row of a SELECT query
  get(sql, params = []) {
    this._emitQuery(sql, params);
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          this._emitError(err, sql);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 📋 Get all rows of a SELECT query
  all(sql, params = []) {
    this._emitQuery(sql, params);
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          this._emitError(err, sql);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 🏃 Execute multiple SQL statements (for migrations)
  exec(sql) {
    this._emitQuery(sql, []);
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          this._emitError(err, sql);
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
    const { changes, lastID } = await this.run('SELECT 1'); // dummy
    return {
      path: this.dbPath,
      isReady: this.isReady,
      changes,
      lastID,
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
          resolve();
        }
      });
    });
  }

  // 📡 Internal: emit query event (for monitoring)
  _emitQuery(sql, params) {
    if (this.eventBus && this.eventBus.emit) {
      this.eventBus.emit('db.query', { sql, params, timestamp: Date.now() });
    }
  }

  // 📡 Internal: emit error event
  _emitError(err, sql) {
    if (this.eventBus && this.eventBus.emit) {
      this.eventBus.emit('db.error', { error: err.message, sql, timestamp: Date.now() });
    }
  }

  // 📡 Internal: emit other events
  _emit(event, data) {
    if (this.eventBus && this.eventBus.emit) {
      this.eventBus.emit(event, data);
    }
  }
}

// 📦 Export singleton or class – let the app decide
module.exports = { Database };
